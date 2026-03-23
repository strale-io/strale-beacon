/** Structured remediation instructions for a check */
export interface FixBlock {
  what: string;
  why: string;
  effort: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  example_before: string;
  example_after: string;
  verification: string;
}

/** Matches the structure of a single check in check-registry.yaml */
export interface CheckDefinition {
  id: string;
  name: string;
  check_type: string;
  paths?: string[];
  weight: "high" | "medium" | "low";
  description: string;
  recommendation: string;
  how_we_check: string;
  fix?: FixBlock;
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

/** A single HTTP request made during a check */
export interface Probe {
  url: string;
  method: string;
  status: number | null;
  contentType: string | null;
  snippet: string | null;
  error: string | null;
}

export type Confidence = "high" | "medium" | "low";

/** Result of running a single check */
export interface CheckResult {
  check_id: string;
  name: string;
  status: "pass" | "warn" | "fail";
  finding: string;
  recommendation: string;
  weight: "high" | "medium" | "low";
  details?: Record<string, unknown>;
  probes: Probe[];
  detectionMethod: string;
  confidence: Confidence;
  foundButUnrecognized: boolean;
  fix?: FixBlock;
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

export type DomainType = "api" | "website" | "unknown";

/**
 * Shared context that accumulates findings as checks run.
 * Producers write data; consumers read it.
 */
export interface ScanContext {
  /** The target URL being scanned */
  targetUrl: string;
  /** Parsed base URL (origin) */
  baseUrl: string;

  /** Detected domain type: api (JSON root), website (HTML root), or unknown */
  domainType: DomainType;

  /** HTML content of the homepage (fetched once, reused) */
  homepageHtml?: string;
  homepageHeaders?: Record<string, string>;

  /** robots.txt content if found */
  robotsTxt?: string;

  /** OpenAPI spec if discovered */
  openapiSpec?: Record<string, unknown>;
  openapiVersion?: string;
  openapiUrl?: string;

  /** MCP server endpoint URL if discovered (from /.well-known/mcp.json or root JSON) */
  mcpEndpointUrl?: string;
  /** Parsed MCP manifest if found */
  mcpManifest?: Record<string, unknown>;

  /** A2A Agent Card URL if discovered (from /.well-known/agent.json) */
  a2aCardUrl?: string;
  /** Parsed A2A Agent Card */
  a2aCard?: Record<string, unknown>;
  /** A2A task endpoint URL from the Agent Card */
  a2aTaskUrl?: string;

  /** Documentation URLs that were found accessible */
  docUrls: string[];

  /** Cross-domain links discovered from the root response */
  crossDomainLinks: Array<{ href: string; label: string; source: string }>;

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
    domainType: "unknown",
    docUrls: [],
    crossDomainLinks: [],
    apiResponses: [],
    fetchedPages: new Map(),
    fetchedHeaders: new Map(),
  };
}
