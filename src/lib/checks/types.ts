/** Matches the structure of a single check in check-registry.yaml */
export interface CheckDefinition {
  id: string;
  name: string;
  check_type: string;
  paths?: string[];
  weight: "high" | "medium" | "low";
  description: string;
  recommendation: string;
  mvp: boolean;
  strale_api_checks?: string[];
  added: string;
  last_reviewed: string;
}

/** Category definition from check-registry.yaml */
export interface CategoryDefinition {
  id: string;
  label: string;
  question: string;
  checks: CheckDefinition[];
  thresholds: {
    green: string;
    yellow: string;
    red: string;
  };
}

/** The parsed check registry */
export interface CheckRegistry {
  version: string;
  last_updated: string;
  categories: CategoryDefinition[];
}

/** Result of running a single check */
export interface CheckResult {
  check_id: string;
  name: string;
  status: "pass" | "warn" | "fail";
  finding: string;
  recommendation: string;
  weight: "high" | "medium" | "low";
  details?: Record<string, unknown>;
}

export type Tier = "green" | "yellow" | "red";

/** Aggregated results for one category */
export interface CategoryResult {
  category_id: string;
  label: string;
  question: string;
  tier: Tier;
  checks: CheckResult[];
}

/** The full scan output */
export interface ScanResult {
  url: string;
  domain: string;
  scanned_at: string;
  scan_duration_ms: number;
  categories: CategoryResult[];
  scan_version: string;
}

/**
 * Shared context that accumulates findings as checks run.
 * Producers write data; consumers read it.
 */
export interface ScanContext {
  /** The target URL being scanned */
  targetUrl: string;
  /** Parsed base URL (origin) */
  baseUrl: string;

  /** HTML content of the homepage (fetched once, reused) */
  homepageHtml?: string;
  homepageHeaders?: Record<string, string>;

  /** robots.txt content if found */
  robotsTxt?: string;

  /** OpenAPI spec if discovered */
  openapiSpec?: Record<string, unknown>;
  openapiVersion?: string;
  openapiUrl?: string;

  /** Documentation URLs that were found accessible */
  docUrls: string[];

  /** API endpoint responses collected during scanning */
  apiResponses: Array<{
    url: string;
    status: number;
    contentType: string;
    isJson: boolean;
    headers: Record<string, string>;
    body?: string;
  }>;

  /** Pages fetched during the scan (url -> html), cached to avoid re-fetching */
  fetchedPages: Map<string, string>;

  /** Headers from fetched pages */
  fetchedHeaders: Map<string, Record<string, string>>;
}

export function createScanContext(url: string): ScanContext {
  const parsed = new URL(url);
  return {
    targetUrl: url,
    baseUrl: parsed.origin,
    docUrls: [],
    apiResponses: [],
    fetchedPages: new Map(),
    fetchedHeaders: new Map(),
  };
}
