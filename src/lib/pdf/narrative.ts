import type { ScanResult, CategoryResult, CheckResult } from "../checks/types";

/**
 * Generate a detailed, finding-specific narrative from scan results.
 * References check names, real numbers, and specific discoveries.
 * Writes from the agent's perspective: what can agents DO with this product?
 * 4-8 sentences total, 1-2 per category.
 */
export function generateNarrative(result: ScanResult): string {
  const greenCount = result.categories.filter((c) => c.tier === "green").length;
  const total = result.categories.length;

  const parts: string[] = [];

  // Opening — overall posture with specificity
  parts.push(buildOpening(result.domain, greenCount, total));

  // Per-category sentences — only include categories with something interesting to say
  for (const cat of result.categories) {
    const sentence = buildCategorySentence(cat, result.domain);
    if (sentence) parts.push(sentence);
  }

  return parts.join(" ");
}

function buildOpening(domain: string, greenCount: number, total: number): string {
  if (greenCount >= total - 1) {
    return `${domain} is well-prepared for AI agent interaction, with ${greenCount} of ${total} areas rated agent-ready.`;
  }
  if (greenCount >= Math.ceil(total / 2)) {
    return `${domain} has a mixed agent-readiness posture — ${greenCount} of ${total} areas meet the agent-ready threshold, with meaningful gaps in the rest.`;
  }
  if (greenCount >= 1) {
    return `${domain} has limited agent-readiness, with only ${greenCount} of ${total} areas meeting the agent-ready threshold.`;
  }
  return `${domain} is not currently prepared for AI agent interaction — none of the ${total} assessed areas meet the agent-ready threshold.`;
}

// ---------------------------------------------------------------------------
// Per-category sentence builders
// ---------------------------------------------------------------------------

function buildCategorySentence(cat: CategoryResult, domain: string): string {
  switch (cat.category_id) {
    case "discoverability":
      return discoverabilityNarrative(cat, domain);
    case "comprehension":
      return comprehensionNarrative(cat, domain);
    case "usability":
      return usabilityNarrative(cat, domain);
    case "stability":
      return stabilityNarrative(cat, domain);
    case "agent_experience":
    case "agent-experience":
      return agentExperienceNarrative(cat, domain);
    case "transactability":
      return transactabilityNarrative(cat, domain);
    default:
      return "";
  }
}

// --- helpers ---------------------------------------------------------------

function find(checks: CheckResult[], idFragment: string): CheckResult | undefined {
  return checks.find((c) => c.check_id.includes(idFragment));
}

/** Extract a number from a check's finding text using a regex pattern */
function extractNumber(check: CheckResult | undefined, pattern: RegExp): string | null {
  if (!check?.finding) return null;
  const m = check.finding.match(pattern);
  return m ? m[1] : null;
}

/** Extract a quoted or parenthesised list from a finding */
function extractList(check: CheckResult | undefined, pattern: RegExp): string | null {
  if (!check?.finding) return null;
  const m = check.finding.match(pattern);
  return m ? m[1] : null;
}

/** Get detail value from check details */
function detail(check: CheckResult | undefined, key: string): unknown {
  return check?.details?.[key];
}

// --- category narratives ---------------------------------------------------

function discoverabilityNarrative(cat: CategoryResult, domain: string): string {
  const llms = find(cat.checks, "llms-txt");
  const robots = find(cat.checks, "robots-ai");
  const structured = find(cat.checks, "structured-data");
  const mcp = find(cat.checks, "mcp-a2a");
  const sitemap = find(cat.checks, "sitemap");

  if (cat.tier === "green" || cat.tier === "yellow") {
    const signals: string[] = [];

    if (llms?.status === "pass") {
      const endpointCount = extractNumber(llms, /(\d+)\s*(?:documented\s+)?endpoint/i);
      signals.push(endpointCount ? `its llms.txt file, which lists ${endpointCount} documented endpoints` : "its llms.txt file");
    }
    if (structured?.status === "pass") {
      const types = extractList(structured, /types?:\s*([A-Z][A-Za-z, ]+)/i)
        || extractList(structured, /(?:found|detected)\s+([A-Z][A-Za-z, ]+)\s*schema/i);
      const schemaTypes = detail(structured, "schemaTypes") as string[] | undefined;
      if (schemaTypes?.length) {
        signals.push(`structured data using ${schemaTypes.join(" and ")} schema types`);
      } else if (types) {
        signals.push(`structured data using ${types} schema types`);
      } else {
        signals.push("Schema.org structured data");
      }
    }
    if (mcp?.status === "pass") {
      const toolCount = extractNumber(mcp, /(\d+)\s*tools?/i);
      signals.push(toolCount ? `an MCP server with ${toolCount} tools` : "MCP/A2A protocol endpoints");
    }
    if (robots?.status === "pass") signals.push("AI-friendly robots.txt rules");
    if (sitemap?.status === "pass") signals.push("a sitemap");

    const missing: string[] = [];
    if (llms?.status === "fail") missing.push("no llms.txt");
    if (mcp?.status === "fail") missing.push("no MCP server or A2A Agent Card");
    if (robots?.status === "fail") missing.push("AI crawlers blocked or not explicitly allowed");

    if (signals.length > 0) {
      let sentence = `Agents can discover ${domain} through ${joinList(signals)}.`;
      if (missing.length > 0 && cat.tier === "yellow") {
        sentence += ` However, ${missing[0]}.`;
      }
      return sentence;
    }
  }

  // Red tier
  const missing: string[] = [];
  if (llms?.status !== "pass") missing.push("no llms.txt");
  if (mcp?.status !== "pass") missing.push("no MCP server or A2A Agent Card");
  if (robots?.status === "fail") missing.push("AI crawlers are blocked in robots.txt");
  if (structured?.status !== "pass") missing.push("no structured data");
  return `Agents can't find ${domain} — ${missing.slice(0, 3).join(", ")}, so there's no standard way for agents to discover this product.`;
}

function comprehensionNarrative(cat: CategoryResult, domain: string): string {
  const openapi = find(cat.checks, "openapi");
  const docs = find(cat.checks, "doc-access");
  const schemaDrift = find(cat.checks, "schema-drift");
  const contentNeg = find(cat.checks, "content-negotiation");

  if (openapi?.status === "pass") {
    const endpointCount = extractNumber(openapi, /(\d+)\s*(?:documented\s+)?endpoint/i);
    const driftCount = extractNumber(schemaDrift, /(\d+)\s*(?:fields?|mismatche?s?|drift)/i);

    let sentence = endpointCount
      ? `The OpenAPI spec describes ${endpointCount} endpoints`
      : "An OpenAPI spec is published";

    if (schemaDrift?.status === "fail" && driftCount) {
      sentence += `, but ${driftCount} response fields don't match the spec (schema drift detected)`;
    } else if (schemaDrift?.status === "pass") {
      sentence += " with no schema drift detected";
    }

    if (docs?.status === "pass") {
      sentence += ", and documentation is publicly accessible";
    }
    if (contentNeg?.status === "pass") {
      sentence += ", with content negotiation supported";
    }
    return sentence + ".";
  }

  if (cat.tier === "red") {
    if (docs?.status === "pass") {
      return `${domain} has accessible documentation, but no machine-readable API spec — agents can read the docs but can't programmatically discover endpoints and parameters.`;
    }
    return `Agents can't understand ${domain}'s API surface — no OpenAPI spec or machine-readable documentation was found.`;
  }

  // Yellow without OpenAPI
  if (docs?.status === "pass") {
    return `Documentation is publicly accessible, but without an OpenAPI spec agents can't programmatically map the API surface.`;
  }
  return `Limited comprehension signals — agents can't fully understand what ${domain} offers without machine-readable API documentation.`;
}

function usabilityNarrative(cat: CategoryResult, _domain: string): string {
  const auth = find(cat.checks, "auth");
  const signup = find(cat.checks, "signup");
  const sandbox = find(cat.checks, "sandbox");
  const errors = find(cat.checks, "error");
  const cors = find(cat.checks, "cors");

  if (cat.tier === "green") {
    const parts: string[] = [];
    if (auth?.status === "pass") parts.push("authentication is documented");
    if (signup?.status === "pass") parts.push("signup has low friction");
    if (sandbox?.status === "pass") parts.push("a sandbox or free tier is available for testing");
    if (errors?.status === "pass") parts.push("error responses are machine-readable");
    if (cors?.status === "pass") parts.push("CORS headers allow cross-origin agent requests");
    return parts.length > 0 ? `For agent interaction, ${joinList(parts)}.` : "";
  }

  if (cat.tier === "red") {
    const problems: string[] = [];
    if (auth?.status === "fail") problems.push("agents don't know how to authenticate");
    if (signup?.status === "fail") problems.push("there's high friction to get started programmatically");
    if (errors?.status === "fail") problems.push("error responses aren't machine-readable");
    return problems.length > 0
      ? `Agents face barriers to interaction — ${joinList(problems)}.`
      : "Agents face significant friction when trying to interact with this product.";
  }

  // Yellow
  const good: string[] = [];
  const bad: string[] = [];
  if (auth?.status === "pass") good.push("authentication is documented"); else bad.push("authentication is unclear");
  if (signup?.status === "pass") good.push("signup is low-friction"); else bad.push("signup has friction");
  if (sandbox?.status === "pass") good.push("sandbox available"); else bad.push("no sandbox for testing");
  const bestGood = good[0] || "some access paths are clear";
  const worstBad = bad[0] || "some friction remains";
  return `${capitalize(bestGood)}, but ${worstBad}.`;
}

function stabilityNarrative(cat: CategoryResult, domain: string): string {
  const version = find(cat.checks, "version");
  const changelog = find(cat.checks, "changelog");
  const rateLimit = find(cat.checks, "rate-limit");
  const security = find(cat.checks, "security");
  const freshness = find(cat.checks, "content-freshness");

  if (cat.tier === "green") {
    const signals: string[] = [];
    if (version?.status === "pass") signals.push("API versioning");
    if (changelog?.status === "pass") signals.push("an active changelog or status page");
    if (rateLimit?.status === "pass") signals.push("documented rate limits");
    if (security?.status === "pass") {
      const headerCount = extractNumber(security, /(\d+)\s*(?:security\s+)?header/i);
      signals.push(headerCount ? `${headerCount} security headers` : "security headers");
    }
    if (freshness?.status === "pass") signals.push("content freshness signals");
    return signals.length > 0
      ? `Agents can depend on ${domain} — it has ${joinList(signals)}.`
      : `Agents can depend on ${domain} with strong stability signals.`;
  }

  if (cat.tier === "red") {
    const missing: string[] = [];
    if (version?.status !== "pass") missing.push("no API versioning");
    if (changelog?.status !== "pass") missing.push("no changelog or status page");
    if (rateLimit?.status !== "pass") missing.push("rate limits undocumented");
    return `Reliability is unclear — ${missing.slice(0, 2).join(" and ")}, so agents can't assess whether ${domain} is stable enough to depend on.`;
  }

  // Yellow
  const good: string[] = [];
  const bad: string[] = [];
  if (version?.status === "pass") good.push("the API is versioned"); else bad.push("no API versioning");
  if (security?.status === "pass") good.push("security headers are present"); else bad.push("security headers missing");
  if (changelog?.status === "pass") good.push("changelog found"); else bad.push("no changelog");
  return `${capitalize(good[0] || "Some stability signals present")}, but ${bad[0] || "gaps remain"}.`;
}

function agentExperienceNarrative(cat: CategoryResult, domain: string): string {
  const firstContact = find(cat.checks, "first-contact");
  const docNav = find(cat.checks, "navigab");
  const mcpFunc = find(cat.checks, "mcp-functional");
  const support = find(cat.checks, "support");
  const consistency = find(cat.checks, "consistency");

  if (cat.tier === "green") {
    const parts: string[] = [];
    if (mcpFunc?.status === "pass") {
      const toolCount = extractNumber(mcpFunc, /(\d+)\s*tools?/i);
      parts.push(toolCount ? `a verified MCP server exposing ${toolCount} tools` : "a verified MCP server");
    }
    if (firstContact?.status === "pass") parts.push("a structured first-contact response");
    if (docNav?.status === "pass") parts.push("documentation reachable from the root");
    if (consistency?.status === "pass") parts.push("consistent JSON responses");
    if (support?.status === "pass") parts.push("a programmatic support path");
    return parts.length > 0
      ? `When an agent arrives at ${domain}, it finds ${joinList(parts)}.`
      : `Agents get a positive first impression from ${domain}.`;
  }

  if (cat.tier === "red") {
    const problems: string[] = [];
    if (firstContact?.status === "fail") problems.push("no structured response on first contact");
    if (docNav?.status === "fail") problems.push("documentation isn't reachable from the root");
    return problems.length > 0
      ? `When an agent arrives at ${domain}, it hits a dead end — ${joinList(problems)}.`
      : `Agents get a poor first impression from ${domain} with no clear path forward.`;
  }

  // Yellow
  const good = firstContact?.status === "pass" ? "structured first contact" : mcpFunc?.status === "pass" ? "MCP server responds" : "some agent paths work";
  const bad = docNav?.status !== "pass" ? "documentation is hard to reach" : support?.status !== "pass" ? "no programmatic support path" : "some gaps remain";
  return `${capitalize(good)}, but ${bad}.`;
}

function transactabilityNarrative(cat: CategoryResult, domain: string): string {
  const pricing = find(cat.checks, "pricing-structured");
  const signup = find(cat.checks, "self-serve");
  const checkout = find(cat.checks, "checkout");
  const freeTier = find(cat.checks, "free-tier");
  const billing = find(cat.checks, "usage-billing");

  if (cat.tier === "green") {
    const signals: string[] = [];
    if (pricing?.status === "pass") signals.push("machine-readable pricing");
    if (signup?.status === "pass") signals.push("self-serve signup");
    if (checkout?.status === "pass") signals.push("programmatic checkout");
    if (freeTier?.status === "pass") signals.push("a free tier for evaluation");
    if (billing?.status === "pass") signals.push("usage/billing metadata in API responses");
    return signals.length > 0
      ? `Agents can transact with ${domain} — it offers ${joinList(signals)}.`
      : `${domain} is set up for agent-initiated transactions.`;
  }

  if (cat.tier === "red") {
    const missing: string[] = [];
    if (pricing?.status !== "pass") missing.push("pricing isn't machine-readable");
    if (signup?.status !== "pass") missing.push("no self-serve signup");
    if (checkout?.status !== "pass") missing.push("no programmatic checkout");
    return `Agents can't do business with ${domain} — ${missing.slice(0, 2).join(" and ")}.`;
  }

  // Yellow
  const good: string[] = [];
  const bad: string[] = [];
  if (pricing?.status === "pass") good.push("pricing is machine-readable"); else bad.push("pricing isn't machine-readable");
  if (signup?.status === "pass") good.push("self-serve signup available"); else bad.push("no self-serve signup");
  return `${capitalize(good[0] || "Some transaction signals present")}, but ${bad[0] || "gaps remain"}.`;
}

// --- string utilities ------------------------------------------------------

function joinList(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
