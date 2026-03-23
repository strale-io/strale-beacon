/**
 * Scan runner — orchestrates all checks for a given URL.
 *
 * Two-pass design:
 *   Pass 1 (discovery): checks that produce shared context (homepage fetch,
 *           robots.txt, OpenAPI spec, documentation URLs, API responses)
 *   Pass 2 (analysis): checks that consume shared context
 *
 * Within each pass, checks run in parallel via Promise.allSettled with
 * a per-check timeout of 10 seconds.
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
        details: { timeout: true },
      });
    }, PER_CHECK_TIMEOUT_MS);

    runCheck(ctx, check)
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        resolve({
          check_id: check.id,
          name: check.name,
          status: "warn",
          finding: `Check failed: ${err instanceof Error ? err.message : String(err)}`,
          recommendation: check.recommendation,
          weight: check.weight,
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

  // Collect results keyed by check_id
  const resultsByCheckId = new Map<string, CheckResult>();

  // --- Pass 1: discovery checks in parallel ---
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
      });
    }
  }

  // --- Pass 2: analysis checks in parallel ---
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
        });
      }
    }
  } else {
    // Not enough time — mark remaining as timed out
    for (const item of analysisItems) {
      if (!resultsByCheckId.has(item.check.id)) {
        resultsByCheckId.set(item.check.id, {
          check_id: item.check.id,
          name: item.check.name,
          status: "warn",
          finding: "Check skipped — total scan time limit reached.",
          recommendation: item.check.recommendation,
          weight: item.check.weight,
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
