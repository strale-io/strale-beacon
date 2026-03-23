/**
 * Check handlers — each function implements a specific check_type or check_id.
 *
 * Every handler receives the ScanContext (shared state) and the CheckDefinition,
 * and returns a CheckResult. Handlers read from and write to the context so
 * later checks can reuse earlier findings.
 *
 * TRANSPARENCY RULE: every beaconFetch call MUST produce a Probe entry.
 */

import type { CheckDefinition, CheckResult, ScanContext, Probe, Confidence } from "./types";
import { beaconFetch, type FetchResult } from "./fetch";
import { extractLinksFromJson, linksByCategory, type FoundLink } from "./json-links";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a Probe from a FetchResult */
function toProbe(result: FetchResult, method = "GET"): Probe {
  return {
    url: result.url,
    method,
    status: result.status || null,
    contentType: result.headers["content-type"] || null,
    snippet: result.body ? result.body.substring(0, 200) : null,
    error: result.error || null,
  };
}

function makeResult(
  check: CheckDefinition,
  status: "pass" | "warn" | "fail",
  finding: string,
  opts: {
    probes?: Probe[];
    confidence?: Confidence;
    foundButUnrecognized?: boolean;
    details?: Record<string, unknown>;
  } = {}
): CheckResult {
  return {
    check_id: check.id,
    name: check.name,
    status,
    finding,
    recommendation: status === "pass" ? "" : check.recommendation,
    weight: check.weight,
    probes: opts.probes || [],
    detectionMethod: check.how_we_check,
    confidence: opts.confidence || "high",
    foundButUnrecognized: opts.foundButUnrecognized || false,
    details: opts.details,
  };
}

async function ensureHomepage(ctx: ScanContext): Promise<FetchResult | null> {
  if (ctx.homepageHtml !== undefined) return null; // already loaded, no new probe
  const result = await beaconFetch(ctx.baseUrl);
  if (result.ok) {
    ctx.homepageHtml = result.body;
    ctx.homepageHeaders = result.headers;
    ctx.fetchedPages.set(ctx.baseUrl, result.body);
    ctx.fetchedHeaders.set(ctx.baseUrl, result.headers);
  } else {
    ctx.homepageHtml = "";
    ctx.homepageHeaders = {};
  }
  return result;
}

async function fetchPageCached(ctx: ScanContext, url: string): Promise<{ body: string; headers: Record<string, string>; status: number; probe: Probe | null }> {
  if (ctx.fetchedPages.has(url)) {
    return { body: ctx.fetchedPages.get(url)!, headers: ctx.fetchedHeaders.get(url) || {}, status: 200, probe: null };
  }
  const result = await beaconFetch(url);
  const probe = toProbe(result);
  if (result.ok) {
    ctx.fetchedPages.set(url, result.body);
    ctx.fetchedHeaders.set(url, result.headers);
    return { body: result.body, headers: result.headers, status: result.status, probe };
  }
  return { body: "", headers: {}, status: result.status, probe };
}

// ─── Discoverability Checks ──────────────────────────────────────────────────

/** disc-llms-txt: Check for llms.txt presence and quality */
export async function checkLlmsTxt(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const paths = check.paths || ["/llms.txt", "/llms-full.txt"];
  const found: string[] = [];
  let bestContent = "";
  const probes: Probe[] = [];

  for (const p of paths) {
    const url = ctx.baseUrl + p;
    const result = await beaconFetch(url);
    probes.push(toProbe(result));
    if (result.ok && result.body.length > 0) {
      found.push(p);
      if (result.body.length > bestContent.length) bestContent = result.body;
    }
  }

  if (found.length === 0) {
    return makeResult(check, "fail", `No llms.txt file found. Checked ${paths.map((p) => ctx.baseUrl + p).join(", ")} — all returned non-200.`, { probes });
  }

  const hasCapabilities = /capabilit|endpoint|api|function|tool|action|service|feature/i.test(bestContent);
  const lineCount = bestContent.split("\n").filter((l) => l.trim()).length;

  if (hasCapabilities && lineCount > 5) {
    return makeResult(check, "pass", `Found ${found.join(", ")} with ${lineCount} lines of structured capability information.`, { probes, details: { found, lineCount } });
  }

  return makeResult(check, "warn", `Found ${found.join(", ")} but content appears to be a basic description without detailed capability information (${lineCount} lines). Content starts with: "${bestContent.substring(0, 100)}..."`, { probes, foundButUnrecognized: hasCapabilities ? false : true, details: { found, lineCount } });
}

/** disc-ai-crawler-policy: Parse robots.txt for AI crawler rules */
export async function checkAiCrawlerPolicy(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const url = ctx.baseUrl + "/robots.txt";
  const result = await beaconFetch(url);
  const probes: Probe[] = [toProbe(result)];

  if (!result.ok) {
    return makeResult(check, "warn", `No robots.txt found at ${url} (HTTP ${result.status}).`, { probes });
  }

  ctx.robotsTxt = result.body;

  const crawlers = ["GPTBot", "ClaudeBot", "Claude-Web", "PerplexityBot", "Google-Extended", "Amazonbot", "CCBot", "Bytespider", "cohere-ai", "Diffbot"];
  const lines = result.body.split("\n").map((l) => l.trim());

  const status: Record<string, "allowed" | "blocked" | "unaddressed"> = {};

  for (const crawler of crawlers) {
    const crawlerLower = crawler.toLowerCase();
    let found = false;
    let inCrawlerBlock = false;

    for (const line of lines) {
      const lineLower = line.toLowerCase();
      if (lineLower.startsWith("user-agent:")) {
        const agent = lineLower.replace("user-agent:", "").trim();
        inCrawlerBlock = agent === crawlerLower;
      } else if (inCrawlerBlock) {
        if (lineLower.startsWith("disallow:") && lineLower.replace("disallow:", "").trim() === "/") {
          status[crawler] = "blocked";
          found = true;
          break;
        } else if (lineLower.startsWith("allow:")) {
          status[crawler] = "allowed";
          found = true;
          break;
        }
      }
    }
    if (!found) status[crawler] = "unaddressed";
  }

  const blocked = Object.entries(status).filter(([, s]) => s === "blocked").map(([c]) => c);
  const allowed = Object.entries(status).filter(([, s]) => s === "allowed").map(([c]) => c);
  const unaddressed = Object.entries(status).filter(([, s]) => s === "unaddressed").map(([c]) => c);

  if (blocked.length >= crawlers.length / 2) {
    return makeResult(check, "fail", `robots.txt blocks ${blocked.length}/${crawlers.length} AI crawlers: ${blocked.join(", ")}.`, { probes, details: { status } });
  }
  if (blocked.length > 0) {
    return makeResult(check, "warn", `robots.txt blocks some AI crawlers (${blocked.join(", ")}) but allows others. ${unaddressed.length} unaddressed.`, { probes, details: { status } });
  }
  if (allowed.length > 0) {
    return makeResult(check, "pass", `robots.txt explicitly allows ${allowed.length} AI crawlers: ${allowed.join(", ")}. ${unaddressed.length} unaddressed (default: allowed).`, { probes, details: { status } });
  }
  return makeResult(check, "warn", `robots.txt exists but doesn't specifically address any AI crawlers. All ${crawlers.length} are unaddressed (default: allowed).`, { probes, details: { status } });
}

/** disc-structured-data: Check homepage for JSON-LD / structured data */
export async function checkStructuredData(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const probes: Probe[] = [];
  const hpResult = await ensureHomepage(ctx);
  if (hpResult) probes.push(toProbe(hpResult));

  const html = ctx.homepageHtml || "";
  let searchContent = html;

  // For API domains, also check the JSON root response
  if (ctx.domainType === "api") {
    try {
      const rootJson = JSON.parse(html);
      if (rootJson["@context"] || rootJson["@type"]) {
        searchContent = html; // JSON-LD in root response
      }
    } catch { /* not JSON, that's fine */ }
  }

  const jsonLdBlocks: unknown[] = [];
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(searchContent)) !== null) {
    try { jsonLdBlocks.push(JSON.parse(match[1])); } catch { /* ignore */ }
  }

  const relevantTypes = ["SoftwareApplication", "WebAPI", "APIReference", "Product", "WebApplication", "MobileApplication"];
  const foundTypes: string[] = [];

  const searchForTypes = (obj: unknown): void => {
    if (!obj || typeof obj !== "object") return;
    if (Array.isArray(obj)) { obj.forEach(searchForTypes); return; }
    const record = obj as Record<string, unknown>;
    const type = record["@type"];
    if (typeof type === "string" && relevantTypes.includes(type)) foundTypes.push(type);
    if (Array.isArray(type)) type.forEach((t) => { if (typeof t === "string" && relevantTypes.includes(t)) foundTypes.push(t); });
    Object.values(record).forEach(searchForTypes);
  };
  jsonLdBlocks.forEach(searchForTypes);

  const hasMicrodata = /itemtype=["']https?:\/\/schema\.org\/(SoftwareApplication|WebAPI|Product)/i.test(html);
  if (hasMicrodata) foundTypes.push("Microdata");

  if (foundTypes.length > 0) {
    return makeResult(check, "pass", `Found structured data with relevant types: ${[...new Set(foundTypes)].join(", ")}.`, { probes, details: { jsonLdCount: jsonLdBlocks.length, types: foundTypes } });
  }
  if (jsonLdBlocks.length > 0) {
    return makeResult(check, "warn", `Found ${jsonLdBlocks.length} JSON-LD block(s) but none describe product capabilities (looked for: ${relevantTypes.join(", ")}).`, { probes, foundButUnrecognized: true, details: { jsonLdCount: jsonLdBlocks.length } });
  }
  return makeResult(check, "fail", `No structured data (JSON-LD, Microdata) found on the homepage. Searched HTML for <script type="application/ld+json"> and itemtype attributes.`, { probes });
}

/** disc-sitemap: Check sitemap.xml */
export async function checkSitemap(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const url = ctx.baseUrl + "/sitemap.xml";
  const result = await beaconFetch(url);
  const probes: Probe[] = [toProbe(result)];

  if (!result.ok) {
    return makeResult(check, "fail", `No sitemap.xml found at ${url} (HTTP ${result.status}).`, { probes });
  }

  const body = result.body.toLowerCase();
  const hasApiDocs = /\/docs|\/api|\/developer|\/reference/i.test(body);
  const hasChangelog = /\/changelog|\/changes|\/release/i.test(body);
  const hasPricing = /\/pricing/i.test(body);
  const urlCount = (body.match(/<loc>/g) || []).length;

  const included: string[] = [];
  if (hasApiDocs) included.push("API docs");
  if (hasChangelog) included.push("changelog");
  if (hasPricing) included.push("pricing");

  if (included.length >= 2) {
    return makeResult(check, "pass", `sitemap.xml found with ${urlCount} URLs, including ${included.join(", ")}.`, { probes, details: { urlCount, includes: included } });
  }
  if (urlCount > 0) {
    return makeResult(check, "warn", `sitemap.xml found with ${urlCount} URLs but ${included.length === 0 ? "no developer-facing pages detected (searched for /docs, /api, /changelog, /pricing paths)" : `only includes ${included.join(", ")}`}.`, { probes, details: { urlCount, includes: included } });
  }
  return makeResult(check, "warn", "sitemap.xml found but appears empty or unparseable.", { probes });
}

/** disc-mcp-a2a: Check for MCP/A2A discovery endpoints */
export async function checkMcpA2a(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const paths = check.paths || ["/.well-known/mcp.json", "/.well-known/agent.json"];
  const found: string[] = [];
  const probes: Probe[] = [];
  const details: Record<string, unknown> = {};

  for (const p of paths) {
    const url = ctx.baseUrl + p;
    const result = await beaconFetch(url);
    probes.push(toProbe(result));
    if (result.ok) {
      found.push(p);
      try { details[p] = JSON.parse(result.body); }
      catch { details[p] = "present but not valid JSON"; }
    }
  }

  if (found.length > 0) {
    return makeResult(check, "pass", `Agent discovery endpoint(s) found: ${found.join(", ")}.`, { probes, details });
  }
  return makeResult(check, "fail", `No MCP or A2A endpoints found. Checked: ${paths.map((p) => ctx.baseUrl + p).join(", ")} — all returned non-200.`, { probes });
}

// ─── Comprehension Checks ────────────────────────────────────────────────────

/** comp-openapi: Discover OpenAPI/Swagger spec */
export async function checkOpenApi(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const paths = check.paths || ["/openapi.json", "/swagger.json", "/api/openapi.json", "/docs/openapi.json", "/api-docs"];
  const probes: Probe[] = [];

  for (const p of paths) {
    const url = ctx.baseUrl + p;
    const result = await beaconFetch(url);
    probes.push(toProbe(result));
    if (!result.ok) continue;

    let spec: Record<string, unknown>;
    try { spec = JSON.parse(result.body) as Record<string, unknown>; }
    catch {
      // Found content but couldn't parse as JSON
      if (result.body.length > 0) {
        return makeResult(check, "warn", `Found content at ${url} (HTTP ${result.status}) but could not parse as JSON. Content starts with: "${result.body.substring(0, 100)}..."`, { probes, foundButUnrecognized: true });
      }
      continue;
    }

    const version = (spec.openapi as string) || (spec.swagger as string) || "unknown";
    const paths_ = spec.paths as Record<string, unknown> | undefined;
    const endpointCount = paths_ ? Object.keys(paths_).length : 0;

    ctx.openapiSpec = spec;
    ctx.openapiVersion = version;
    ctx.openapiUrl = url;

    return makeResult(check, "pass", `OpenAPI spec found at ${p} (version ${version}) with ${endpointCount} endpoints.`, { probes, details: { url: p, version, endpointCount } });
  }

  // Check homepage for spec links
  const hpResult = await ensureHomepage(ctx);
  if (hpResult) probes.push(toProbe(hpResult));
  const html = ctx.homepageHtml || "";
  const specLinkMatch = html.match(/href=["']([^"']*(?:openapi|swagger)[^"']*)["']/i);
  if (specLinkMatch) {
    return makeResult(check, "warn", `No spec at standard locations, but found a potential spec link in homepage HTML: ${specLinkMatch[1]}`, { probes, details: { linkFound: specLinkMatch[1] } });
  }

  return makeResult(check, "fail", `No OpenAPI or Swagger specification found. Checked: ${paths.map((p) => ctx.baseUrl + p).join(", ")}.`, { probes });
}

/** comp-api-docs: Check if API documentation is publicly accessible */
export async function checkApiDocs(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const paths = check.paths || ["/docs", "/api", "/developers", "/api-reference"];
  const accessible: string[] = [];
  const redirectsToLogin: string[] = [];
  const probes: Probe[] = [];

  for (const p of paths) {
    const url = ctx.baseUrl + p;
    const result = await beaconFetch(url);
    probes.push(toProbe(result));
    if (result.ok) {
      const bodyLower = result.body.toLowerCase();
      const isLoginPage = /sign.?in|log.?in|authenticate/i.test(bodyLower) && result.body.length < 10000;
      if (isLoginPage && result.redirected) {
        redirectsToLogin.push(p);
      } else {
        accessible.push(p);
        ctx.docUrls.push(url);
      }
    }
  }

  // For API domains, follow cross-domain doc links
  if (ctx.domainType === "api" && accessible.length === 0) {
    for (const link of ctx.crossDomainLinks) {
      if (/doc|api|developer|reference/i.test(link.href) || /doc|api|developer|reference/i.test(link.label)) {
        const result = await beaconFetch(link.href);
        probes.push(toProbe(result));
        if (result.ok) {
          accessible.push(`${link.href} (via cross-domain link from ${link.source})`);
          ctx.docUrls.push(link.href);
        }
      }
    }
  }

  if (accessible.length > 0) {
    return makeResult(check, "pass", `API documentation publicly accessible at: ${accessible.join(", ")}.`, { probes, details: { accessible, redirectsToLogin } });
  }
  if (redirectsToLogin.length > 0) {
    return makeResult(check, "fail", `Documentation pages redirect to login: ${redirectsToLogin.join(", ")}. Agents cannot access docs without authentication.`, { probes, details: { redirectsToLogin } });
  }
  return makeResult(check, "fail", `No publicly accessible API documentation found. Checked: ${paths.map((p) => ctx.baseUrl + p).join(", ")}.`, { probes });
}

/** comp-endpoint-completeness: Analyze OpenAPI spec completeness */
export async function checkEndpointCompleteness(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  if (!ctx.openapiSpec) {
    return makeResult(check, "fail", "No OpenAPI spec available to analyze (depends on comp-openapi check).", { confidence: "high" });
  }

  const paths = ctx.openapiSpec.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) {
    return makeResult(check, "warn", "OpenAPI spec found but contains no paths/endpoints.", { foundButUnrecognized: true });
  }

  let totalEndpoints = 0;
  let withDescription = 0;
  let totalParams = 0;
  let paramsWithDescription = 0;
  let withResponseSchema = 0;

  for (const [, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (["get", "post", "put", "patch", "delete"].includes(method)) {
        totalEndpoints++;
        const op = operation as Record<string, unknown>;
        if (op.description || op.summary) withDescription++;
        const params = (op.parameters as Array<Record<string, unknown>>) || [];
        totalParams += params.length;
        paramsWithDescription += params.filter((p) => p.description).length;
        const responses = op.responses as Record<string, Record<string, unknown>> | undefined;
        if (responses) {
          const hasSchema = Object.values(responses).some((r) => r.schema || r.content);
          if (hasSchema) withResponseSchema++;
        }
      }
    }
  }

  const descriptionPct = totalEndpoints > 0 ? Math.round((withDescription / totalEndpoints) * 100) : 0;
  const paramPct = totalParams > 0 ? Math.round((paramsWithDescription / totalParams) * 100) : 100;
  const schemaPct = totalEndpoints > 0 ? Math.round((withResponseSchema / totalEndpoints) * 100) : 0;
  const details = { totalEndpoints, withDescription, descriptionPct, totalParams, paramsWithDescription, paramPct, withResponseSchema, schemaPct };

  if (descriptionPct >= 80 && schemaPct >= 50) {
    return makeResult(check, "pass", `Good documentation completeness: ${descriptionPct}% of ${totalEndpoints} endpoints documented, ${schemaPct}% have response schemas.`, { details });
  }
  if (descriptionPct >= 40) {
    return makeResult(check, "warn", `Partial documentation: ${descriptionPct}% of ${totalEndpoints} endpoints have descriptions, ${schemaPct}% have response schemas.`, { details });
  }
  return makeResult(check, "fail", `Poor documentation: only ${descriptionPct}% of ${totalEndpoints} endpoints have descriptions. ${paramPct}% of parameters documented.`, { details });
}

/** comp-machine-pricing: Check for machine-readable pricing */
export async function checkMachinePricing(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const probes: Probe[] = [];
  const pricingUrl = ctx.baseUrl + "/pricing";
  const { body: pricingBody, status, probe: pricingProbe } = await fetchPageCached(ctx, pricingUrl);
  if (pricingProbe) probes.push(pricingProbe);

  if (!pricingBody && status !== 200) {
    // Check homepage for pricing structured data
    const hpResult = await ensureHomepage(ctx);
    if (hpResult) probes.push(toProbe(hpResult));
    const html = ctx.homepageHtml || "";

    // Check cross-domain pricing links and nested JSON pricing URLs
    for (const link of ctx.crossDomainLinks) {
      if (/pric|plan|tier/i.test(link.href) || /pric|plan|tier/i.test(link.label)) {
        const result = await beaconFetch(link.href);
        probes.push(toProbe(result));
        if (result.ok && /"price"|"priceCurrency"|"offers"/i.test(result.body)) {
          return makeResult(check, "warn", `Pricing data found via cross-domain link at ${link.href} (linked from ${link.source}).`, { probes, confidence: "medium" });
        }
      }
    }
    for (const resp of ctx.apiResponses) {
      if (!resp.isJson || !resp.body) continue;
      try {
        const json = JSON.parse(resp.body);
        const pricingLinks = linksByCategory(extractLinksFromJson(json), "pricing");
        for (const pl of pricingLinks) {
          const result = await beaconFetch(pl.url);
          probes.push(toProbe(result));
          if (result.ok) {
            return makeResult(check, "warn", `Pricing link found via JSON path "${pl.path}" in ${resp.url}, pointing to ${pl.url}.`, { probes, confidence: "medium" });
          }
        }
      } catch { /* ignore */ }
    }

    if (/"price"|"priceCurrency"|"offers"/i.test(html)) {
      return makeResult(check, "warn", "No dedicated pricing page found, but homepage contains pricing-related structured data.", { probes, confidence: "medium" });
    }
    return makeResult(check, "fail", `No pricing page found at ${pricingUrl} (HTTP ${status}). Also checked homepage for pricing structured data — none found.`, { probes });
  }

  const html = pricingBody;
  const hasJsonLdPricing = /"price"|"priceCurrency"|"offers"/i.test(html);
  const hasPricingTable = /<table[\s\S]*?(?:price|plan|tier|month|year|free)/i.test(html);
  const isContactOnly = /contact\s+(?:us|sales)|request\s+(?:a\s+)?(?:demo|quote|pricing)/i.test(html) && !hasPricingTable;

  if (hasJsonLdPricing) {
    return makeResult(check, "pass", "Pricing page includes structured data (JSON-LD) with pricing information.", { probes, details: { hasJsonLd: true, hasTable: hasPricingTable } });
  }
  if (hasPricingTable) {
    return makeResult(check, "warn", "Pricing page has tabular pricing data but no machine-readable structured data (JSON-LD).", { probes, confidence: "medium", details: { hasTable: true } });
  }
  if (isContactOnly) {
    return makeResult(check, "fail", 'Pricing page exists but only offers "contact us" — no machine-readable pricing information.', { probes });
  }
  return makeResult(check, "warn", "Pricing page exists but no clear machine-readable pricing format detected.", { probes, foundButUnrecognized: true });
}

// ─── Usability Checks ────────────────────────────────────────────────────────

/** use-auth-docs: Analyze authentication documentation */
export async function checkAuthDocs(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const authKeywords = {
    "OAuth 2.0": /oauth\s*2\.?0?/i,
    "API Key": /api[\s-_]?key/i,
    "Bearer Token": /bearer\s+token/i,
    "Basic Auth": /basic\s+auth/i,
    "JWT": /\bjwt\b/i,
    "OpenID Connect": /openid\s+connect|oidc/i,
  };

  const sources: string[] = [];
  const foundMethods: string[] = [];
  const probes: Probe[] = [];

  // Check OpenAPI spec security schemes (structural — high confidence)
  if (ctx.openapiSpec) {
    const components = ctx.openapiSpec.components as Record<string, unknown> | undefined;
    const securityDefs = (components?.securitySchemes || ctx.openapiSpec.securityDefinitions) as Record<string, unknown> | undefined;
    if (securityDefs) {
      sources.push("OpenAPI spec");
      for (const [name, scheme] of Object.entries(securityDefs)) {
        const s = scheme as Record<string, unknown>;
        foundMethods.push(`${name} (${s.type || "unknown"})`);
      }
    }
  }

  // Check documentation pages (keyword — medium confidence)
  for (const docUrl of ctx.docUrls) {
    const { body, probe } = await fetchPageCached(ctx, docUrl);
    if (probe) probes.push(probe);
    if (!body) continue;
    for (const [method, regex] of Object.entries(authKeywords)) {
      if (regex.test(body) && !foundMethods.includes(method)) {
        foundMethods.push(method);
        if (!sources.includes("documentation")) sources.push("documentation");
      }
    }
  }

  // Check homepage
  const hpResult = await ensureHomepage(ctx);
  if (hpResult) probes.push(toProbe(hpResult));
  for (const [method, regex] of Object.entries(authKeywords)) {
    if (regex.test(ctx.homepageHtml || "") && !foundMethods.includes(method)) {
      foundMethods.push(method);
      if (!sources.includes("homepage")) sources.push("homepage");
    }
  }

  if (foundMethods.length > 0 && sources.includes("OpenAPI spec")) {
    return makeResult(check, "pass", `Authentication documented in ${sources.join(", ")}: ${foundMethods.join(", ")}.`, { probes, details: { methods: foundMethods, sources } });
  }
  if (foundMethods.length > 0) {
    return makeResult(check, "warn", `Authentication methods mentioned (${foundMethods.join(", ")}) in ${sources.join(", ")} but not in a machine-readable format (no OpenAPI security schemes).`, { probes, confidence: "medium", details: { methods: foundMethods, sources } });
  }
  return makeResult(check, "fail", "No authentication documentation found in OpenAPI spec, documentation pages, or homepage.", { probes });
}

/** use-signup-friction: Analyze signup friction */
export async function checkSignupFriction(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const signupPaths = ["/signup", "/register", "/sign-up", "/get-started"];
  let signupHtml = "";
  const probes: Probe[] = [];
  let signupUrl = "";

  for (const p of signupPaths) {
    const url = ctx.baseUrl + p;
    const result = await beaconFetch(url);
    probes.push(toProbe(result));
    if (result.ok) {
      signupHtml = result.body;
      signupUrl = url;
      break;
    }
  }

  const hpResult = await ensureHomepage(ctx);
  if (hpResult) probes.push(toProbe(hpResult));
  const allHtml = signupHtml + (ctx.homepageHtml || "");

  const frictionPoints: Array<{ type: string; matchedText: string }> = [];

  const frictionChecks: Array<{ type: string; regex: RegExp }> = [
    { type: "CAPTCHA", regex: /captcha|recaptcha|hcaptcha|turnstile/i },
    { type: "email verification", regex: /email\s*verif|verify.*email|confirm.*email/i },
    { type: "phone verification", regex: /phone\s*verif|sms\s*verif|verify.*phone/i },
    { type: "credit card required", regex: /credit\s*card|payment\s*method|billing\s*info/i },
    { type: "manual approval/waitlist", regex: /manual\s*(?:review|approval)|pending\s*approval|waitlist/i },
  ];

  for (const fc of frictionChecks) {
    const match = fc.regex.exec(allHtml);
    if (match) {
      // Skip credit card if free tier is available
      if (fc.type === "credit card required" && /free\s*(?:tier|plan|trial)/i.test(allHtml)) continue;
      // Extract surrounding context for the match
      const start = Math.max(0, match.index - 30);
      const end = Math.min(allHtml.length, match.index + match[0].length + 30);
      const context = allHtml.substring(start, end).replace(/\s+/g, " ").trim();
      frictionPoints.push({ type: fc.type, matchedText: context });
    }
  }

  const frictionNames = frictionPoints.map((f) => f.type);

  if (frictionPoints.length === 0 && signupHtml) {
    return makeResult(check, "pass", `Signup page found at ${signupUrl} with minimal friction — no CAPTCHA, phone verification, or manual approval detected.`, { probes, confidence: "low", details: { frictionPoints: frictionNames } });
  }
  if (frictionPoints.length === 0 && !signupHtml) {
    return makeResult(check, "warn", `No signup page found at standard locations: ${signupPaths.join(", ")}. Could not assess signup friction.`, { probes, confidence: "low" });
  }
  if (frictionPoints.length <= 1) {
    const detail = frictionPoints[0];
    return makeResult(check, "warn", `Signup has some friction: ${frictionNames.join(", ")}. Matched text: "...${detail?.matchedText}..."`, { probes, confidence: "low", details: { frictionPoints: frictionNames, matches: frictionPoints } });
  }
  return makeResult(check, "fail", `High signup friction detected: ${frictionNames.join(", ")}. Each was matched by keyword in page text (low confidence — verify manually).`, { probes, confidence: "low", details: { frictionPoints: frictionNames, matches: frictionPoints } });
}

/** use-sandbox: Check for sandbox/test environment */
export async function checkSandbox(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const keywords = /sandbox|test\s*mode|test\s*key|free\s*tier|free\s*plan|trial|playground|demo\s*(?:api|key|account|environment)/i;
  const probes: Probe[] = [];
  const pagesToCheck = [...ctx.docUrls, ctx.baseUrl + "/pricing", ctx.baseUrl];
  const foundIn: string[] = [];

  for (const url of pagesToCheck) {
    const { body, probe } = await fetchPageCached(ctx, url);
    if (probe) probes.push(probe);
    if (body && keywords.test(body)) {
      foundIn.push(new URL(url).pathname || "/");
    }
  }

  // Check OpenAPI spec for test servers
  if (ctx.openapiSpec) {
    const servers = ctx.openapiSpec.servers as Array<Record<string, unknown>> | undefined;
    if (servers?.some((s) => /sandbox|test|staging/i.test(String(s.url || "") + String(s.description || "")))) {
      foundIn.push("OpenAPI spec servers");
    }
  }

  if (foundIn.length > 0) {
    return makeResult(check, "pass", `Sandbox/test environment references found in: ${foundIn.join(", ")}.`, { probes, confidence: "low", details: { foundIn } });
  }
  return makeResult(check, "fail", `No sandbox, test mode, free tier, or playground detected. Checked: ${pagesToCheck.map((u) => new URL(u).pathname || "/").join(", ")} and OpenAPI spec.`, { probes, confidence: "low" });
}

/** use-error-quality: Check error response quality */
export async function checkErrorQuality(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const apiPaths = ["/api", "/v1", "/api/v1", "/api/v2"];
  let bestResponse: { url: string; status: number; contentType: string; isJson: boolean; body: string } | null = null;
  const probes: Probe[] = [];

  for (const p of apiPaths) {
    const url = ctx.baseUrl + p;
    const result = await beaconFetch(url);
    probes.push(toProbe(result));
    const contentType = result.headers["content-type"] || "";
    const isJson = contentType.includes("json");

    ctx.apiResponses.push({
      url, status: result.status, contentType, isJson,
      headers: result.headers, body: result.body.slice(0, 2000),
    });

    if (!bestResponse || (isJson && !bestResponse.isJson)) {
      bestResponse = { url, status: result.status, contentType, isJson, body: result.body.slice(0, 2000) };
    }
  }

  if (!bestResponse || bestResponse.status === 0) {
    return makeResult(check, "warn", `Could not reach any API endpoints. Tested: ${apiPaths.map((p) => ctx.baseUrl + p).join(", ")}.`, { probes, details: { testedPaths: apiPaths } });
  }

  if (bestResponse.isJson) {
    try {
      const json = JSON.parse(bestResponse.body);
      const hasErrorCode = json.error || json.code || json.status || json.message;
      if (hasErrorCode) {
        return makeResult(check, "pass", `API returns structured JSON error responses with error information at ${bestResponse.url} (HTTP ${bestResponse.status}).`, { probes, details: { sampleStatus: bestResponse.status } });
      }
      return makeResult(check, "warn", `API returns JSON at ${bestResponse.url} (HTTP ${bestResponse.status}) but without standard error fields (error, code, status, message). Response starts with: "${bestResponse.body.substring(0, 100)}..."`, { probes, details: { sampleStatus: bestResponse.status } });
    } catch {
      return makeResult(check, "warn", `API endpoint at ${bestResponse.url} claims JSON content-type but body is not valid JSON.`, { probes, foundButUnrecognized: true });
    }
  }

  if (bestResponse.body.includes("<html") || bestResponse.body.includes("<!DOCTYPE")) {
    return makeResult(check, "fail", `API endpoints return HTML instead of JSON. First contact at ${bestResponse.url} returns an HTML page (HTTP ${bestResponse.status}).`, { probes, details: { contentType: bestResponse.contentType } });
  }

  return makeResult(check, "warn", `API response at ${bestResponse.url} is neither JSON nor HTML (Content-Type: ${bestResponse.contentType}).`, { probes, foundButUnrecognized: true });
}

/** use-sdk: Check for SDK availability */
export async function checkSdk(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const sdkKeywords = /\bnpm\b|npx|pip\s+install|gem\s+install|composer|nuget|cargo|sdk|client\s*library|package/i;
  const frameworkKeywords = /langchain|crewai|autogen|semantic.kernel|vercel\s*ai|llamaindex/i;
  const probes: Probe[] = [];
  const foundSdk: string[] = [];
  const foundFramework: string[] = [];

  const pagesToCheck = [...ctx.docUrls, ctx.baseUrl];
  for (const url of pagesToCheck) {
    const { body, probe } = await fetchPageCached(ctx, url);
    if (probe) probes.push(probe);
    if (!body) continue;
    if (sdkKeywords.test(body)) foundSdk.push(new URL(url).pathname || "/");
    if (frameworkKeywords.test(body)) foundFramework.push(new URL(url).pathname || "/");
  }

  if (foundSdk.length > 0 && foundFramework.length > 0) {
    return makeResult(check, "pass", `SDKs/packages mentioned in ${foundSdk.join(", ")}. Framework integrations found in ${foundFramework.join(", ")}.`, { probes, confidence: "low", details: { foundSdk, foundFramework } });
  }
  if (foundSdk.length > 0) {
    return makeResult(check, "warn", `SDK/package references found in ${foundSdk.join(", ")} but no agent framework integrations (LangChain, CrewAI, etc.) detected.`, { probes, confidence: "low", details: { foundSdk } });
  }
  return makeResult(check, "fail", `No SDK, client library, or package references found. Checked: ${pagesToCheck.map((u) => new URL(u).pathname || "/").join(", ")}.`, { probes, confidence: "low" });
}

// ─── Stability Checks ────────────────────────────────────────────────────────

/** stab-versioning: Check for API versioning */
export async function checkVersioning(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const versionSignals: string[] = [];
  const probes: Probe[] = [];

  if (ctx.openapiSpec) {
    const info = ctx.openapiSpec.info as Record<string, unknown> | undefined;
    if (info?.version) versionSignals.push(`OpenAPI spec version: ${info.version}`);
    const servers = ctx.openapiSpec.servers as Array<Record<string, unknown>> | undefined;
    if (servers?.some((s) => /\/v\d+/i.test(String(s.url || "")))) {
      versionSignals.push("Versioned server URLs in spec");
    }
  }

  for (const resp of ctx.apiResponses) {
    if (resp.headers["api-version"] || resp.headers["x-api-version"]) {
      versionSignals.push(`Version header: ${resp.headers["api-version"] || resp.headers["x-api-version"]}`);
    }
    if (/\/v\d+/i.test(resp.url)) {
      versionSignals.push(`Versioned URL pattern: ${resp.url}`);
    }
  }

  let hasDeprecationPolicy = false;
  for (const docUrl of ctx.docUrls) {
    const { body, probe } = await fetchPageCached(ctx, docUrl);
    if (probe) probes.push(probe);
    if (body && /deprecat|sunset|migration\s*guide|breaking\s*change/i.test(body)) {
      hasDeprecationPolicy = true;
      versionSignals.push("Deprecation/migration documentation found");
    }
  }

  if (versionSignals.length >= 2) {
    return makeResult(check, "pass", `API versioning detected: ${versionSignals.join("; ")}.`, { probes, details: { signals: versionSignals } });
  }
  if (versionSignals.length > 0) {
    return makeResult(check, "warn", `Partial versioning: ${versionSignals.join("; ")}. ${hasDeprecationPolicy ? "" : "No deprecation policy found."}`, { probes, details: { signals: versionSignals } });
  }
  return makeResult(check, "fail", "No API versioning detected. No version in URLs, headers, or documentation. No deprecation policy found.", { probes });
}

/** stab-changelog-status: Check for changelog and status page */
export async function checkChangelogStatus(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const paths = ["/changelog", "/changes", "/release-notes", "/status", "/updates"];
  const found: string[] = [];
  const probes: Probe[] = [];

  for (const p of paths) {
    const url = ctx.baseUrl + p;
    const result = await beaconFetch(url);
    probes.push(toProbe(result));
    if (result.ok) found.push(p);
  }

  // Check for statuspage.io or similar in homepage
  const hpResult = await ensureHomepage(ctx);
  if (hpResult) probes.push(toProbe(hpResult));
  const html = ctx.homepageHtml || "";
  const statusPageLink = html.match(/href=["']([^"']*(?:statuspage\.io|status\.[^"']+|uptime[^"']*))["']/i);
  if (statusPageLink) found.push(`external status: ${statusPageLink[1]}`);

  // Check cross-domain links and nested JSON for changelog/status links
  for (const link of ctx.crossDomainLinks) {
    if (/changelog|status|release|updates/i.test(link.href) || /changelog|status|release|updates/i.test(link.label)) {
      const result = await beaconFetch(link.href);
      probes.push(toProbe(result));
      if (result.ok) found.push(`${link.href} (cross-domain from ${link.source})`);
    }
  }

  // Also check nested JSON API responses for changelog/status URLs
  for (const resp of ctx.apiResponses) {
    if (!resp.isJson || !resp.body) continue;
    try {
      const json = JSON.parse(resp.body);
      const allLinks = extractLinksFromJson(json);
      const changelogLinks = linksByCategory(allLinks, "changelog");
      const statusLinks = linksByCategory(allLinks, "status");
      for (const jl of [...changelogLinks, ...statusLinks]) {
        const result = await beaconFetch(jl.url);
        probes.push(toProbe(result));
        if (result.ok) found.push(`${jl.url} (via JSON path "${jl.path}" in ${resp.url})`);
      }
    } catch { /* ignore */ }
  }

  if (found.length >= 2) {
    return makeResult(check, "pass", `Changelog and status signals found: ${found.join(", ")}.`, { probes, details: { found } });
  }
  if (found.length > 0) {
    return makeResult(check, "warn", `Partial: found ${found.join(", ")} but missing ${found.some((f) => f.includes("status")) ? "changelog" : "status page"}.`, { probes, details: { found } });
  }
  return makeResult(check, "fail", `No changelog, release notes, or status page found. Checked: ${paths.map((p) => ctx.baseUrl + p).join(", ")} and homepage links.`, { probes });
}

/** stab-rate-limits: Check for rate limit documentation */
export async function checkRateLimits(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const rateLimitHeaders: Record<string, string> = {};
  const probes: Probe[] = [];
  const checkedEndpoints: string[] = [];

  for (const resp of ctx.apiResponses) {
    checkedEndpoints.push(resp.url);
    for (const [key, value] of Object.entries(resp.headers)) {
      if (/rate.?limit|x-ratelimit|retry-after/i.test(key)) {
        rateLimitHeaders[key] = value;
      }
    }
  }

  let docMentions = false;
  for (const docUrl of ctx.docUrls) {
    const { body, probe } = await fetchPageCached(ctx, docUrl);
    if (probe) probes.push(probe);
    if (body && /rate\s*limit|throttl|requests?\s*per\s*(second|minute|hour|day)|quota/i.test(body)) {
      docMentions = true;
      break;
    }
  }

  const headerNote = checkedEndpoints.length > 0
    ? ` Checked response headers from: ${checkedEndpoints.join(", ")} (unauthenticated — rate limit headers may require auth).`
    : " No API endpoints were probed for headers.";

  if (Object.keys(rateLimitHeaders).length > 0 && docMentions) {
    return makeResult(check, "pass", `Rate limits documented and headers present: ${Object.keys(rateLimitHeaders).join(", ")}.${headerNote}`, { probes, details: { headers: rateLimitHeaders, docMentions } });
  }
  if (Object.keys(rateLimitHeaders).length > 0) {
    return makeResult(check, "warn", `Rate limit headers found (${Object.keys(rateLimitHeaders).join(", ")}) but no documentation about limits.${headerNote}`, { probes, details: { headers: rateLimitHeaders } });
  }
  if (docMentions) {
    return makeResult(check, "warn", `Rate limits mentioned in documentation but no rate limit headers in API responses.${headerNote}`, { probes, details: { docMentions } });
  }
  return makeResult(check, "fail", `No rate limit documentation or headers found.${headerNote}`, { probes });
}

/** stab-tos-agents: Check ToS for agent compatibility */
export async function checkTosAgents(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const paths = check.paths || ["/terms", "/tos", "/terms-of-service", "/legal/terms"];
  let tosContent = "";
  const probes: Probe[] = [];
  let tosUrl = "";

  for (const p of paths) {
    const url = ctx.baseUrl + p;
    const result = await beaconFetch(url);
    probes.push(toProbe(result));
    if (result.ok) {
      tosContent = result.body;
      tosUrl = url;
      break;
    }
  }

  if (!tosContent) {
    return makeResult(check, "warn", `No Terms of Service found. Checked: ${paths.map((p) => ctx.baseUrl + p).join(", ")}.`, { probes, confidence: "low" });
  }

  const prohibits = /prohibit.*(?:bot|automat|scrap|crawl)|no\s+(?:bot|automat|scrap)|(?:bot|automat|scrap).*(?:not\s+(?:allowed|permitted)|prohibited|forbidden)/i.test(tosContent);
  const permits = /(?:api|automat|bot|programmat).*(?:allowed|permitted|welcome)|allow.*(?:api|automat|bot)/i.test(tosContent);
  const mentionsApi = /\bapi\b/i.test(tosContent);
  const mentionsBots = /\bbot|automat|scrap|crawl/i.test(tosContent);

  if (prohibits) {
    return makeResult(check, "fail", `Terms of Service at ${tosUrl} appear to prohibit automated access or bots. This is keyword-based inference — verify the actual legal text.`, { probes, confidence: "low", details: { prohibits, permits, mentionsApi } });
  }
  if (permits || (mentionsApi && !prohibits)) {
    return makeResult(check, "pass", `Terms of Service at ${tosUrl} address API/automated access without prohibiting it.`, { probes, confidence: "low", details: { permits, mentionsApi } });
  }
  if (mentionsBots) {
    return makeResult(check, "warn", `Terms of Service at ${tosUrl} mention bots/automation but it's unclear if agent access is permitted or prohibited. Review manually.`, { probes, confidence: "low", details: { mentionsBots } });
  }
  return makeResult(check, "warn", `Terms of Service at ${tosUrl} are silent on automated access, bots, or API usage.`, { probes, confidence: "low" });
}

/** stab-security: Check security headers */
export async function checkSecurityHeaders(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const probes: Probe[] = [];
  const hpResult = await ensureHomepage(ctx);
  if (hpResult) probes.push(toProbe(hpResult));
  const headers = ctx.homepageHeaders || {};

  const checks: Record<string, boolean> = {
    https: ctx.baseUrl.startsWith("https://"),
    hsts: !!headers["strict-transport-security"],
    "x-content-type-options": !!headers["x-content-type-options"],
    csp: !!headers["content-security-policy"],
    "x-frame-options": !!headers["x-frame-options"],
  };

  const passed = Object.entries(checks).filter(([, v]) => v).map(([k]) => k);
  const missing = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);

  if (passed.length >= 4) {
    return makeResult(check, "pass", `Good security posture: ${passed.join(", ")} present.${missing.length > 0 ? ` Missing: ${missing.join(", ")}.` : ""}`, { probes, details: { checks } });
  }
  if (checks.https && passed.length >= 2) {
    return makeResult(check, "warn", `HTTPS enforced. Present: ${passed.join(", ")}. Missing: ${missing.join(", ")}.`, { probes, details: { checks } });
  }
  if (!checks.https) {
    return makeResult(check, "fail", "HTTPS not enforced. This is a critical security issue for agent interactions.", { probes, details: { checks } });
  }
  return makeResult(check, "fail", `Weak security headers. Only ${passed.join(", ")} present. Missing: ${missing.join(", ")}.`, { probes, details: { checks } });
}

// ─── Agent Experience Checks ─────────────────────────────────────────────────

/** ax-first-contact: First contact response quality */
export async function checkFirstContact(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const probes: Probe[] = [];

  // Use already-collected API responses, or try new endpoints
  if (ctx.apiResponses.length === 0) {
    const apiPaths = ["/api", "/v1", "/api/v1"];
    for (const p of apiPaths) {
      const result = await beaconFetch(ctx.baseUrl + p);
      probes.push(toProbe(result));
      ctx.apiResponses.push({
        url: ctx.baseUrl + p, status: result.status,
        contentType: result.headers["content-type"] || "",
        isJson: (result.headers["content-type"] || "").includes("json"),
        headers: result.headers, body: result.body.slice(0, 2000),
      });
    }
  }

  const jsonResponses = ctx.apiResponses.filter((r) => r.isJson);
  const htmlResponses = ctx.apiResponses.filter((r) => (r.body || "").includes("<html") || (r.body || "").includes("<!DOCTYPE"));
  const timeouts = ctx.apiResponses.filter((r) => r.status === 0);

  if (jsonResponses.length > 0) {
    const best = jsonResponses[0];
    let foundLinks: FoundLink[] = [];
    let responsePreview = "";
    try {
      const json = JSON.parse(best.body || "");
      responsePreview = JSON.stringify(json, null, 2).substring(0, 300);

      // Recursively extract all links from nested JSON
      foundLinks = extractLinksFromJson(json);

      // For API domains, extract cross-domain links
      if (ctx.domainType === "api") {
        extractCrossDomainLinks(json, ctx, best.url);
      }
    } catch { /* ignore */ }

    const docLinks = linksByCategory(foundLinks, "documentation");
    const allCategorized = foundLinks.filter((l) => l.category !== "other");

    if (docLinks.length > 0) {
      const docPaths = docLinks.map((l) => `${l.path} → ${l.url}`).join("; ");
      return makeResult(check, "pass", `First contact at ${best.url} returns structured JSON (HTTP ${best.status}) with documentation links: ${docPaths}.`, { probes, details: { status: best.status, responsePreview, links: foundLinks } });
    }
    if (allCategorized.length > 0) {
      const linkSummary = allCategorized.map((l) => `${l.category}: ${l.url}`).join("; ");
      return makeResult(check, "warn", `First contact at ${best.url} returns JSON (HTTP ${best.status}) with links (${linkSummary}) but no documentation links found.`, { probes, details: { status: best.status, responsePreview, links: foundLinks } });
    }
    return makeResult(check, "warn", `First contact at ${best.url} returns JSON (HTTP ${best.status}) but without navigation links. Response: ${responsePreview}...`, { probes, details: { status: best.status, responsePreview } });
  }

  if (timeouts.length === ctx.apiResponses.length) {
    return makeResult(check, "fail", `All API endpoint requests timed out. Tested: ${ctx.apiResponses.map((r) => r.url).join(", ")}.`, { probes });
  }

  if (htmlResponses.length > 0) {
    return makeResult(check, "fail", `API endpoints return HTML pages instead of structured data. Tested: ${ctx.apiResponses.map((r) => `${r.url} → HTTP ${r.status} (${r.contentType || "no content-type"})`).join("; ")}.`, { probes });
  }

  return makeResult(check, "warn", `No clear API endpoints found. Tested: ${ctx.apiResponses.map((r) => `${r.url} → HTTP ${r.status}`).join("; ")}.`, { probes });
}

/** ax-doc-navigability: Documentation navigability from homepage */
export async function checkDocNavigability(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const probes: Probe[] = [];
  const hpResult = await ensureHomepage(ctx);
  if (hpResult) probes.push(toProbe(hpResult));
  const html = ctx.homepageHtml || "";

  const docPatterns = /href=["']([^"']*(?:\/docs|\/api|\/developer|\/reference|\/api-reference)[^"']*)["']/gi;
  const docLinks: string[] = [];
  let match;
  while ((match = docPatterns.exec(html)) !== null) {
    docLinks.push(match[1]);
  }

  const navDocPattern = /(?:documentation|api\s*docs|developer|api\s*reference)/i;
  const hasNavDocLink = navDocPattern.test(html);

  // For API domains, check nested JSON responses for doc links
  if (docLinks.length === 0) {
    // Check cross-domain links from context
    for (const link of ctx.crossDomainLinks) {
      if (/doc|api|developer|reference/i.test(link.href) || /doc|api|developer|reference/i.test(link.label)) {
        docLinks.push(`${link.href} (via cross-domain link from ${link.source})`);
      }
    }

    // Also recursively parse JSON API responses for nested doc links
    for (const resp of ctx.apiResponses) {
      if (!resp.isJson || !resp.body) continue;
      try {
        const json = JSON.parse(resp.body);
        const jsonDocLinks = linksByCategory(extractLinksFromJson(json), "documentation");
        for (const jl of jsonDocLinks) {
          docLinks.push(`${jl.url} (via JSON path "${jl.path}" in ${resp.url})`);
        }
      } catch { /* ignore */ }
    }
  }

  if (docLinks.length > 0) {
    return makeResult(check, "pass", `API documentation directly linked from homepage (${docLinks.length} link(s) found). Links: ${docLinks.slice(0, 5).join(", ")}. Reachable in 1 hop.`, { probes, details: { docLinks: docLinks.slice(0, 5), hops: 1 } });
  }
  if (hasNavDocLink) {
    return makeResult(check, "warn", "Documentation mentioned in homepage text/navigation but no direct HTML <a href> links to doc pages found. May require JavaScript navigation.", { probes, details: { hops: "unknown" } });
  }
  if (ctx.docUrls.length > 0) {
    return makeResult(check, "warn", `Documentation exists at ${ctx.docUrls[0]} but is not linked from the homepage. Agents must guess the URL.`, { probes, details: { hops: "not linked" } });
  }
  return makeResult(check, "fail", "No documentation links found on the homepage. Searched for <a href> tags matching /docs, /api, /developer, /reference patterns.", { probes });
}

/** ax-response-consistency: Check response format consistency */
export async function checkResponseConsistency(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  if (ctx.apiResponses.length === 0) {
    return makeResult(check, "warn", "No API responses collected during scan. Cannot assess response format consistency.", {});
  }

  const jsonCount = ctx.apiResponses.filter((r) => r.isJson).length;
  const htmlCount = ctx.apiResponses.filter((r) => ((r.body || "").includes("<html") || (r.body || "").includes("<!DOCTYPE")) && !r.isJson).length;
  const total = ctx.apiResponses.length;

  const correctContentType = ctx.apiResponses.filter((r) => {
    if (r.isJson) return r.contentType.includes("json");
    return true;
  }).length;

  const endpointSummary = ctx.apiResponses.map((r) => `${r.url} → ${r.isJson ? "JSON" : "non-JSON"} (HTTP ${r.status})`).join("; ");

  if (jsonCount === total && correctContentType === total) {
    return makeResult(check, "pass", `All ${total} API responses are consistently JSON with correct Content-Type headers. ${endpointSummary}`, { details: { jsonCount, total } });
  }
  if (jsonCount > 0 && htmlCount > 0) {
    return makeResult(check, "warn", `Inconsistent formats: ${jsonCount}/${total} JSON, ${htmlCount}/${total} HTML. ${endpointSummary}`, { details: { jsonCount, htmlCount, total } });
  }
  if (jsonCount > 0) {
    return makeResult(check, "warn", `${jsonCount}/${total} responses are JSON but some have incorrect Content-Type headers. ${endpointSummary}`, { details: { jsonCount, correctContentType, total } });
  }
  return makeResult(check, "fail", `No JSON API responses among ${total} tested endpoints. ${endpointSummary}`, { details: { jsonCount, htmlCount, total } });
}

/** ax-support-paths: Check for machine-readable support paths */
export async function checkSupportPaths(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const signals: string[] = [];
  const probes: Probe[] = [];

  const statusPaths = ["/api/status", "/api/health", "/health", "/api/v1/status"];
  for (const p of statusPaths) {
    const result = await beaconFetch(ctx.baseUrl + p);
    probes.push(toProbe(result));
    if (result.ok && (result.headers["content-type"] || "").includes("json")) {
      signals.push(`Status endpoint: ${p} (HTTP ${result.status})`);
      break;
    }
  }

  const hpResult = await ensureHomepage(ctx);
  if (hpResult) probes.push(toProbe(hpResult));
  const html = ctx.homepageHtml || "";
  if (/contactPoint|support.*email|mailto:/i.test(html)) {
    signals.push("Contact/support information in page");
  }

  for (const docUrl of ctx.docUrls) {
    const { body, probe } = await fetchPageCached(ctx, docUrl);
    if (probe) probes.push(probe);
    if (body && /webhook|event.*notification|callback\s*url/i.test(body)) {
      signals.push("Webhook documentation found");
      break;
    }
  }

  // Check nested JSON API responses for support/status links
  for (const resp of ctx.apiResponses) {
    if (!resp.isJson || !resp.body) continue;
    try {
      const json = JSON.parse(resp.body);
      const allLinks = extractLinksFromJson(json);
      const supportLinks = linksByCategory(allLinks, "support");
      const statusLinks = linksByCategory(allLinks, "status");
      for (const sl of supportLinks) {
        signals.push(`Support link via JSON "${sl.path}": ${sl.url}`);
      }
      for (const sl of statusLinks) {
        signals.push(`Status link via JSON "${sl.path}": ${sl.url}`);
      }
    } catch { /* ignore */ }
  }

  if (signals.length >= 2) {
    return makeResult(check, "pass", `Machine-readable support paths found: ${signals.join("; ")}.`, { probes, details: { signals } });
  }
  if (signals.length > 0) {
    return makeResult(check, "warn", `Partial support paths: ${signals.join("; ")}. Checked: ${statusPaths.map((p) => ctx.baseUrl + p).join(", ")} for status API; homepage for contact info; docs for webhooks.`, { probes, details: { signals } });
  }
  return makeResult(check, "fail", `No machine-readable support paths found. Checked: ${statusPaths.map((p) => ctx.baseUrl + p).join(", ")} for status API; homepage for contact info; docs for webhooks.`, { probes });
}

// ─── Cross-Domain Link Extraction ────────────────────────────────────────────

/** Extract links from a JSON response and add cross-domain ones to context */
function extractCrossDomainLinks(json: unknown, ctx: ScanContext, sourceUrl: string): void {
  if (!json || typeof json !== "object") return;
  const record = json as Record<string, unknown>;
  const baseDomain = new URL(ctx.baseUrl).hostname;

  const processValue = (key: string, value: unknown) => {
    if (typeof value === "string" && /^https?:\/\//.test(value)) {
      try {
        const linkDomain = new URL(value).hostname;
        if (linkDomain !== baseDomain) {
          ctx.crossDomainLinks.push({ href: value, label: key, source: sourceUrl });
        }
      } catch { /* not a valid URL */ }
    } else if (typeof value === "object" && value !== null) {
      extractCrossDomainLinks(value, ctx, sourceUrl);
    }
  };

  if (Array.isArray(json)) {
    json.forEach((item, i) => processValue(String(i), item));
  } else {
    for (const [key, value] of Object.entries(record)) {
      processValue(key, value);
    }
  }
}

// ─── Handler Dispatch ────────────────────────────────────────────────────────

const CHECK_HANDLERS: Record<string, (ctx: ScanContext, check: CheckDefinition) => Promise<CheckResult>> = {
  "disc-llms-txt": checkLlmsTxt,
  "disc-ai-crawler-policy": checkAiCrawlerPolicy,
  "disc-structured-data": checkStructuredData,
  "disc-sitemap": checkSitemap,
  "disc-mcp-a2a": checkMcpA2a,
  "comp-openapi": checkOpenApi,
  "comp-api-docs": checkApiDocs,
  "comp-endpoint-completeness": checkEndpointCompleteness,
  "comp-machine-pricing": checkMachinePricing,
  "use-auth-docs": checkAuthDocs,
  "use-signup-friction": checkSignupFriction,
  "use-sandbox": checkSandbox,
  "use-error-quality": checkErrorQuality,
  "use-sdk": checkSdk,
  "stab-versioning": checkVersioning,
  "stab-changelog-status": checkChangelogStatus,
  "stab-rate-limits": checkRateLimits,
  "stab-tos-agents": checkTosAgents,
  "stab-security": checkSecurityHeaders,
  "ax-first-contact": checkFirstContact,
  "ax-doc-navigability": checkDocNavigability,
  "ax-response-consistency": checkResponseConsistency,
  "ax-support-paths": checkSupportPaths,
};

/** Run a single check by its definition. */
export async function runCheck(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const handler = CHECK_HANDLERS[check.id];
  if (handler) return handler(ctx, check);

  return {
    check_id: check.id,
    name: check.name,
    status: "warn",
    finding: `Check type "${check.check_type}" is not yet implemented.`,
    recommendation: check.recommendation,
    weight: check.weight,
    probes: [],
    detectionMethod: check.how_we_check,
    confidence: "high",
    foundButUnrecognized: false,
  };
}
