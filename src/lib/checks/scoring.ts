/**
 * Scoring logic — determines tier (green/yellow/red) per category
 * based on check results.
 *
 * Each category has its own scoring rules derived from the thresholds
 * in check-registry.yaml, implemented as code for nuance.
 */

import type { CheckResult, Tier } from "./types";

/** Helper: check if a specific check passed */
function checkPassed(results: CheckResult[], checkId: string): boolean {
  return results.some((r) => r.check_id === checkId && r.status === "pass");
}

/** Helper: check if a specific check didn't fail (passed or warned) */
function checkNotFailed(results: CheckResult[], checkId: string): boolean {
  return results.some((r) => r.check_id === checkId && r.status !== "fail");
}

/** Helper: count passes, warns, and fails */
function counts(results: CheckResult[]): { pass: number; warn: number; fail: number } {
  return {
    pass: results.filter((r) => r.status === "pass").length,
    warn: results.filter((r) => r.status === "warn").length,
    fail: results.filter((r) => r.status === "fail").length,
  };
}

/** Helper: count high-weight failures */
function highWeightFailures(results: CheckResult[]): number {
  return results.filter((r) => r.status === "fail" && r.weight === "high").length;
}

/**
 * Discoverability:
 * Green if llms.txt exists AND AI crawlers allowed AND (structured data OR MCP/A2A)
 * Red if none of these
 * Yellow otherwise
 */
function scoreDiscoverability(results: CheckResult[]): Tier {
  const llmsTxt = checkPassed(results, "disc-llms-txt");
  const crawlers = checkNotFailed(results, "disc-ai-crawler-policy");
  const structuredData = checkPassed(results, "disc-structured-data");
  const mcpA2a = checkPassed(results, "disc-mcp-a2a");

  if (llmsTxt && crawlers && (structuredData || mcpA2a)) return "green";

  const { pass: passCount } = counts(results);
  if (passCount === 0) return "red";

  return "yellow";
}

/**
 * Comprehension:
 * Green if OpenAPI spec exists with good completeness AND docs accessible
 * Red if no API spec AND docs require auth
 * Yellow otherwise
 */
function scoreComprehension(results: CheckResult[]): Tier {
  const openapi = checkPassed(results, "comp-openapi");
  const docs = checkPassed(results, "comp-api-docs");
  const completeness = checkPassed(results, "comp-endpoint-completeness");
  const schemaDriftFailed = results.some((r) => r.check_id === "comp-schema-drift" && r.status === "fail");

  // Schema drift failure caps at yellow — a spec that lies is worse than no spec
  if (schemaDriftFailed) return "yellow";

  if (openapi && (completeness || docs)) return "green";

  const { fail: failCount } = counts(results);
  if (failCount >= 3) return "red";

  const { pass: passCount } = counts(results);
  if (passCount === 0 && failCount >= 2) return "red";

  return "yellow";
}

/**
 * Usability:
 * Green if standard auth documented AND low friction AND (sandbox OR free tier)
 * Red if auth unclear AND high friction AND no test environment
 * Yellow otherwise
 */
function scoreUsability(results: CheckResult[]): Tier {
  const auth = checkPassed(results, "use-auth-docs");
  const lowFriction = checkNotFailed(results, "use-signup-friction");
  const sandbox = checkPassed(results, "use-sandbox");
  const errorQuality = checkPassed(results, "use-error-quality");

  if (auth && lowFriction && (sandbox || errorQuality)) return "green";

  if (highWeightFailures(results) >= 2) return "red";

  const { pass: passCount } = counts(results);
  if (passCount === 0) return "red";

  return "yellow";
}

/**
 * Stability:
 * Green if API versioned AND (changelog OR status page) AND rate limits AND HTTPS
 * Red if no versioning AND no changelog AND no status
 * Yellow otherwise
 */
function scoreStability(results: CheckResult[]): Tier {
  const versioning = checkPassed(results, "stab-versioning");
  const changelog = checkPassed(results, "stab-changelog-status");
  const rateLimits = checkNotFailed(results, "stab-rate-limits");
  const security = checkPassed(results, "stab-security");

  if (versioning && changelog && rateLimits && security) return "green";

  const { fail: failCount } = counts(results);
  if (failCount >= 3) return "red";

  const { pass: passCount } = counts(results);
  if (passCount === 0) return "red";

  return "yellow";
}

/**
 * Agent Experience:
 * Green if first contact returns JSON AND docs reachable ≤2 hops AND support path
 * Red if first contact returns HTML error or timeout AND docs unreachable
 * Yellow otherwise
 */
function scoreAgentExperience(results: CheckResult[]): Tier {
  const firstContact = checkPassed(results, "ax-first-contact");
  const docNav = checkPassed(results, "ax-doc-navigability");
  const responseConsistency = checkPassed(results, "ax-response-consistency");
  const supportPaths = checkNotFailed(results, "ax-support-paths");

  if (firstContact && docNav && (responseConsistency || supportPaths)) return "green";

  if (highWeightFailures(results) >= 1 && counts(results).fail >= 2) return "red";

  const { pass: passCount } = counts(results);
  if (passCount === 0) return "red";

  return "yellow";
}

/** Dispatch to the correct category scorer */
const CATEGORY_SCORERS: Record<string, (results: CheckResult[]) => Tier> = {
  discoverability: scoreDiscoverability,
  comprehension: scoreComprehension,
  usability: scoreUsability,
  stability: scoreStability,
  "agent-experience": scoreAgentExperience,
};

/** Score a category's tier based on its check results. */
export function scoreCategoryTier(categoryId: string, results: CheckResult[]): Tier {
  const scorer = CATEGORY_SCORERS[categoryId];
  if (!scorer) {
    // Fallback: use simple pass/fail ratio
    const { pass: p, fail: f } = counts(results);
    if (f === 0) return "green";
    if (p === 0) return "red";
    return "yellow";
  }
  return scorer(results);
}
