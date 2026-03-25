import { NextRequest, NextResponse } from "next/server";
import { runScan } from "@/lib/checks/runner";
import { detectApiDomain, probeApiDomain } from "@/lib/detect-api-domain";
import {
  normalizeDomain,
  domainToSlug,
  upsertDomain,
  findRecentScan,
  storeScan,
  recordScanSession,
  isSupabaseConfigured,
} from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, force, sessionId } = body;

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Missing required field: url" },
        { status: 400 }
      );
    }

    // Validate and normalize URL
    let normalizedUrl: string;
    try {
      const withProtocol = url.match(/^https?:\/\//) ? url : `https://${url}`;
      const parsed = new URL(withProtocol);

      if (!["http:", "https:"].includes(parsed.protocol)) {
        return NextResponse.json(
          { error: "URL must use http or https protocol" },
          { status: 400 }
        );
      }

      const hostname = parsed.hostname;
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.startsWith("192.168.") ||
        hostname.startsWith("10.") ||
        hostname.startsWith("172.") ||
        hostname === "0.0.0.0"
      ) {
        return NextResponse.json(
          { error: "Cannot scan localhost or private IP addresses" },
          { status: 400 }
        );
      }

      normalizedUrl = parsed.origin;
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 }
      );
    }

    const domain = normalizeDomain(normalizedUrl);
    const slug = domainToSlug(domain);

    // Check for cached result (unless force=true)
    if (!force && isSupabaseConfigured()) {
      const cached = await findRecentScan(domain);
      if (cached) {
        // Still run API domain detection on cached results
        let cachedSuggestion = detectApiDomain(
          cached.results.domain,
          undefined, // no HTML available for cached results
          undefined,
        );
        if (!cachedSuggestion) {
          cachedSuggestion = await probeApiDomain(cached.results.domain);
        }
        return NextResponse.json({
          ...cached.results,
          slug: cached.slug,
          cached: true,
          ...(cachedSuggestion ? { apiDomainSuggestion: cachedSuggestion } : {}),
        });
      }
    }

    // Run the scan
    const { result, context } = await runScan(normalizedUrl);

    // Detect related API domain — first from page content, then by probing common subdomains
    let apiDomainSuggestion = detectApiDomain(
      result.domain,
      context.homepageHtml,
      context.crossDomainLinks,
    );
    if (!apiDomainSuggestion && context.domainType === "website") {
      apiDomainSuggestion = await probeApiDomain(result.domain);
    }

    // Persist to Supabase
    let finalSlug = slug;
    if (isSupabaseConfigured()) {
      try {
        const domainRow = await upsertDomain(domain);
        if (domainRow) {
          finalSlug = await storeScan(domainRow.id, domain, result, context);
        }
        // Record scan session for competitive analysis
        if (sessionId && typeof sessionId === "string") {
          recordScanSession(sessionId, domain).catch(() => {});
        }
      } catch (err) {
        // Log but don't fail the scan — persistence is best-effort
        console.error("Failed to persist scan:", err);
      }
    }

    return NextResponse.json({
      ...result,
      slug: finalSlug,
      ...(apiDomainSuggestion ? { apiDomainSuggestion } : {}),
    });
  } catch (err) {
    console.error("Scan error:", err);
    return NextResponse.json(
      {
        error: "Scan failed",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
