/**
 * Detect a related API domain from a scanned page's content.
 *
 * Looks at:
 * 1. <a href> links on the page
 * 2. JSON-LD structured data for API references
 * 3. llms.txt content for API URLs
 * 4. Common patterns: api.{domain}, developer.{domain}, docs.{domain}
 * 5. Page content or meta tags mentioning API URLs
 *
 * Returns the single best API domain suggestion, or null.
 */

const API_SUBDOMAIN_PATTERNS = ["api.", "developer.", "docs."];
const API_SUBDOMAIN_KEYWORDS = ["api", "developer"];

export function detectApiDomain(
  scannedDomain: string,
  homepageHtml?: string,
  crossDomainLinks?: Array<{ href: string; label: string }>,
): string | null {
  // Don't suggest if we're already scanning an API domain
  if (isApiDomain(scannedDomain)) return null;

  const baseDomain = getBaseDomain(scannedDomain);
  const candidates = new Map<string, number>(); // domain -> priority score

  // 1. Check cross-domain links (already extracted by the scanner)
  if (crossDomainLinks) {
    for (const link of crossDomainLinks) {
      try {
        const url = new URL(link.href);
        const hostname = url.hostname;
        if (isRelatedApiDomain(hostname, baseDomain, scannedDomain)) {
          const score = scoreCandidate(hostname, link.label);
          candidates.set(hostname, Math.max(candidates.get(hostname) || 0, score));
        }
      } catch { /* ignore invalid */ }
    }
  }

  // 2. Scan HTML for links and references we might have missed
  if (homepageHtml) {
    // Look at all href URLs
    const hrefRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
    let match;
    while ((match = hrefRegex.exec(homepageHtml)) !== null) {
      try {
        const url = new URL(match[1]);
        if (isRelatedApiDomain(url.hostname, baseDomain, scannedDomain)) {
          const score = scoreCandidate(url.hostname, url.pathname);
          candidates.set(url.hostname, Math.max(candidates.get(url.hostname) || 0, score));
        }
      } catch { /* ignore */ }
    }

    // Look in JSON-LD blocks
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    while ((match = jsonLdRegex.exec(homepageHtml)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        extractUrlsFromJson(data, baseDomain, scannedDomain, candidates);
      } catch { /* ignore */ }
    }

    // Look for common API URL patterns in page text/meta
    const urlRegex = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi;
    while ((match = urlRegex.exec(homepageHtml)) !== null) {
      const hostname = match[1].toLowerCase();
      if (isRelatedApiDomain(hostname, baseDomain, scannedDomain)) {
        candidates.set(hostname, Math.max(candidates.get(hostname) || 0, 1));
      }
    }
  }

  if (candidates.size === 0) return null;

  // Pick the best candidate: prefer api.* subdomains, then highest score
  const sorted = [...candidates.entries()].sort((a, b) => {
    const aIsApi = a[0].startsWith("api.") ? 1 : 0;
    const bIsApi = b[0].startsWith("api.") ? 1 : 0;
    if (aIsApi !== bIsApi) return bIsApi - aIsApi;
    return b[1] - a[1];
  });

  return sorted[0][0];
}

function isApiDomain(domain: string): boolean {
  return domain.startsWith("api.") || API_SUBDOMAIN_KEYWORDS.some((kw) => domain.startsWith(`${kw}.`));
}

function getBaseDomain(domain: string): string {
  const parts = domain.split(".");
  return parts.length >= 2 ? parts.slice(-2).join(".") : domain;
}

function isRelatedApiDomain(hostname: string, baseDomain: string, scannedDomain: string): boolean {
  if (hostname === scannedDomain) return false;
  const candidateBase = getBaseDomain(hostname);
  // Must share the same base domain (or be a subdomain of the scanned domain)
  if (candidateBase !== baseDomain && !hostname.endsWith(`.${scannedDomain}`)) return false;
  // Must look like an API/developer domain
  return API_SUBDOMAIN_PATTERNS.some((p) => hostname.startsWith(p)) ||
    API_SUBDOMAIN_KEYWORDS.some((kw) => hostname.includes(kw));
}

function scoreCandidate(hostname: string, context: string): number {
  let score = 1;
  if (hostname.startsWith("api.")) score += 10;
  if (hostname.startsWith("developer.")) score += 5;
  if (hostname.startsWith("docs.")) score += 3;
  if (/api/i.test(context)) score += 2;
  if (/developer/i.test(context)) score += 1;
  return score;
}

function extractUrlsFromJson(
  obj: unknown,
  baseDomain: string,
  scannedDomain: string,
  candidates: Map<string, number>,
): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) extractUrlsFromJson(item, baseDomain, scannedDomain, candidates);
    return;
  }
  for (const [, val] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof val === "string" && /^https?:\/\//.test(val)) {
      try {
        const url = new URL(val);
        if (isRelatedApiDomain(url.hostname, baseDomain, scannedDomain)) {
          candidates.set(url.hostname, Math.max(candidates.get(url.hostname) || 0, 3));
        }
      } catch { /* ignore */ }
    } else if (typeof val === "object" && val !== null) {
      extractUrlsFromJson(val, baseDomain, scannedDomain, candidates);
    }
  }
}
