/**
 * Intelligence extraction — passive data capture from scan results.
 * Extracts product metadata, tech stack signals, capability gaps, and
 * Strale integration status from scan context and results.
 *
 * None of this data is user-facing — it's internal analytics for Strale.
 */

import type { ScanResult, ScanContext, CheckResult } from "./checks/types";

export interface ScanIntelligence {
  product_category: string | null;
  tech_stack: string[];
  has_strale_integration: boolean;
  failed_checks: string[];
  capability_gaps: string[];
}

// ─── Check ID → Capability Gap mapping ────────────────────────────────────

const GAP_MAP: Record<string, string> = {
  "disc-mcp-a2a": "mcp-setup",
  "comp-openapi": "api-documentation",
  "disc-structured-data": "structured-data-generation",
  "trans-pricing-structured": "pricing-structuring",
  "use-auth": "auth-documentation",
  "stab-security": "security-audit",
  "stab-security-headers": "security-audit",
  "stab-rate-limit": "rate-limiting",
  "trans-free-tier": "free-tier-setup",
  "exp-first-contact": "api-welcome-response",
  "comp-doc-access": "api-documentation",
  "comp-doc-completeness": "api-documentation",
  "comp-schema-drift": "api-documentation",
  "use-error-quality": "error-handling",
  "stab-versioning": "api-versioning",
  "stab-changelog": "changelog-setup",
  "disc-llms-txt": "llms-txt-setup",
  "disc-ai-crawler-policy": "crawler-policy",
  "use-signup-friction": "self-serve-onboarding",
  "trans-self-serve-signup": "self-serve-onboarding",
  "trans-checkout-flow": "programmatic-checkout",
};

// ─── Category keyword patterns ────────────────────────────────────────────

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /fintech|financial|banking|payment|invoice/i, category: "fintech" },
  { pattern: /healthcare|health|medical|pharma/i, category: "healthcare" },
  { pattern: /developer\s*tool|devtool|sdk|api\s*platform|infrastructure/i, category: "developer-tools" },
  { pattern: /compliance|regulatory|legal|kyc|aml/i, category: "compliance" },
  { pattern: /e-?commerce|shopping|retail|marketplace/i, category: "e-commerce" },
  { pattern: /analytics|data|intelligence|insight/i, category: "analytics" },
  { pattern: /security|cyber|auth|identity/i, category: "security" },
  { pattern: /communication|messaging|email|chat/i, category: "communication" },
  { pattern: /productivity|project|task|workflow/i, category: "productivity" },
  { pattern: /ai|machine\s*learning|nlp|llm/i, category: "ai-ml" },
  { pattern: /crm|sales|marketing|lead/i, category: "sales-marketing" },
  { pattern: /hr|recruiting|talent|hiring/i, category: "hr" },
  { pattern: /cloud|hosting|deploy|server/i, category: "cloud-infrastructure" },
];

// ─── Framework detection patterns ─────────────────────────────────────────

const FRAMEWORK_PATTERNS: Array<{ pattern: RegExp; name: string; source: "html" | "header" }> = [
  // HTML-based detection
  { pattern: /__next|_next\/static|next\/image/i, name: "nextjs", source: "html" },
  { pattern: /__nuxt|_nuxt\//i, name: "nuxt", source: "html" },
  { pattern: /\bember\b.*\.js|ember-cli/i, name: "ember", source: "html" },
  { pattern: /ng-version|angular/i, name: "angular", source: "html" },
  { pattern: /react.*\.js|__REACT|data-reactroot/i, name: "react", source: "html" },
  { pattern: /vue\.js|__vue|v-[a-z]+=/i, name: "vue", source: "html" },
  { pattern: /svelte|__svelte/i, name: "svelte", source: "html" },
  { pattern: /gatsby/i, name: "gatsby", source: "html" },
  { pattern: /wp-content|wordpress/i, name: "wordpress", source: "html" },
  { pattern: /shopify/i, name: "shopify", source: "html" },
  { pattern: /wix\.com/i, name: "wix", source: "html" },
  { pattern: /squarespace/i, name: "squarespace", source: "html" },
  { pattern: /webflow/i, name: "webflow", source: "html" },
  { pattern: /generator.*hugo/i, name: "hugo", source: "html" },
  { pattern: /generator.*jekyll/i, name: "jekyll", source: "html" },
  // Header-based detection
  { pattern: /express/i, name: "express", source: "header" },
  { pattern: /rails|phusion|passenger/i, name: "rails", source: "header" },
  { pattern: /django/i, name: "django", source: "header" },
  { pattern: /laravel/i, name: "laravel", source: "header" },
  { pattern: /flask/i, name: "flask", source: "header" },
  { pattern: /kestrel|asp\.net/i, name: "aspnet", source: "header" },
  { pattern: /cloudflare/i, name: "cloudflare", source: "header" },
  { pattern: /vercel/i, name: "vercel", source: "header" },
  { pattern: /netlify/i, name: "netlify", source: "header" },
  { pattern: /nginx/i, name: "nginx", source: "header" },
  { pattern: /apache/i, name: "apache", source: "header" },
  { pattern: /node/i, name: "node", source: "header" },
  { pattern: /php/i, name: "php", source: "header" },
  { pattern: /gunicorn/i, name: "python", source: "header" },
];

// ─── Main extraction function ─────────────────────────────────────────────

export function extractIntelligence(
  result: ScanResult,
  context: ScanContext
): ScanIntelligence {
  return {
    product_category: extractProductCategory(context),
    tech_stack: extractTechStack(context),
    has_strale_integration: detectStraleIntegration(context),
    failed_checks: extractFailedChecks(result),
    capability_gaps: extractCapabilityGaps(result),
  };
}

// ─── Product category extraction ──────────────────────────────────────────

function extractProductCategory(ctx: ScanContext): string | null {
  const html = ctx.homepageHtml || "";

  // 1. Check JSON-LD for @type and applicationCategory
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const str = JSON.stringify(data);

      // Check applicationCategory first (most specific)
      const catMatch = str.match(/"applicationCategory"\s*:\s*"([^"]+)"/i);
      if (catMatch) return catMatch[1];

      // Check @type
      const typeMatch = str.match(/"@type"\s*:\s*"([^"]+)"/i);
      if (typeMatch) {
        const type = typeMatch[1];
        if (type !== "WebSite" && type !== "WebPage" && type !== "Organization") {
          return type;
        }
      }
    } catch { /* ignore */ }
  }

  // 2. For API domains, check root JSON
  if (ctx.domainType === "api" && html) {
    try {
      const json = JSON.parse(html);
      const str = JSON.stringify(json);
      const catMatch = str.match(/"applicationCategory"\s*:\s*"([^"]+)"/i);
      if (catMatch) return catMatch[1];
      const typeMatch = str.match(/"@type"\s*:\s*"([^"]+)"/i);
      if (typeMatch) return typeMatch[1];
    } catch { /* not JSON */ }
  }

  // 3. Check meta keywords
  const keywordsMatch = html.match(/<meta[^>]*name=["']keywords["'][^>]*content=["']([^"']+)["']/i);
  if (keywordsMatch) {
    const keywords = keywordsMatch[1].toLowerCase();
    for (const { pattern, category } of CATEGORY_PATTERNS) {
      if (pattern.test(keywords)) return category;
    }
  }

  // 4. Check meta description for category keywords
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
  if (descMatch) {
    for (const { pattern, category } of CATEGORY_PATTERNS) {
      if (pattern.test(descMatch[1])) return category;
    }
  }

  return null;
}

// ─── Tech stack detection ─────────────────────────────────────────────────

function extractTechStack(ctx: ScanContext): string[] {
  const stack = new Set<string>();
  const html = ctx.homepageHtml || "";
  const headers = ctx.homepageHeaders || {};

  // Check headers
  const headerStr = [
    headers["x-powered-by"] || "",
    headers["server"] || "",
    headers["x-generator"] || "",
    headers["via"] || "",
  ].join(" ");

  for (const { pattern, name, source } of FRAMEWORK_PATTERNS) {
    if (source === "header" && pattern.test(headerStr)) {
      stack.add(name);
    }
    if (source === "html" && pattern.test(html)) {
      stack.add(name);
    }
  }

  return [...stack].sort();
}

// ─── Strale integration detection ─────────────────────────────────────────

function detectStraleIntegration(ctx: ScanContext): boolean {
  const html = ctx.homepageHtml || "";

  // Check homepage for strale references
  if (/strale\.io|strale\.dev/i.test(html)) return true;

  // Check cross-domain links
  for (const link of ctx.crossDomainLinks) {
    if (/strale/i.test(link.href)) return true;
  }

  // Check MCP manifest
  if (ctx.mcpManifest) {
    if (/strale/i.test(JSON.stringify(ctx.mcpManifest))) return true;
  }

  return false;
}

// ─── Failed checks extraction ─────────────────────────────────────────────

function extractFailedChecks(result: ScanResult): string[] {
  const failed: string[] = [];
  for (const cat of result.categories) {
    for (const check of cat.checks) {
      if (check.status === "fail" || check.status === "warn") {
        failed.push(check.check_id);
      }
    }
  }
  return failed;
}

// ─── Capability gaps mapping ──────────────────────────────────────────────

function extractCapabilityGaps(result: ScanResult): string[] {
  const gaps = new Set<string>();
  for (const cat of result.categories) {
    for (const check of cat.checks) {
      if (check.status === "fail" || check.status === "warn") {
        const gap = GAP_MAP[check.check_id];
        if (gap) gaps.add(gap);
      }
    }
  }
  return [...gaps].sort();
}

// ─── Fix tracking (compare two scans) ─────────────────────────────────────

export function computeCheckDiff(
  previousFailedChecks: string[] | null,
  currentFailedChecks: string[]
): { checks_fixed: string[]; checks_regressed: string[] } {
  if (!previousFailedChecks) {
    return { checks_fixed: [], checks_regressed: [] };
  }

  const prevSet = new Set(previousFailedChecks);
  const currSet = new Set(currentFailedChecks);

  const checks_fixed = previousFailedChecks.filter((id) => !currSet.has(id));
  const checks_regressed = currentFailedChecks.filter((id) => !prevSet.has(id));

  return { checks_fixed, checks_regressed };
}
