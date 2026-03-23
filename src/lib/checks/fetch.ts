const USER_AGENT = "StraleBeacon/1.0 (+https://scan.strale.io)";
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

export interface FetchResult {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  body: string;
  url: string;
  redirected: boolean;
  error?: string;
}

/**
 * Fetch a URL with Beacon's standard headers, timeout, and redirect policy.
 * Never throws — returns a FetchResult with ok=false on failure.
 */
export async function beaconFetch(
  url: string,
  options: { timeoutMs?: number; maxBodyBytes?: number; headers?: Record<string, string> } = {}
): Promise<FetchResult> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, maxBodyBytes = 2 * 1024 * 1024 } = options;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/json,application/xml,text/plain,*/*",
        ...options.headers,
      },
      signal: controller.signal,
      redirect: "follow",
    });

    clearTimeout(timeout);

    // Read body with size limit
    const body = await readBodyWithLimit(response, maxBodyBytes);

    // Flatten headers
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    return {
      ok: response.ok,
      status: response.status,
      headers,
      body,
      url: response.url,
      redirected: response.redirected,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      status: 0,
      headers: {},
      body: "",
      url,
      redirected: false,
      error: message.includes("abort") ? "Timeout" : message,
    };
  }
}

async function readBodyWithLimit(
  response: Response,
  maxBytes: number
): Promise<string> {
  // For small responses, just read the text
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > maxBytes) {
    // Too large — read nothing
    return "[body too large]";
  }

  try {
    const text = await response.text();
    if (text.length > maxBytes) {
      return text.slice(0, maxBytes) + "\n[truncated]";
    }
    return text;
  } catch {
    return "[failed to read body]";
  }
}

/**
 * Fetch a URL and return just the body if successful, or null if not.
 */
export async function fetchText(url: string): Promise<string | null> {
  const result = await beaconFetch(url);
  return result.ok ? result.body : null;
}

/**
 * Fetch a URL and try to parse the body as JSON.
 * Returns null if the fetch fails or the body isn't valid JSON.
 */
export async function fetchJson(url: string): Promise<unknown | null> {
  const result = await beaconFetch(url);
  if (!result.ok) return null;
  try {
    return JSON.parse(result.body);
  } catch {
    return null;
  }
}

/**
 * Check if a URL exists (returns 2xx).
 */
export async function urlExists(url: string): Promise<boolean> {
  const result = await beaconFetch(url);
  return result.ok;
}
