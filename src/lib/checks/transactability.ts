/**
 * Transactability check handlers — "Can agents do business with you?"
 */

import type { CheckDefinition, CheckResult, ScanContext, Probe } from "./types";
import { beaconFetch, type FetchResult } from "./fetch";

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
  opts: { probes?: Probe[]; confidence?: "high" | "medium" | "low"; foundButUnrecognized?: boolean; details?: Record<string, unknown> } = {}
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
    fix: status !== "pass" ? check.fix : undefined,
  };
}

// ─── Machine-readable Pricing ────────────────────────────────────────────────

export async function checkPricingStructuredData(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const probes: Probe[] = [];
  const signals: string[] = [];

  // 1. Check homepage JSON-LD for Offer/Product/PriceSpecification
  const html = ctx.homepageHtml || "";
  const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of jsonLdMatches) {
    try {
      const data = JSON.parse(m[1]);
      const str = JSON.stringify(data);
      if (/"@type"\s*:\s*"(Offer|Product|PriceSpecification|SoftwareApplication)"/i.test(str)) {
        if (/"price"/i.test(str)) {
          signals.push("Schema.org pricing found in homepage JSON-LD");
        }
      }
    } catch { /* invalid JSON-LD */ }
  }

  // 2. Check for /pricing page
  const pricingPaths = ["/pricing", "/plans", "/price"];
  for (const path of pricingPaths) {
    const url = ctx.baseUrl + path;
    if (ctx.fetchedPages.has(url)) {
      const pageHtml = ctx.fetchedPages.get(url)!;
      // Check for structured pricing on the pricing page
      const pricingJsonLd = pageHtml.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
      for (const pm of pricingJsonLd) {
        try {
          const data = JSON.parse(pm[1]);
          const str = JSON.stringify(data);
          if (/"price"/i.test(str)) {
            signals.push(`Structured pricing data found on ${path}`);
          }
        } catch { /* ignore */ }
      }
      continue;
    }

    const result = await beaconFetch(url);
    probes.push(toProbe(result));
    if (result.ok) {
      ctx.fetchedPages.set(url, result.body);
      ctx.fetchedHeaders.set(url, result.headers);

      // Check for structured data on pricing page
      const pricingJsonLd = result.body.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
      for (const pm of pricingJsonLd) {
        try {
          const data = JSON.parse(pm[1]);
          if (/"price"/i.test(JSON.stringify(data))) {
            signals.push(`Structured pricing data found on ${path}`);
          }
        } catch { /* ignore */ }
      }

      // Check if pricing page exists but has no structured data
      if (signals.length === 0 && /\$\d|€\d|£\d|pricing|price|plan/i.test(result.body)) {
        signals.push(`HUMAN_ONLY:Pricing page found at ${path} but no structured data`);
      }
    }
  }

  // 3. Check OpenAPI spec for pricing fields
  if (ctx.openapiSpec) {
    const specStr = JSON.stringify(ctx.openapiSpec);
    if (/pric(e|ing)|cost|billing|subscription/i.test(specStr)) {
      signals.push("Pricing-related fields found in OpenAPI spec");
    }
  }

  // 4. Check root JSON for pricing info
  if (ctx.domainType === "api" && ctx.homepageHtml) {
    try {
      const json = JSON.parse(ctx.homepageHtml);
      const str = JSON.stringify(json);
      if (/pric(e|ing)|cost|plan/i.test(str)) {
        signals.push("Pricing references found in API root response");
      }
    } catch { /* not JSON */ }
  }

  const structuredSignals = signals.filter((s) => !s.startsWith("HUMAN_ONLY:"));
  const humanOnlySignals = signals.filter((s) => s.startsWith("HUMAN_ONLY:")).map((s) => s.replace("HUMAN_ONLY:", ""));

  if (structuredSignals.length > 0) {
    return makeResult(check, "pass", structuredSignals.join(". ") + ".", { probes, details: { signals: structuredSignals } });
  }

  if (humanOnlySignals.length > 0) {
    return makeResult(check, "warn",
      `${humanOnlySignals[0]} — prices are only visible to humans, not agents.`,
      { probes, confidence: "medium", details: { humanOnly: humanOnlySignals } }
    );
  }

  return makeResult(check, "fail",
    "No machine-readable pricing found. Checked homepage JSON-LD, pricing pages, OpenAPI spec, and API responses.",
    { probes }
  );
}

// ─── Self-serve Provisioning ─────────────────────────────────────────────────

export async function checkSelfServeSignup(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const probes: Probe[] = [];
  const signals: string[] = [];
  const gatedSignals: string[] = [];

  const html = ctx.homepageHtml || "";

  // 1. Check HTML for self-serve signup links
  const selfServePatterns = /(?:href=["'][^"']*(?:signup|sign-up|register|get-started|developers?\/signup|console|dashboard|create-account)[^"']*["'])/gi;
  const selfServeMatches = [...html.matchAll(selfServePatterns)];
  if (selfServeMatches.length > 0) {
    signals.push(`Self-serve signup link found (${selfServeMatches.length} paths detected)`);
  }

  // Check for text indicating self-serve
  if (/get\s+(your\s+)?api\s+key|create\s+(an?\s+)?account|sign\s*up\s+free|start\s+free/i.test(html)) {
    signals.push("Self-serve signup language found in page content");
  }

  // 2. Check for human-gated access (negative signal)
  if (/contact\s+(us|sales)|request\s+access|book\s+a?\s*demo|schedule\s+a?\s*call|talk\s+to\s+sales/i.test(html)) {
    gatedSignals.push("Sales-gated access detected");
  }

  // 3. Check OpenAPI spec for security schemes
  if (ctx.openapiSpec) {
    const spec = ctx.openapiSpec as Record<string, unknown>;
    const components = spec.components as Record<string, unknown> | undefined;
    const securitySchemes = components?.securitySchemes as Record<string, unknown> | undefined;
    if (securitySchemes && Object.keys(securitySchemes).length > 0) {
      signals.push(`Auth schemes documented: ${Object.keys(securitySchemes).join(", ")}`);
    }
  }

  // 4. Check for OAuth discovery
  const oauthUrl = ctx.baseUrl + "/.well-known/openid-configuration";
  const oauthResult = await beaconFetch(oauthUrl);
  probes.push(toProbe(oauthResult));
  if (oauthResult.ok) {
    signals.push("OpenID Connect discovery endpoint found");
  }

  // 5. Check root JSON for developer links
  if (ctx.domainType === "api" && ctx.homepageHtml) {
    try {
      const json = JSON.parse(ctx.homepageHtml);
      const str = JSON.stringify(json).toLowerCase();
      if (/signup|developer|register|get.?started|api.?key/i.test(str)) {
        signals.push("Developer onboarding links found in API root response");
      }
    } catch { /* not JSON */ }
  }

  if (signals.length > 0 && gatedSignals.length === 0) {
    return makeResult(check, "pass", signals.join(". ") + ".", { probes, details: { signals } });
  }

  if (signals.length > 0 && gatedSignals.length > 0) {
    return makeResult(check, "warn",
      `Self-serve path exists (${signals[0]}) but also found sales-gated access signals. Verify the self-serve path works without human approval.`,
      { probes, confidence: "medium", details: { signals, gatedSignals } }
    );
  }

  if (gatedSignals.length > 0) {
    return makeResult(check, "fail",
      "Only human-gated access found (contact sales, request access). Agents cannot onboard themselves.",
      { probes, details: { gatedSignals } }
    );
  }

  // Auth schemes in OpenAPI without clear signup path
  const hasAuth = ctx.openapiSpec && signals.some((s) => s.includes("Auth schemes"));
  if (hasAuth) {
    return makeResult(check, "warn",
      "Auth schemes documented in OpenAPI spec but no clear self-serve provisioning path found.",
      { probes, confidence: "medium" }
    );
  }

  return makeResult(check, "fail",
    "No self-serve signup or API key provisioning path found. Checked homepage links, OpenAPI security schemes, and OAuth discovery.",
    { probes }
  );
}

// ─── Agent-Compatible Checkout ───────────────────────────────────────────────

export async function checkCheckoutFlow(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const probes: Probe[] = [];
  const signals: string[] = [];

  // 1. Check for Stripe ACP
  const acpUrl = ctx.baseUrl + "/.well-known/acp.json";
  const acpResult = await beaconFetch(acpUrl);
  probes.push(toProbe(acpResult));
  if (acpResult.ok) {
    try {
      JSON.parse(acpResult.body);
      signals.push("Stripe Agentic Commerce Protocol (ACP) endpoint found");
    } catch {
      signals.push("ACP endpoint exists but response is not valid JSON");
    }
  }

  // 2. Check for x402 payment headers
  const headers = ctx.homepageHeaders || {};
  if (headers["x-payment"] || headers["www-authenticate"]?.includes("x402")) {
    signals.push("x402 payment protocol headers detected");
  }

  // Check API responses for x402 headers
  for (const apiResp of ctx.apiResponses) {
    if (apiResp.headers["x-payment"] || apiResp.status === 402) {
      signals.push(`x402/402 payment response from ${apiResp.url}`);
      break;
    }
  }

  // 3. Check OpenAPI for payment/checkout endpoints
  if (ctx.openapiSpec) {
    const specStr = JSON.stringify(ctx.openapiSpec);
    if (/checkout|subscribe|purchase|payment|\/billing/i.test(specStr)) {
      signals.push("Payment/checkout endpoints found in OpenAPI spec");
    }
  }

  // 4. Check HTML for payment infrastructure
  const html = ctx.homepageHtml || "";
  const hasStripeJs = /js\.stripe\.com|stripe\.js/i.test(html);

  if (signals.length > 0) {
    return makeResult(check, "pass", signals.join(". ") + ".", { probes, details: { signals } });
  }

  if (hasStripeJs) {
    return makeResult(check, "warn",
      "Payment infrastructure detected (Stripe.js loaded) but no programmatic checkout flow found. As agent commerce grows, adding Stripe ACP or API-based checkout will capture agent-mediated purchases.",
      { probes, confidence: "medium" }
    );
  }

  return makeResult(check, "fail",
    "No agent-compatible transaction flow found. Checked for Stripe ACP, x402 payment protocol, and API-based checkout endpoints.",
    { probes }
  );
}

// ─── Usage and Billing Transparency ──────────────────────────────────────────

export async function checkUsageBillingSignals(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const probes: Probe[] = [];
  const signals: string[] = [];

  // Check all collected API response headers
  const headersToCheck = [
    ctx.homepageHeaders || {},
    ...ctx.apiResponses.map((r) => r.headers),
  ];

  for (const headers of headersToCheck) {
    for (const [key, value] of Object.entries(headers)) {
      const lk = key.toLowerCase();
      if (lk.startsWith("x-ratelimit-") || lk.startsWith("ratelimit-")) {
        signals.push(`${key}: ${value}`);
      }
      if (lk.startsWith("x-usage-") || lk.startsWith("x-cost-") || lk.startsWith("x-credits-")) {
        signals.push(`${key}: ${value}`);
      }
      if (lk === "retry-after") {
        signals.push(`Retry-After: ${value}`);
      }
    }
    if (signals.length > 0) break; // Found signals, no need to check more
  }

  // Check OpenAPI spec for billing endpoints
  if (ctx.openapiSpec) {
    const specStr = JSON.stringify(ctx.openapiSpec);
    if (/\/usage|\/billing|\/invoices|\/credits/i.test(specStr)) {
      signals.push("Billing/usage endpoints found in OpenAPI spec");
    }
  }

  // Deduplicate
  const uniqueSignals = [...new Set(signals)];
  const hasRateLimits = uniqueSignals.some((s) => /ratelimit|retry-after/i.test(s));
  const hasCostMetadata = uniqueSignals.some((s) => /cost|usage|credits|billing/i.test(s));

  if (hasRateLimits && hasCostMetadata) {
    return makeResult(check, "pass",
      `Rate limits and usage metadata present: ${uniqueSignals.slice(0, 4).join("; ")}.`,
      { probes, details: { signals: uniqueSignals } }
    );
  }

  if (hasRateLimits) {
    return makeResult(check, "warn",
      `Rate limit headers present (${uniqueSignals.filter((s) => /ratelimit|retry/i.test(s)).slice(0, 2).join(", ")}), but no usage/cost metadata. Agents can manage rate limits but can't track spending.`,
      { probes, details: { signals: uniqueSignals } }
    );
  }

  return makeResult(check, "fail",
    "No rate limit headers or usage metadata found in any API response. Agents can't manage capacity or track costs.",
    { probes }
  );
}

// ─── Free Tier Detection ─────────────────────────────────────────────────────

export async function checkFreeTierDetection(ctx: ScanContext, check: CheckDefinition): Promise<CheckResult> {
  const probes: Probe[] = [];
  const signals: string[] = [];
  const softSignals: string[] = [];

  const html = ctx.homepageHtml || "";

  // 1. Check JSON-LD for free offer
  const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of jsonLdMatches) {
    try {
      const data = JSON.parse(m[1]);
      const str = JSON.stringify(data);
      if (/"price"\s*:\s*"0(\.0+)?"/.test(str) || /"price"\s*:\s*0/.test(str)) {
        signals.push("Schema.org Offer with price $0 found in structured data");
      }
    } catch { /* ignore */ }
  }

  // 2. Check pricing page for free tier text
  const pricingPaths = ["/pricing", "/plans"];
  for (const path of pricingPaths) {
    const url = ctx.baseUrl + path;
    let pageHtml = ctx.fetchedPages.get(url);
    if (!pageHtml) {
      const result = await beaconFetch(url);
      probes.push(toProbe(result));
      if (result.ok) {
        pageHtml = result.body;
        ctx.fetchedPages.set(url, result.body);
      }
    }
    if (pageHtml) {
      if (/free\s+tier|free\s+plan|starter\s+plan.*free|always\s+free|\$0|€0|£0|no\s+credit\s+card/i.test(pageHtml)) {
        softSignals.push(`Free tier indicators found on ${path}`);
      }
      if (/free\s+trial|\d+[\s-]day\s+trial|try\s+(it\s+)?free/i.test(pageHtml)) {
        softSignals.push(`Free trial indicators found on ${path}`);
      }
    }
  }

  // 3. Check OpenAPI for sandbox/test servers
  if (ctx.openapiSpec) {
    const spec = ctx.openapiSpec as Record<string, unknown>;
    const servers = spec.servers as Array<{ url?: string; description?: string }> | undefined;
    if (servers) {
      for (const server of servers) {
        if (/sandbox|test|staging|demo/i.test(server.description || "")) {
          signals.push(`Sandbox server found in OpenAPI spec: ${server.url || server.description}`);
        }
      }
    }
  }

  // 4. Check root API response
  if (ctx.domainType === "api" && ctx.homepageHtml) {
    try {
      const json = JSON.parse(ctx.homepageHtml);
      const str = JSON.stringify(json).toLowerCase();
      if (/free.?tier|sandbox|trial|playground/i.test(str)) {
        softSignals.push("Free/trial references found in API root response");
      }
    } catch { /* not JSON */ }
  }

  if (signals.length > 0) {
    return makeResult(check, "pass", signals.join(". ") + ".", { probes, details: { signals } });
  }

  if (softSignals.length > 0) {
    return makeResult(check, "warn",
      `${softSignals[0]}, but not confirmed in structured data.`,
      { probes, confidence: "low", details: { softSignals } }
    );
  }

  return makeResult(check, "fail",
    "No free tier, trial, or sandbox environment found. Agents evaluating options will test products they can access for free first.",
    { probes }
  );
}
