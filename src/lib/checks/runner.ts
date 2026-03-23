/**
 * Scan runner — orchestrates all checks for a given URL.
 *
 * Three-phase design:
 *   Phase 0 (detect): Fetch root URL, detect domain type (API vs website),
 *           extract cross-domain links
 *   Phase 1 (discovery): checks that produce shared context
 *   Phase 2 (analysis): checks that consume shared context
 */

import type {
  CheckDefinition,
  CheckResult,
  CategoryDefinition,
  CategoryResult,
  ScanResult,
  ScanContext,
} from "./types";
import { createScanContext } from "./types";
import { getCheckRegistry } from "./registry";
import { runCheck } from "./handlers";
import { scoreCategoryTier } from "./scoring";
import { beaconFetch } from "./fetch";

const PER_CHECK_TIMEOUT_MS = 10_000;
const TOTAL_SCAN_TIMEOUT_MS = 30_000;

/** Check IDs that produce shared context — must run first. */
const DISCOVERY_CHECKS = new Set([
  "disc-llms-txt",
  "disc-ai-crawler-policy",
  "disc-structured-data",
  "disc-sitemap",
  "disc-mcp-a2a",
  "comp-openapi",
  "comp-api-docs",
  "use-error-quality",       // populates apiResponses
  "stab-security",           // populates homepage headers
]);

/** Detect whether the domain serves an API (JSON) or a website (HTML) at root */
async function detectDomainType(ctx: ScanContext): Promise<void> {
  const result = await beaconFetch(ctx.baseUrl);
  if (!result.ok) {
    ctx.domainType = "unknown";
    return;
  }

  const contentType = result.headers["content-type"] || "";

  if (contentType.includes("json")) {
    ctx.domainType = "api";
    ctx.homepageHtml = result.body;
    ctx.homepageHeaders = result.headers;
    ctx.fetchedPages.set(ctx.baseUrl, result.body);
    ctx.fetchedHeaders.set(ctx.baseUrl, result.headers);

    // Extract cross-domain links from JSON root
    try {
      const json = JSON.parse(result.body);
      extractLinksFromJson(json, ctx, ctx.baseUrl);
    } catch { /* not valid JSON despite content-type */ }
  } else {
    ctx.domainType = "website";
    ctx.homepageHtml = result.body;
    ctx.homepageHeaders = result.headers;
    ctx.fetchedPages.set(ctx.baseUrl, result.body);
    ctx.fetchedHeaders.set(ctx.baseUrl, result.headers);

    // Extract cross-domain links from HTML
    extractLinksFromHtml(result.body, ctx, ctx.baseUrl);
  }
}

/** Extract links from a JSON object, adding cross-domain ones to context */
function extractLinksFromJson(obj: unknown, ctx: ScanContext, source: string): void {
  if (!obj || typeof obj !== "object") return;
  const baseDomain = new URL(ctx.baseUrl).hostname;

  const process = (key: string, val: unknown) => {
    if (typeof val === "string" && /^https?:\/\//.test(val)) {
      try {
        const domain = new URL(val).hostname;
        if (domain !== baseDomain) {
          ctx.crossDomainLinks.push({ href: val, label: key, source });
        }
      } catch { /* ignore */ }
    } else if (typeof val === "object" && val !== null) {
      extractLinksFromJson(val, ctx, source);
    }
  };

  if (Array.isArray(obj)) {
    obj.forEach((item, i) => process(String(i), item));
  } else {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      process(k, v);
    }
  }
}

/** Extract cross-domain links from HTML */
function extractLinksFromHtml(html: string, ctx: ScanContext, source: string): void {
  const baseDomain = new URL(ctx.baseUrl).hostname;
  const linkRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    try {
      const url = new URL(match[1]);
      if (url.hostname !== baseDomain) {
        // Try to get label from surrounding text
        const start = Math.max(0, match.index - 100);
        const context = html.substring(start, match.index + match[0].length + 50);
        const labelMatch = context.match(/>([^<]{1,60})</);
        const label = labelMatch ? labelMatch[1].trim() : url.pathname;
        ctx.crossDomainLinks.push({ href: match[1], label, source });
      }
    } catch { /* ignore invalid URLs */ }
  }
}

/** Wrap a check in a per-check timeout */
async function runCheckWithTimeout(
  ctx: ScanContext,
  check: CheckDefinition
): Promise<CheckResult> {
  return new Promise<CheckResult>((resolve) => {
    const timer = setTimeout(() => {
      resolve({
        check_id: check.id,
        name: check.name,
        status: "warn",
        finding: `Check timed out after ${PER_CHECK_TIMEOUT_MS / 1000}s.`,
        recommendation: check.recommendation,
        weight: check.weight,
        probes: [],
        detectionMethod: check.how_we_check,
        confidence: "high",
        foundButUnrecognized: false,
        details: { timeout: true },
      });
    }, PER_CHECK_TIMEOUT_MS);

    runCheck(ctx, check)
      .then((result) => { clearTimeout(timer); resolve(result); })
      .catch((err) => {
        clearTimeout(timer);
        resolve({
          check_id: check.id,
          name: check.name,
          status: "warn",
          finding: `Check failed: ${err instanceof Error ? err.message : String(err)}`,
          recommendation: check.recommendation,
          weight: check.weight,
          probes: [],
          detectionMethod: check.how_we_check,
          confidence: "high",
          foundButUnrecognized: false,
          details: { error: true },
        });
      });
  });
}

/** Run all checks for a URL and return structured results. */
export async function runScan(url: string): Promise<ScanResult> {
  const startTime = Date.now();
  const registry = getCheckRegistry();
  const ctx = createScanContext(url);

  // Phase 0: detect domain type and extract cross-domain links
  await detectDomainType(ctx);

  // Collect all checks, split into discovery and analysis passes
  const allCategoryChecks: Array<{
    category: CategoryDefinition;
    check: CheckDefinition;
  }> = [];

  for (const category of registry.categories) {
    for (const check of category.checks) {
      allCategoryChecks.push({ category, check });
    }
  }

  const discoveryItems = allCategoryChecks.filter((item) =>
    DISCOVERY_CHECKS.has(item.check.id)
  );
  const analysisItems = allCategoryChecks.filter(
    (item) => !DISCOVERY_CHECKS.has(item.check.id)
  );

  const resultsByCheckId = new Map<string, CheckResult>();

  // --- Phase 1: discovery checks in parallel ---
  const discoveryResults = await Promise.allSettled(
    discoveryItems.map((item) => runCheckWithTimeout(ctx, item.check))
  );

  for (let i = 0; i < discoveryResults.length; i++) {
    const settlement = discoveryResults[i];
    const checkId = discoveryItems[i].check.id;
    if (settlement.status === "fulfilled") {
      resultsByCheckId.set(checkId, settlement.value);
    } else {
      resultsByCheckId.set(checkId, {
        check_id: checkId,
        name: discoveryItems[i].check.name,
        status: "warn",
        finding: `Check failed unexpectedly: ${settlement.reason}`,
        recommendation: discoveryItems[i].check.recommendation,
        weight: discoveryItems[i].check.weight,
        probes: [],
        detectionMethod: discoveryItems[i].check.how_we_check,
        confidence: "high",
        foundButUnrecognized: false,
      });
    }
  }

  // --- Phase 2: analysis checks in parallel ---
  const remainingTimeMs = TOTAL_SCAN_TIMEOUT_MS - (Date.now() - startTime);
  if (remainingTimeMs > 2000) {
    const analysisResults = await Promise.allSettled(
      analysisItems.map((item) => runCheckWithTimeout(ctx, item.check))
    );

    for (let i = 0; i < analysisResults.length; i++) {
      const settlement = analysisResults[i];
      const checkId = analysisItems[i].check.id;
      if (settlement.status === "fulfilled") {
        resultsByCheckId.set(checkId, settlement.value);
      } else {
        resultsByCheckId.set(checkId, {
          check_id: checkId,
          name: analysisItems[i].check.name,
          status: "warn",
          finding: `Check failed unexpectedly: ${settlement.reason}`,
          recommendation: analysisItems[i].check.recommendation,
          weight: analysisItems[i].check.weight,
          probes: [],
          detectionMethod: analysisItems[i].check.how_we_check,
          confidence: "high",
          foundButUnrecognized: false,
        });
      }
    }
  } else {
    for (const item of analysisItems) {
      if (!resultsByCheckId.has(item.check.id)) {
        resultsByCheckId.set(item.check.id, {
          check_id: item.check.id,
          name: item.check.name,
          status: "warn",
          finding: "Check skipped — total scan time limit reached.",
          recommendation: item.check.recommendation,
          weight: item.check.weight,
          probes: [],
          detectionMethod: item.check.how_we_check,
          confidence: "high",
          foundButUnrecognized: false,
          details: { skipped: true },
        });
      }
    }
  }

  // --- Assemble category results ---
  const categories: CategoryResult[] = registry.categories.map((cat) => {
    const checkResults = cat.checks
      .map((c) => resultsByCheckId.get(c.id))
      .filter((r): r is CheckResult => !!r);

    return {
      category_id: cat.id,
      label: cat.label,
      question: cat.question,
      tier: scoreCategoryTier(cat.id, checkResults),
      checks: checkResults,
    };
  });

  const domain = new URL(url).hostname;

  return {
    url,
    domain,
    scanned_at: new Date().toISOString(),
    scan_duration_ms: Date.now() - startTime,
    categories,
    scan_version: registry.version,
  };
}
