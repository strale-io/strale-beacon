import type { CategoryResult, CheckResult, Tier } from "./types";

/**
 * Generate a consequence-focused, one-sentence summary for each category.
 *
 * Rules:
 * - No URLs, HTTP status codes, or probe logs
 * - Frame everything from the agent's perspective
 * - For passing: show the most interesting specific finding
 * - For failing: state the consequence, not the methodology
 * - For partial: acknowledge what works AND what doesn't
 * - One sentence max
 */

export function categorySummary(cat: CategoryResult): string {
  switch (cat.category_id) {
    case "discoverability":
      return discoverabilitySummary(cat);
    case "comprehension":
      return comprehensionSummary(cat);
    case "usability":
      return usabilitySummary(cat);
    case "stability":
      return stabilitySummary(cat);
    case "agent_experience":
    case "agent-experience":
      return agentExperienceSummary(cat);
    case "transactability":
      return transactabilitySummary(cat);
    default:
      return defaultSummary(cat);
  }
}

function findCheck(checks: CheckResult[], idFragment: string): CheckResult | undefined {
  return checks.find((c) => c.check_id.includes(idFragment));
}

function passed(checks: CheckResult[], idFragment: string): boolean {
  const check = findCheck(checks, idFragment);
  return check?.status === "pass";
}

function discoverabilitySummary(cat: CategoryResult): string {
  if (cat.tier === "green") {
    const parts: string[] = [];
    if (passed(cat.checks, "llms-txt")) parts.push("llms.txt");
    if (passed(cat.checks, "mcp-a2a")) parts.push("MCP/A2A endpoints");
    if (passed(cat.checks, "structured-data")) parts.push("structured data");
    if (passed(cat.checks, "robots-ai")) parts.push("AI crawlers allowed");
    if (parts.length === 0) return "Agents can discover this product through standard protocols.";
    return `Agents can discover this product through ${parts.join(", ")}.`;
  }

  if (cat.tier === "red") {
    const missing: string[] = [];
    if (!passed(cat.checks, "llms-txt")) missing.push("no llms.txt");
    if (!passed(cat.checks, "mcp-a2a")) missing.push("no MCP server or A2A Agent Card");
    if (!passed(cat.checks, "robots-ai")) missing.push("AI crawlers blocked");
    return `Agents cannot discover this product — ${missing.slice(0, 2).join(" and ")}.`;
  }

  // Yellow — mixed
  const working: string[] = [];
  const broken: string[] = [];
  if (passed(cat.checks, "llms-txt")) working.push("llms.txt found"); else broken.push("no llms.txt");
  if (passed(cat.checks, "mcp-a2a")) working.push("MCP/A2A present"); else broken.push("no MCP/A2A");
  if (passed(cat.checks, "robots-ai")) working.push("AI crawlers allowed"); else broken.push("some crawlers blocked");
  return `Partially discoverable: ${working[0] || "some signals present"}, but ${broken[0] || "gaps remain"}.`;
}

function comprehensionSummary(cat: CategoryResult): string {
  const openapi = findCheck(cat.checks, "openapi");
  const docs = findCheck(cat.checks, "doc-access");
  const schemaDrift = findCheck(cat.checks, "schema-drift");

  if (cat.tier === "green") {
    const parts: string[] = [];
    if (openapi?.status === "pass") {
      // Try to extract endpoint count from finding
      const match = openapi.finding?.match(/(\d+)\s*(documented\s+)?endpoint/i);
      parts.push(match ? `OpenAPI spec with ${match[1]} documented endpoints` : "OpenAPI spec found");
    }
    if (schemaDrift?.status === "pass") parts.push("no schema drift detected");
    if (docs?.status === "pass") parts.push("docs publicly accessible");
    const contentNeg = findCheck(cat.checks, "content-negotiation");
    if (contentNeg?.status === "pass") parts.push("content negotiation supported");
    return `Agents can understand this API — ${parts.join(", ")}.`;
  }

  if (cat.tier === "red") {
    if (!openapi || openapi.status === "fail") {
      return docs?.status === "fail"
        ? "No machine-readable API documentation found — agents cannot understand what this product does."
        : "No OpenAPI spec found — agents cannot programmatically discover endpoints and parameters.";
    }
    return "API documentation exists but isn't sufficient for agents to understand the API surface.";
  }

  // Yellow
  const issues: string[] = [];
  if (openapi?.status === "pass" && schemaDrift?.status !== "pass") issues.push("schema drift detected");
  if (docs?.status !== "pass") issues.push("documentation not publicly accessible");
  if (openapi?.status !== "pass") issues.push("no OpenAPI spec");
  const good = openapi?.status === "pass" ? "OpenAPI spec found" : docs?.status === "pass" ? "documentation accessible" : "some documentation present";
  return `${good}, but ${issues[0] || "gaps remain"}.`;
}

function usabilitySummary(cat: CategoryResult): string {
  const auth = findCheck(cat.checks, "auth");
  const signup = findCheck(cat.checks, "signup");
  const sandbox = findCheck(cat.checks, "sandbox");
  const errorQuality = findCheck(cat.checks, "error");

  if (cat.tier === "green") {
    const parts: string[] = [];
    if (auth?.status === "pass") parts.push("authentication documented");
    if (signup?.status === "pass") parts.push("low signup friction");
    if (sandbox?.status === "pass") parts.push("sandbox/free tier available");
    return `Agents can interact with this product — ${parts.join(", ")}.`;
  }

  if (cat.tier === "red") {
    const problems: string[] = [];
    if (auth?.status === "fail") problems.push("agents don't know how to authenticate");
    if (signup?.status === "fail") problems.push("high friction to get started");
    if (errorQuality?.status === "fail") problems.push("error responses aren't machine-readable");
    return problems.length > 0
      ? `Significant barriers to agent interaction — ${problems[0]}.`
      : "Agents face significant friction when trying to interact with this product.";
  }

  // Yellow
  const good = auth?.status === "pass" ? "auth documented" : sandbox?.status === "pass" ? "sandbox available" : "some access paths clear";
  const bad = auth?.status !== "pass" ? "auth unclear" : signup?.status !== "pass" ? "signup has friction" : "some friction remains";
  return `${good[0].toUpperCase() + good.slice(1)}, but ${bad}.`;
}

function stabilitySummary(cat: CategoryResult): string {
  const version = findCheck(cat.checks, "version");
  const changelog = findCheck(cat.checks, "changelog");
  const rateLimit = findCheck(cat.checks, "rate-limit");
  const security = findCheck(cat.checks, "security");

  if (cat.tier === "green") {
    const parts: string[] = [];
    if (version?.status === "pass") parts.push("API versioned");
    if (changelog?.status === "pass") parts.push("changelog active");
    if (rateLimit?.status === "pass") parts.push("rate limits documented");
    if (security?.status === "pass") parts.push("security headers present");
    const freshness = findCheck(cat.checks, "content-freshness");
    if (freshness?.status === "pass") parts.push("freshness signals present");
    return `Agents can depend on this product — ${parts.join(", ")}.`;
  }

  if (cat.tier === "red") {
    const missing: string[] = [];
    if (version?.status !== "pass") missing.push("no API versioning");
    if (changelog?.status !== "pass") missing.push("no changelog or status page");
    return `Agents can't assess reliability — ${missing.slice(0, 2).join(" and ")}.`;
  }

  // Yellow
  const good = version?.status === "pass" ? "API versioned" : security?.status === "pass" ? "security headers present" : "some stability signals";
  const bad = changelog?.status !== "pass" ? "no changelog or status page" : rateLimit?.status !== "pass" ? "rate limits undocumented" : "some signals missing";
  return `${good[0].toUpperCase() + good.slice(1)}, but ${bad}.`;
}

function agentExperienceSummary(cat: CategoryResult): string {
  const firstContact = findCheck(cat.checks, "first-contact");
  const docNav = findCheck(cat.checks, "navigab");
  const mcpFunc = findCheck(cat.checks, "mcp-functional");
  const support = findCheck(cat.checks, "support");

  if (cat.tier === "green") {
    const parts: string[] = [];
    if (mcpFunc?.status === "pass") {
      // Try to extract tool count
      const match = mcpFunc.finding?.match(/(\d+)\s*tools?/i);
      parts.push(match ? `MCP server verified with ${match[1]} tools` : "MCP server verified");
    }
    if (firstContact?.status === "pass") parts.push("structured first-contact response");
    if (docNav?.status === "pass") parts.push("docs reachable");
    if (support?.status === "pass") parts.push("support path available");
    return `Agents get a smooth experience — ${parts.join(", ")}.`;
  }

  if (cat.tier === "red") {
    if (firstContact?.status === "fail") {
      return "Agents arriving at this product hit a dead end — no structured response or navigation to documentation.";
    }
    return "Agents have a poor experience — unclear first contact and no clear path to documentation.";
  }

  // Yellow
  const good = firstContact?.status === "pass" ? "structured first contact" : mcpFunc?.status === "pass" ? "MCP server responds" : "some agent paths work";
  const bad = docNav?.status !== "pass" ? "documentation hard to reach" : support?.status !== "pass" ? "no programmatic support path" : "some gaps remain";
  return `${good[0].toUpperCase() + good.slice(1)}, but ${bad}.`;
}

function transactabilitySummary(cat: CategoryResult): string {
  const pricing = findCheck(cat.checks, "pricing-structured");
  const signup = findCheck(cat.checks, "self-serve");
  const checkout = findCheck(cat.checks, "checkout");
  const billing = findCheck(cat.checks, "usage-billing");
  const freeTier = findCheck(cat.checks, "free-tier");

  if (cat.tier === "green") {
    const parts: string[] = [];
    if (pricing?.status === "pass") parts.push("machine-readable pricing");
    if (signup?.status === "pass") parts.push("self-serve signup");
    if (checkout?.status === "pass") parts.push("programmatic checkout");
    if (freeTier?.status === "pass") parts.push("free tier available");
    return `Agents can transact with this product — ${parts.join(", ")}.`;
  }

  if (cat.tier === "red") {
    const missing: string[] = [];
    if (pricing?.status === "fail") missing.push("no machine-readable pricing");
    if (signup?.status === "fail") missing.push("no self-serve signup");
    return `Agents can't do business here — ${missing.slice(0, 2).join(" and ")}.`;
  }

  // Yellow
  const good = pricing?.status === "pass" ? "pricing is machine-readable" : signup?.status === "pass" ? "self-serve signup available" : "some transaction signals";
  const bad = pricing?.status !== "pass" ? "pricing isn't machine-readable" : signup?.status !== "pass" ? "no self-serve onboarding" : "checkout isn't agent-compatible";
  return `${good[0].toUpperCase() + good.slice(1)}, but ${bad}.`;
}

function defaultSummary(cat: CategoryResult): string {
  const passCount = cat.checks.filter((c) => c.status === "pass").length;
  const total = cat.checks.length;
  if (cat.tier === "green") return `${passCount} of ${total} checks passed.`;
  if (cat.tier === "red") return `Only ${passCount} of ${total} checks passed — significant gaps found.`;
  return `${passCount} of ${total} checks passed — some improvements needed.`;
}

/**
 * Generate action-plan-style verb-phrase title for a check.
 */
const ACTION_TITLES: Record<string, string> = {
  "disc-llms-txt": "Add an llms.txt file describing your capabilities",
  "disc-robots-ai": "Allow AI crawlers in your robots.txt",
  "disc-structured-data": "Add Schema.org structured data to your responses",
  "disc-sitemap": "Add API documentation pages to your sitemap",
  "disc-mcp-a2a": "Publish an MCP server or A2A Agent Card",
  "comp-openapi": "Publish an OpenAPI specification",
  "comp-doc-access": "Make your API documentation publicly accessible",
  "comp-doc-completeness": "Document all API endpoints with descriptions and parameters",
  "comp-pricing": "Make pricing data machine-readable",
  "comp-schema-drift": "Align your OpenAPI spec with actual API responses",
  "use-auth": "Document your API authentication method",
  "use-signup-friction": "Reduce signup friction for programmatic access",
  "use-sandbox": "Provide a sandbox or free tier for testing",
  "use-error-quality": "Return structured JSON error responses",
  "stab-versioning": "Version your API with clear deprecation policy",
  "stab-changelog": "Maintain a changelog or status page",
  "stab-rate-limit": "Document your API rate limits",
  "stab-tos-agent": "Clarify your terms of service for automated access",
  "stab-security-headers": "Add security headers to all responses",
  "exp-first-contact": "Return a JSON welcome response at your API root",
  "exp-doc-navigability": "Make documentation reachable within 2 clicks from root",
  "exp-response-consistency": "Ensure all endpoints return consistent JSON responses",
  "exp-support-path": "Provide a programmatic way to report issues",
  "exp-mcp-functional": "Ensure your MCP server handles initialize and tools/list",
  "ax-mcp-functional": "Ensure your MCP server handles initialize and tools/list",
  "comp-content-negotiation": "Add content negotiation to serve markdown when requested",
  "stab-content-freshness": "Add freshness headers (Last-Modified, ETag) to responses",
  "trans-pricing-structured": "Make your pricing machine-readable with Schema.org Offer markup",
  "trans-self-serve-signup": "Enable self-serve signup with programmatic API key generation",
  "trans-checkout-flow": "Implement agent-compatible checkout (Stripe ACP or API-based)",
  "trans-usage-billing": "Add rate limit headers and usage metadata to API responses",
  "trans-free-tier": "Offer a free tier or trial for agent evaluation",
};

export function getActionTitle(checkId: string, fallbackName: string): string {
  return ACTION_TITLES[checkId] || fallbackName;
}
