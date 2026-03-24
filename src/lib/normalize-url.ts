/**
 * Smart URL normalization for the scan input.
 *
 * - Full URL → use as-is
 * - Domain with dot (e.g. "strale.dev") → prepend https://
 * - Bare word without dot (e.g. "strale") → try .com, .dev, .io in order
 *
 * Returns { url, candidates } where candidates is the list of URLs to try
 * when the input has no dots (bare word).
 */

const BARE_WORD_TLDS = [".com", ".dev", ".io"];

export interface NormalizedUrl {
  /** The primary URL to scan */
  url: string;
  /** For bare words: fallback URLs to try if the primary fails */
  fallbacks: string[];
}

export function normalizeUrl(input: string): NormalizedUrl {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new Error("Please enter a URL");
  }

  // Already has protocol
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      validateHostname(parsed.hostname);
      return { url: parsed.origin, fallbacks: [] };
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Cannot scan")) throw e;
      throw new Error("Please enter a valid URL (e.g., stripe.com)");
    }
  }

  // Has a dot — treat as domain, prepend https://
  if (trimmed.includes(".")) {
    // Strip any path/query for the origin, but keep the full URL for scanning
    const withProtocol = `https://${trimmed}`;
    try {
      const parsed = new URL(withProtocol);
      validateHostname(parsed.hostname);
      return { url: parsed.origin, fallbacks: [] };
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Cannot scan")) throw e;
      throw new Error("Please enter a valid URL (e.g., stripe.com)");
    }
  }

  // Bare word (no dots) — e.g. "strale" → try strale.com, strale.dev, strale.io
  if (!/^[a-zA-Z0-9-]+$/.test(trimmed)) {
    throw new Error("Please enter a valid URL (e.g., stripe.com)");
  }

  const candidates = BARE_WORD_TLDS.map((tld) => `https://${trimmed}${tld}`);
  return {
    url: candidates[0],
    fallbacks: candidates.slice(1),
  };
}

function validateHostname(hostname: string): void {
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.") ||
    hostname === "0.0.0.0"
  ) {
    throw new Error("Cannot scan localhost or private IP addresses");
  }
}
