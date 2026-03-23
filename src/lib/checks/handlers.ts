/**
 * Check handlers — each function implements a specific check_type or check_id.
 *
 * Every handler receives the ScanContext (shared state) and the CheckDefinition,
 * and returns a CheckResult. Handlers read from and write to the context so
 * later checks can reuse earlier findings.
 */

import type { CheckDefinition, CheckResult, ScanContext } from "./types";
import { beaconFetch } from "./fetch";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pass(check: CheckDefinition, finding: string, details?: Record<string, unknown>): CheckResult {
  return { check_id: check.id, name: check.name, status: "pass", finding, recommendation: "", weight: check.weight, details };
}

function warn(check: CheckDefinition, finding: string, details?: Record<string, unknown>): CheckResult {
  return { check_id: check.id, name: check.name, status: "warn", finding, recommendation: check.recommendation, weight: check.weight, details };
}

function fail(check: CheckDefinition, finding: string, details?: Record<string, unknown>): CheckResult {
  return { check_id: check.id, name: check.name, status: "fail", finding, recommendation: check.recommendation, weight: check.weight, details };
}

async function ensureHomepage(ctx: ScanContext): Promise<void> {
  if (ctx.homepageHtml !== undefined) return;
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
}

async function fetchPageCached(ctx: ScanContext, url: string): Promise<{ body: string; headers: Record<string, string>; status: number } | null> {
  if (ctx.fetchedPages.has(url)) {
    return { body: ctx.fetchedPages.get(url)!, headers: ctx.fetchedHeaders.get(url) || {}, status: 200 };
  }
  const result = await beaconFetch(url);
  if (result.ok) {
    ctx.fetchedPages.set(url, result.body);
    ctx.fetchedHeaders.set(url, result.headers);
    return { body: result.body, headers: result.headers, status: result.status };
  }
  return null;
}

// ─── Discoverability Checks ──────────────────────────────────────────────────

/** disc-llms-txt: Check for llms.txt presence and quality */
export async function checkLlmsTxt(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const paths = check.paths || ["/llms.txt", "/llms-full.txt"];
  const found: string[] = [];
  let bestContent = "";

  for (const p of paths) {
    const url = ctx.baseUrl + p;
    const result = await beaconFetch(url);
    if (result.ok && result.body.length > 0) {
      found.push(p);
      if (result.body.length > bestContent.length) bestContent = result.body;
    }
  }

  if (found.length === 0) {
    return fail(check, "No llms.txt file found. AI agents cannot discover your product's capabilities in a machine-readable format.");
  }

  // Analyze quality: does it contain capability-like content?
  const lower = bestContent.toLowerCase();
  const hasCapabilities = /capabilit|endpoint|api|function|tool|action|service|feature/i.test(bestContent);
  const lineCount = bestContent.split("\n").filter((l) => l.trim()).length;

  if (hasCapabilities && lineCount > 5) {
    return pass(check, `Found ${found.join(", ")} with ${lineCount} lines of structured capability information.`, { found, lineCount });
  }

  return warn(check, `Found ${found.join(", ")} but content appears to be a basic company description without detailed capability information (${lineCount} lines).`, { found, lineCount });
}

/** disc-ai-crawler-policy: Parse robots.txt for AI crawler rules */
export async function checkAiCrawlerPolicy(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const url = ctx.baseUrl + "/robots.txt";
  const result = await beaconFetch(url);

  if (!result.ok) {
    return warn(check, "No robots.txt found. AI crawlers will use default crawling behavior.");
  }

  ctx.robotsTxt = result.body;

  const crawlers = ["GPTBot", "ClaudeBot", "Claude-Web", "PerplexityBot", "Google-Extended", "Amazonbot", "CCBot", "Bytespider", "cohere-ai", "Diffbot"];
  const lines = result.body.split("\n").map((l) => l.trim());

  const status: Record<string, "allowed" | "blocked" | "unaddressed"> = {};

  for (const crawler of crawlers) {
    const crawlerLower = crawler.toLowerCase();
    let found = false;

    // Check for specific User-agent blocks
    let inCrawlerBlock = false;
    let inWildcardBlock = false;

    for (const line of lines) {
      const lineLower = line.toLowerCase();
      if (lineLower.startsWith("user-agent:")) {
        const agent = lineLower.replace("user-agent:", "").trim();
        inCrawlerBlock = agent === crawlerLower;
        inWildcardBlock = agent === "*";
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

    if (!found) {
      status[crawler] = "unaddressed";
    }
  }

  const blocked = Object.entries(status).filter(([, s]) => s === "blocked").map(([c]) => c);
  const allowed = Object.entries(status).filter(([, s]) => s === "allowed").map(([c]) => c);
  const unaddressed = Object.entries(status).filter(([, s]) => s === "unaddressed").map(([c]) => c);

  if (blocked.length >= crawlers.length / 2) {
    return fail(check, `robots.txt blocks ${blocked.length}/${crawlers.length} AI crawlers: ${blocked.join(", ")}.`, { status });
  }

  if (blocked.length > 0) {
    return warn(check, `robots.txt blocks some AI crawlers (${blocked.join(", ")}) but allows others. ${unaddressed.length} unaddressed.`, { status });
  }

  if (allowed.length > 0) {
    return pass(check, `robots.txt explicitly allows ${allowed.length} AI crawlers. ${unaddressed.length} unaddressed (default: allowed).`, { status });
  }

  return warn(check, `robots.txt exists but doesn't specifically address any AI crawlers. All ${crawlers.length} are unaddressed (default: allowed).`, { status });
}

/** disc-structured-data: Check homepage for JSON-LD / structured data */
export async function checkStructuredData(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  await ensureHomepage(ctx);
  const html = ctx.homepageHtml || "";

  // Extract JSON-LD blocks
  const jsonLdBlocks: unknown[] = [];
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      jsonLdBlocks.push(JSON.parse(match[1]));
    } catch { /* ignore parse errors */ }
  }

  // Check for relevant Schema.org types
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

  // Check for microdata
  const hasMicrodata = /itemtype=["']https?:\/\/schema\.org\/(SoftwareApplication|WebAPI|Product)/i.test(html);
  if (hasMicrodata) foundTypes.push("Microdata");

  if (foundTypes.length > 0) {
    return pass(check, `Found structured data with relevant types: ${[...new Set(foundTypes)].join(", ")}.`, { jsonLdCount: jsonLdBlocks.length, types: foundTypes });
  }

  if (jsonLdBlocks.length > 0) {
    return warn(check, `Found ${jsonLdBlocks.length} JSON-LD block(s) but none describe product capabilities (no SoftwareApplication, WebAPI, etc.).`, { jsonLdCount: jsonLdBlocks.length });
  }

  return fail(check, "No structured data (JSON-LD, Microdata) found on the homepage. Agents cannot programmatically understand what this product does.");
}

/** disc-sitemap: Check sitemap.xml */
export async function checkSitemap(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const url = ctx.baseUrl + "/sitemap.xml";
  const result = await beaconFetch(url);

  if (!result.ok) {
    return fail(check, "No sitemap.xml found.", { url });
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
    return pass(check, `sitemap.xml found with ${urlCount} URLs, including ${included.join(", ")}.`, { urlCount, includes: included });
  }

  if (urlCount > 0) {
    return warn(check, `sitemap.xml found with ${urlCount} URLs but ${included.length === 0 ? "no developer-facing pages detected" : `only includes ${included.join(", ")}`}.`, { urlCount, includes: included });
  }

  return warn(check, "sitemap.xml found but appears empty or unparseable.");
}

/** disc-mcp-a2a: Check for MCP/A2A discovery endpoints */
export async function checkMcpA2a(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const paths = check.paths || ["/.well-known/mcp.json", "/.well-known/agent.json"];
  const found: string[] = [];
  const details: Record<string, unknown> = {};

  for (const p of paths) {
    const url = ctx.baseUrl + p;
    const result = await beaconFetch(url);
    if (result.ok) {
      found.push(p);
      try {
        details[p] = JSON.parse(result.body);
      } catch {
        details[p] = "present but not valid JSON";
      }
    }
  }

  if (found.length > 0) {
    return pass(check, `Agent discovery endpoint(s) found: ${found.join(", ")}. Agents can programmatically discover this product.`, details);
  }

  return fail(check, "No MCP server manifest or A2A agent card found. Agents cannot discover interaction endpoints automatically.");
}

// ─── Comprehension Checks ────────────────────────────────────────────────────

/** comp-openapi: Discover OpenAPI/Swagger spec */
export async function checkOpenApi(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const paths = check.paths || ["/openapi.json", "/swagger.json", "/api/openapi.json", "/docs/openapi.json", "/api-docs"];

  for (const p of paths) {
    const url = ctx.baseUrl + p;
    const result = await beaconFetch(url);
    if (!result.ok) continue;

    let spec: Record<string, unknown>;
    try {
      spec = JSON.parse(result.body) as Record<string, unknown>;
    } catch {
      continue;
    }

    // Determine OpenAPI version
    const version = (spec.openapi as string) || (spec.swagger as string) || "unknown";
    const paths_ = spec.paths as Record<string, unknown> | undefined;
    const endpointCount = paths_ ? Object.keys(paths_).length : 0;

    // Store in context for downstream checks
    ctx.openapiSpec = spec;
    ctx.openapiVersion = version;
    ctx.openapiUrl = url;

    return pass(check, `OpenAPI spec found at ${p} (version ${version}) with ${endpointCount} endpoints.`, { url: p, version, endpointCount });
  }

  // Also check if the homepage links to an API spec
  await ensureHomepage(ctx);
  const html = ctx.homepageHtml || "";
  const specLinkMatch = html.match(/href=["']([^"']*(?:openapi|swagger)[^"']*)["']/i);
  if (specLinkMatch) {
    return warn(check, `No spec at standard locations, but found a potential spec link in HTML: ${specLinkMatch[1]}`, { linkFound: specLinkMatch[1] });
  }

  return fail(check, "No OpenAPI or Swagger specification found at any standard location. Agents cannot programmatically understand your API surface.");
}

/** comp-api-docs: Check if API documentation is publicly accessible */
export async function checkApiDocs(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const paths = check.paths || ["/docs", "/api", "/developers", "/api-reference"];
  const accessible: string[] = [];
  const redirectsToLogin: string[] = [];

  for (const p of paths) {
    const url = ctx.baseUrl + p;
    const result = await beaconFetch(url);
    if (result.ok) {
      // Check if redirected to login
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

  if (accessible.length > 0) {
    return pass(check, `API documentation publicly accessible at: ${accessible.join(", ")}.`, { accessible, redirectsToLogin });
  }

  if (redirectsToLogin.length > 0) {
    return fail(check, `Documentation pages redirect to login: ${redirectsToLogin.join(", ")}. Agents cannot access docs without authentication.`, { redirectsToLogin });
  }

  return fail(check, "No publicly accessible API documentation found at standard locations (/docs, /api, /developers, /api-reference).");
}

/** comp-endpoint-completeness: Analyze OpenAPI spec completeness */
export async function checkEndpointCompleteness(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  if (!ctx.openapiSpec) {
    return fail(check, "No OpenAPI spec available to analyze. Cannot assess endpoint documentation completeness.");
  }

  const paths = ctx.openapiSpec.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) {
    return warn(check, "OpenAPI spec found but contains no paths/endpoints.");
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
    return pass(check, `Good documentation completeness: ${descriptionPct}% of endpoints documented, ${schemaPct}% have response schemas.`, details);
  }

  if (descriptionPct >= 40) {
    return warn(check, `Partial documentation: ${descriptionPct}% of ${totalEndpoints} endpoints have descriptions, ${schemaPct}% have response schemas.`, details);
  }

  return fail(check, `Poor documentation: only ${descriptionPct}% of ${totalEndpoints} endpoints have descriptions. ${paramPct}% of parameters documented.`, details);
}

/** comp-machine-pricing: Check for machine-readable pricing */
export async function checkMachinePricing(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const pricingUrl = ctx.baseUrl + "/pricing";
  const page = await fetchPageCached(ctx, pricingUrl);

  if (!page) {
    // Check homepage for pricing structured data
    await ensureHomepage(ctx);
    const html = ctx.homepageHtml || "";
    if (/"price"|"priceCurrency"|"offers"/i.test(html)) {
      return warn(check, "No dedicated pricing page found, but homepage contains pricing-related structured data.");
    }
    return fail(check, "No pricing page found. Agents cannot determine the cost of using this service.");
  }

  const html = page.body;

  // Check for structured pricing data
  const hasJsonLdPricing = /"price"|"priceCurrency"|"offers"/i.test(html);
  const hasPricingTable = /<table[\s\S]*?(?:price|plan|tier|month|year|free)/i.test(html);
  const isContactOnly = /contact\s+(?:us|sales)|request\s+(?:a\s+)?(?:demo|quote|pricing)/i.test(html) && !hasPricingTable;

  if (hasJsonLdPricing) {
    return pass(check, "Pricing page includes structured data (JSON-LD) with pricing information.", { hasJsonLd: true, hasTable: hasPricingTable });
  }

  if (hasPricingTable) {
    return warn(check, "Pricing page has tabular pricing data but no machine-readable structured data (JSON-LD).", { hasTable: true });
  }

  if (isContactOnly) {
    return fail(check, 'Pricing page exists but only offers "contact us" — no machine-readable pricing information.');
  }

  return warn(check, "Pricing page exists but no clear machine-readable pricing format detected.");
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

  // Check OpenAPI spec security schemes
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

  // Check documentation pages
  for (const docUrl of ctx.docUrls) {
    const page = await fetchPageCached(ctx, docUrl);
    if (!page) continue;

    for (const [method, regex] of Object.entries(authKeywords)) {
      if (regex.test(page.body) && !foundMethods.includes(method)) {
        foundMethods.push(method);
        if (!sources.includes("documentation")) sources.push("documentation");
      }
    }
  }

  // Check homepage
  await ensureHomepage(ctx);
  for (const [method, regex] of Object.entries(authKeywords)) {
    if (regex.test(ctx.homepageHtml || "") && !foundMethods.includes(method)) {
      foundMethods.push(method);
      if (!sources.includes("homepage")) sources.push("homepage");
    }
  }

  if (foundMethods.length > 0 && sources.includes("OpenAPI spec")) {
    return pass(check, `Authentication documented in ${sources.join(", ")}: ${foundMethods.join(", ")}.`, { methods: foundMethods, sources });
  }

  if (foundMethods.length > 0) {
    return warn(check, `Authentication methods mentioned (${foundMethods.join(", ")}) but not in a machine-readable format (no OpenAPI security schemes).`, { methods: foundMethods, sources });
  }

  return fail(check, "No authentication documentation found. Agents cannot determine how to authenticate with this service.");
}

/** use-signup-friction: Analyze signup friction */
export async function checkSignupFriction(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  // Look for signup pages
  const signupPaths = ["/signup", "/register", "/sign-up", "/get-started"];
  let signupHtml = "";

  for (const p of signupPaths) {
    const page = await fetchPageCached(ctx, ctx.baseUrl + p);
    if (page) {
      signupHtml = page.body;
      break;
    }
  }

  // Also check homepage and docs for signup mentions
  await ensureHomepage(ctx);
  const allHtml = signupHtml + (ctx.homepageHtml || "");

  const frictionPoints: string[] = [];

  if (/captcha|recaptcha|hcaptcha|turnstile/i.test(allHtml)) frictionPoints.push("CAPTCHA");
  if (/email\s*verif|verify.*email|confirm.*email/i.test(allHtml)) frictionPoints.push("email verification");
  if (/phone\s*verif|sms\s*verif|verify.*phone/i.test(allHtml)) frictionPoints.push("phone verification");
  if (/credit\s*card|payment\s*method|billing\s*info/i.test(allHtml) && !/free\s*(?:tier|plan|trial)/i.test(allHtml)) frictionPoints.push("credit card required");
  if (/manual\s*(?:review|approval)|pending\s*approval|waitlist/i.test(allHtml)) frictionPoints.push("manual approval/waitlist");

  if (frictionPoints.length === 0 && signupHtml) {
    return pass(check, "Signup page found with minimal friction — no CAPTCHA, phone verification, or manual approval detected.", { frictionPoints });
  }

  if (frictionPoints.length === 0 && !signupHtml) {
    return warn(check, "No dedicated signup page found at standard locations. Could not assess signup friction.");
  }

  if (frictionPoints.length <= 1) {
    return warn(check, `Signup has some friction: ${frictionPoints.join(", ")}. Agents may struggle with these steps.`, { frictionPoints });
  }

  return fail(check, `High signup friction detected: ${frictionPoints.join(", ")}. Agents cannot navigate these human-verification steps.`, { frictionPoints });
}

/** use-sandbox: Check for sandbox/test environment */
export async function checkSandbox(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const keywords = /sandbox|test\s*mode|test\s*key|free\s*tier|free\s*plan|trial|playground|demo\s*(?:api|key|account|environment)/i;

  // Check docs, pricing, and homepage
  const pagesToCheck = [...ctx.docUrls, ctx.baseUrl + "/pricing", ctx.baseUrl];
  const foundIn: string[] = [];

  for (const url of pagesToCheck) {
    const page = await fetchPageCached(ctx, url);
    if (page && keywords.test(page.body)) {
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
    return pass(check, `Sandbox/test environment references found in: ${foundIn.join(", ")}.`, { foundIn });
  }

  return fail(check, "No sandbox, test mode, free tier, or playground detected. Agents have no way to try the service without commitment.");
}

/** use-error-quality: Check error response quality */
export async function checkErrorQuality(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const apiPaths = ["/api", "/v1", "/api/v1", "/api/v2"];
  let bestResponse: { url: string; status: number; contentType: string; isJson: boolean; body: string } | null = null;

  for (const p of apiPaths) {
    const url = ctx.baseUrl + p;
    const result = await beaconFetch(url);
    const contentType = result.headers["content-type"] || "";
    const isJson = contentType.includes("json");

    ctx.apiResponses.push({
      url,
      status: result.status,
      contentType,
      isJson,
      headers: result.headers,
      body: result.body.slice(0, 2000),
    });

    if (!bestResponse || (isJson && !bestResponse.isJson)) {
      bestResponse = { url, status: result.status, contentType, isJson, body: result.body.slice(0, 2000) };
    }
  }

  if (!bestResponse || bestResponse.status === 0) {
    return warn(check, "Could not reach any API endpoints to test error response quality.", { testedPaths: apiPaths });
  }

  if (bestResponse.isJson) {
    try {
      const json = JSON.parse(bestResponse.body);
      const hasErrorCode = json.error || json.code || json.status || json.message;
      if (hasErrorCode) {
        return pass(check, `API returns structured JSON error responses with error information at ${bestResponse.url}.`, { sampleStatus: bestResponse.status });
      }
      return warn(check, `API returns JSON at ${bestResponse.url} but without standard error code/message fields.`, { sampleStatus: bestResponse.status });
    } catch {
      return warn(check, `API endpoint at ${bestResponse.url} claims JSON content-type but body is not valid JSON.`);
    }
  }

  if (bestResponse.body.includes("<html") || bestResponse.body.includes("<!DOCTYPE")) {
    return fail(check, `API endpoints return HTML instead of JSON. First contact at ${bestResponse.url} returns an HTML page.`, { contentType: bestResponse.contentType });
  }

  return warn(check, `API response at ${bestResponse.url} is neither JSON nor HTML (Content-Type: ${bestResponse.contentType}).`);
}

/** use-sdk: Check for SDK availability */
export async function checkSdk(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const sdkKeywords = /\bnpm\b|npx|pip\s+install|gem\s+install|composer|nuget|cargo|sdk|client\s*library|package/i;
  const frameworkKeywords = /langchain|crewai|autogen|semantic.kernel|vercel\s*ai|llamaindex/i;

  const foundSdk: string[] = [];
  const foundFramework: string[] = [];

  const pagesToCheck = [...ctx.docUrls, ctx.baseUrl];
  for (const url of pagesToCheck) {
    const page = await fetchPageCached(ctx, url);
    if (!page) continue;

    if (sdkKeywords.test(page.body)) foundSdk.push(new URL(url).pathname || "/");
    if (frameworkKeywords.test(page.body)) foundFramework.push(new URL(url).pathname || "/");
  }

  if (foundSdk.length > 0 && foundFramework.length > 0) {
    return pass(check, `SDKs/packages mentioned in ${foundSdk.join(", ")}. Framework integrations found in ${foundFramework.join(", ")}.`, { foundSdk, foundFramework });
  }

  if (foundSdk.length > 0) {
    return warn(check, `SDK/package references found in ${foundSdk.join(", ")} but no agent framework integrations (LangChain, CrewAI, etc.) detected.`, { foundSdk });
  }

  return fail(check, "No SDK, client library, or package manager references found. Agents must build integrations from scratch.");
}

// ─── Stability Checks ────────────────────────────────────────────────────────

/** stab-versioning: Check for API versioning */
export async function checkVersioning(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const versionSignals: string[] = [];

  // Check OpenAPI spec
  if (ctx.openapiSpec) {
    const info = ctx.openapiSpec.info as Record<string, unknown> | undefined;
    if (info?.version) versionSignals.push(`OpenAPI spec version: ${info.version}`);

    const servers = ctx.openapiSpec.servers as Array<Record<string, unknown>> | undefined;
    if (servers?.some((s) => /\/v\d+/i.test(String(s.url || "")))) {
      versionSignals.push("Versioned server URLs in spec");
    }
  }

  // Check API responses for version headers or URL patterns
  for (const resp of ctx.apiResponses) {
    if (resp.headers["api-version"] || resp.headers["x-api-version"]) {
      versionSignals.push(`Version header: ${resp.headers["api-version"] || resp.headers["x-api-version"]}`);
    }
    if (/\/v\d+/i.test(resp.url)) {
      versionSignals.push(`Versioned URL pattern: ${resp.url}`);
    }
  }

  // Check docs for deprecation policy
  let hasDeprecationPolicy = false;
  for (const docUrl of ctx.docUrls) {
    const page = await fetchPageCached(ctx, docUrl);
    if (page && /deprecat|sunset|migration\s*guide|breaking\s*change/i.test(page.body)) {
      hasDeprecationPolicy = true;
      versionSignals.push("Deprecation/migration documentation found");
    }
  }

  if (versionSignals.length >= 2) {
    return pass(check, `API versioning detected: ${versionSignals.join("; ")}.`, { signals: versionSignals });
  }

  if (versionSignals.length > 0) {
    return warn(check, `Partial versioning: ${versionSignals.join("; ")}. ${hasDeprecationPolicy ? "" : "No deprecation policy found."}`, { signals: versionSignals });
  }

  return fail(check, "No API versioning detected. No version in URLs, headers, or documentation. No deprecation policy found.");
}

/** stab-changelog-status: Check for changelog and status page */
export async function checkChangelogStatus(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const paths = ["/changelog", "/changes", "/release-notes", "/status", "/updates"];
  const found: string[] = [];

  for (const p of paths) {
    const url = ctx.baseUrl + p;
    const result = await beaconFetch(url);
    if (result.ok) found.push(p);
  }

  // Check for statuspage.io or similar in homepage
  await ensureHomepage(ctx);
  const html = ctx.homepageHtml || "";
  const statusPageLink = html.match(/href=["']([^"']*(?:statuspage\.io|status\.[^"']+|uptime[^"']*))["']/i);
  if (statusPageLink) found.push(`external status: ${statusPageLink[1]}`);

  if (found.length >= 2) {
    return pass(check, `Changelog and status signals found: ${found.join(", ")}.`, { found });
  }

  if (found.length > 0) {
    return warn(check, `Partial: found ${found.join(", ")} but missing ${found.some((f) => f.includes("status")) ? "changelog" : "status page"}.`, { found });
  }

  return fail(check, "No changelog, release notes, or status page found. Agents cannot track breaking changes or service health.");
}

/** stab-rate-limits: Check for rate limit documentation */
export async function checkRateLimits(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const rateLimitHeaders: Record<string, string> = {};

  // Check API response headers
  for (const resp of ctx.apiResponses) {
    for (const [key, value] of Object.entries(resp.headers)) {
      if (/rate.?limit|x-ratelimit|retry-after/i.test(key)) {
        rateLimitHeaders[key] = value;
      }
    }
  }

  // Check docs for rate limit mentions
  let docMentions = false;
  for (const docUrl of ctx.docUrls) {
    const page = await fetchPageCached(ctx, docUrl);
    if (page && /rate\s*limit|throttl|requests?\s*per\s*(second|minute|hour|day)|quota/i.test(page.body)) {
      docMentions = true;
      break;
    }
  }

  if (Object.keys(rateLimitHeaders).length > 0 && docMentions) {
    return pass(check, `Rate limits documented and headers present: ${Object.keys(rateLimitHeaders).join(", ")}.`, { headers: rateLimitHeaders, docMentions });
  }

  if (Object.keys(rateLimitHeaders).length > 0) {
    return warn(check, `Rate limit headers found (${Object.keys(rateLimitHeaders).join(", ")}) but no documentation about limits.`, { headers: rateLimitHeaders });
  }

  if (docMentions) {
    return warn(check, "Rate limits mentioned in documentation but no X-RateLimit headers in API responses.", { docMentions });
  }

  return fail(check, "No rate limit documentation or headers found. Agents cannot self-throttle to avoid being blocked.");
}

/** stab-tos-agents: Check ToS for agent compatibility */
export async function checkTosAgents(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const paths = check.paths || ["/terms", "/tos", "/terms-of-service", "/legal/terms"];
  let tosContent = "";

  for (const p of paths) {
    const url = ctx.baseUrl + p;
    const page = await fetchPageCached(ctx, url);
    if (page) {
      tosContent = page.body;
      break;
    }
  }

  if (!tosContent) {
    return warn(check, "No Terms of Service page found at standard locations. Cannot assess agent compatibility.");
  }

  const lower = tosContent.toLowerCase();
  const prohibits = /prohibit.*(?:bot|automat|scrap|crawl)|no\s+(?:bot|automat|scrap)|(?:bot|automat|scrap).*(?:not\s+(?:allowed|permitted)|prohibited|forbidden)/i.test(tosContent);
  const permits = /(?:api|automat|bot|programmat).*(?:allowed|permitted|welcome)|allow.*(?:api|automat|bot)/i.test(tosContent);
  const mentionsApi = /\bapi\b/i.test(tosContent);
  const mentionsBots = /\bbot|automat|scrap|crawl/i.test(tosContent);

  if (prohibits) {
    return fail(check, "Terms of Service appear to prohibit automated access or bots. Agents may be violating ToS by interacting.", { prohibits, permits, mentionsApi });
  }

  if (permits || (mentionsApi && !prohibits)) {
    return pass(check, "Terms of Service address API/automated access without prohibiting it.", { permits, mentionsApi });
  }

  if (mentionsBots) {
    return warn(check, "Terms of Service mention bots/automation but it's unclear if agent access is permitted or prohibited.", { mentionsBots });
  }

  return warn(check, "Terms of Service exist but are silent on automated access, bots, or API usage.");
}

/** stab-security: Check security headers */
export async function checkSecurityHeaders(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  await ensureHomepage(ctx);
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
    return pass(check, `Good security posture: ${passed.join(", ")} present.${missing.length > 0 ? ` Missing: ${missing.join(", ")}.` : ""}`, { checks });
  }

  if (checks.https && passed.length >= 2) {
    return warn(check, `HTTPS enforced. Present: ${passed.join(", ")}. Missing: ${missing.join(", ")}.`, { checks });
  }

  if (!checks.https) {
    return fail(check, "HTTPS not enforced. This is a critical security issue for agent interactions.", { checks });
  }

  return fail(check, `Weak security headers. Only ${passed.join(", ")} present. Missing: ${missing.join(", ")}.`, { checks });
}

// ─── Agent Experience Checks ─────────────────────────────────────────────────

/** ax-first-contact: First contact response quality */
export async function checkFirstContact(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  // Use already-collected API responses, or try new endpoints
  if (ctx.apiResponses.length === 0) {
    const apiPaths = ["/api", "/v1", "/api/v1"];
    for (const p of apiPaths) {
      const result = await beaconFetch(ctx.baseUrl + p);
      ctx.apiResponses.push({
        url: ctx.baseUrl + p,
        status: result.status,
        contentType: result.headers["content-type"] || "",
        isJson: (result.headers["content-type"] || "").includes("json"),
        headers: result.headers,
        body: result.body.slice(0, 2000),
      });
    }
  }

  const jsonResponses = ctx.apiResponses.filter((r) => r.isJson);
  const htmlResponses = ctx.apiResponses.filter((r) => (r.body || "").includes("<html") || (r.body || "").includes("<!DOCTYPE"));
  const timeouts = ctx.apiResponses.filter((r) => r.status === 0);

  if (jsonResponses.length > 0) {
    const best = jsonResponses[0];
    let hasDocLinks = false;
    try {
      const json = JSON.parse(best.body || "");
      hasDocLinks = /doc|link|href|url/i.test(JSON.stringify(json));
    } catch { /* ignore */ }

    if (hasDocLinks) {
      return pass(check, `First contact at ${best.url} returns structured JSON with documentation links.`, { status: best.status });
    }
    return warn(check, `First contact at ${best.url} returns JSON (good) but without documentation links for self-navigation.`, { status: best.status });
  }

  if (timeouts.length === ctx.apiResponses.length) {
    return fail(check, "All API endpoint requests timed out. Agent's first impression: the service is unreachable.");
  }

  if (htmlResponses.length > 0) {
    return fail(check, "API endpoints return HTML pages instead of structured data. An agent cannot parse the first-contact response.");
  }

  return warn(check, "No clear API endpoints found. An agent arriving at this product has no obvious machine-readable entry point.");
}

/** ax-doc-navigability: Documentation navigability from homepage */
export async function checkDocNavigability(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  await ensureHomepage(ctx);
  const html = ctx.homepageHtml || "";

  // Look for documentation links in the homepage
  const docPatterns = /href=["']([^"']*(?:\/docs|\/api|\/developer|\/reference|\/api-reference)[^"']*)["']/gi;
  const docLinks: string[] = [];
  let match;
  while ((match = docPatterns.exec(html)) !== null) {
    docLinks.push(match[1]);
  }

  // Also check for links in nav/header/footer
  const navDocPattern = /(?:documentation|api\s*docs|developer|api\s*reference)/i;
  const hasNavDocLink = navDocPattern.test(html);

  if (docLinks.length > 0) {
    return pass(check, `API documentation directly linked from homepage (${docLinks.length} link(s) found). Reachable in 1 hop.`, { docLinks: docLinks.slice(0, 5), hops: 1 });
  }

  if (hasNavDocLink) {
    return warn(check, "Documentation mentioned in homepage text/navigation but no direct HTML links to doc pages found. May require JavaScript navigation.", { hops: "unknown" });
  }

  if (ctx.docUrls.length > 0) {
    return warn(check, `Documentation exists at ${ctx.docUrls[0]} but is not linked from the homepage. Agents must guess the URL.`, { hops: "not linked" });
  }

  return fail(check, "No documentation links found on the homepage. An agent cannot navigate from the homepage to API documentation.");
}

/** ax-response-consistency: Check response format consistency */
export async function checkResponseConsistency(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  if (ctx.apiResponses.length === 0) {
    return warn(check, "No API responses collected during scan. Cannot assess response format consistency.");
  }

  const jsonCount = ctx.apiResponses.filter((r) => r.isJson).length;
  const htmlCount = ctx.apiResponses.filter((r) => ((r.body || "").includes("<html") || (r.body || "").includes("<!DOCTYPE")) && !r.isJson).length;
  const total = ctx.apiResponses.length;

  const correctContentType = ctx.apiResponses.filter((r) => {
    if (r.isJson) return r.contentType.includes("json");
    return true;
  }).length;

  if (jsonCount === total && correctContentType === total) {
    return pass(check, `All ${total} API responses are consistently JSON with correct Content-Type headers.`, { jsonCount, total });
  }

  if (jsonCount > 0 && htmlCount > 0) {
    return warn(check, `Inconsistent response formats: ${jsonCount}/${total} JSON, ${htmlCount}/${total} HTML. Mixed formats confuse agents.`, { jsonCount, htmlCount, total });
  }

  if (jsonCount > 0) {
    return warn(check, `${jsonCount}/${total} responses are JSON. Some have incorrect Content-Type headers.`, { jsonCount, correctContentType, total });
  }

  return fail(check, `No JSON API responses found among ${total} tested endpoints. All responses are non-JSON formats.`, { jsonCount, htmlCount, total });
}

/** ax-support-paths: Check for machine-readable support paths */
export async function checkSupportPaths(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const signals: string[] = [];

  // Check for status API
  const statusPaths = ["/api/status", "/api/health", "/health", "/api/v1/status"];
  for (const p of statusPaths) {
    const result = await beaconFetch(ctx.baseUrl + p);
    if (result.ok && (result.headers["content-type"] || "").includes("json")) {
      signals.push(`Status endpoint: ${p}`);
      break;
    }
  }

  // Check structured data for support email
  await ensureHomepage(ctx);
  const html = ctx.homepageHtml || "";
  if (/contactPoint|support.*email|mailto:/i.test(html)) {
    signals.push("Contact/support information in page");
  }

  // Check for webhook documentation
  for (const docUrl of ctx.docUrls) {
    const page = await fetchPageCached(ctx, docUrl);
    if (page && /webhook|event.*notification|callback\s*url/i.test(page.body)) {
      signals.push("Webhook documentation found");
      break;
    }
  }

  if (signals.length >= 2) {
    return pass(check, `Machine-readable support paths found: ${signals.join("; ")}.`, { signals });
  }

  if (signals.length > 0) {
    return warn(check, `Partial support paths: ${signals.join("; ")}. Missing additional machine-readable channels.`, { signals });
  }

  return fail(check, "No machine-readable support paths found. No status API, no structured contact data, no webhook documentation.");
}

// ─── Handler Dispatch ────────────────────────────────────────────────────────

/** Map of check IDs to their handler functions */
const CHECK_HANDLERS: Record<string, (ctx: ScanContext, check: CheckDefinition) => Promise<CheckResult>> = {
  // Discoverability
  "disc-llms-txt": checkLlmsTxt,
  "disc-ai-crawler-policy": checkAiCrawlerPolicy,
  "disc-structured-data": checkStructuredData,
  "disc-sitemap": checkSitemap,
  "disc-mcp-a2a": checkMcpA2a,
  // Comprehension
  "comp-openapi": checkOpenApi,
  "comp-api-docs": checkApiDocs,
  "comp-endpoint-completeness": checkEndpointCompleteness,
  "comp-machine-pricing": checkMachinePricing,
  // Usability
  "use-auth-docs": checkAuthDocs,
  "use-signup-friction": checkSignupFriction,
  "use-sandbox": checkSandbox,
  "use-error-quality": checkErrorQuality,
  "use-sdk": checkSdk,
  // Stability
  "stab-versioning": checkVersioning,
  "stab-changelog-status": checkChangelogStatus,
  "stab-rate-limits": checkRateLimits,
  "stab-tos-agents": checkTosAgents,
  "stab-security": checkSecurityHeaders,
  // Agent Experience
  "ax-first-contact": checkFirstContact,
  "ax-doc-navigability": checkDocNavigability,
  "ax-response-consistency": checkResponseConsistency,
  "ax-support-paths": checkSupportPaths,
};

/** Run a single check by its definition. Falls back to a generic handler if no specific one exists. */
export async function runCheck(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const handler = CHECK_HANDLERS[check.id];
  if (handler) {
    return handler(ctx, check);
  }

  // Fallback: unknown check type
  return {
    check_id: check.id,
    name: check.name,
    status: "warn",
    finding: `Check type "${check.check_type}" is not yet implemented.`,
    recommendation: check.recommendation,
    weight: check.weight,
  };
}
