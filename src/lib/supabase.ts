import { createClient } from "@supabase/supabase-js";
import type { ScanResult, Tier } from "./checks/types";

// --- Database types ---

export interface DbDomain {
  id: string;
  domain: string;
  display_name: string | null;
  first_scanned_at: string;
  last_scanned_at: string;
  scan_count: number;
}

export interface DbScan {
  id: string;
  domain_id: string;
  slug: string;
  scanned_at: string;
  scan_version: string;
  scan_duration_ms: number | null;
  results: ScanResult;
  tier_summary: Record<string, Tier>;
  green_count: number;
  yellow_count: number;
  red_count: number;
  created_at: string;
}

export interface DbSubscriber {
  id: string;
  email: string;
  domain_id: string | null;
  subscribed_at: string;
  previous_green_count: number | null;
  last_notified_at: string | null;
  unsubscribed_at: string | null;
}

// --- Client ---

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase environment variables not set. Database features will be unavailable."
  );
}

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder"
);

/**
 * Check if Supabase is configured (env vars are set).
 */
export function isSupabaseConfigured(): boolean {
  return !!supabaseUrl && !!supabaseAnonKey;
}

// --- Domain helpers ---

/**
 * Normalize a domain string: strip protocol, www, trailing slash.
 */
export function normalizeDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  }
}

/**
 * Generate a URL slug from a domain.
 * "stripe.com" → "stripe-com", "api.example.io" → "api-example-io"
 */
export function domainToSlug(domain: string): string {
  return domain.toLowerCase().replace(/\./g, "-");
}

// --- Database operations ---

/**
 * Upsert a domain record. Returns the domain row.
 */
export async function upsertDomain(domain: string): Promise<DbDomain | null> {
  if (!isSupabaseConfigured()) return null;

  // Try to find existing
  const { data: existing } = await supabase
    .from("domains")
    .select("*")
    .eq("domain", domain)
    .single();

  if (existing) {
    const { data: updated } = await supabase
      .from("domains")
      .update({
        last_scanned_at: new Date().toISOString(),
        scan_count: (existing as DbDomain).scan_count + 1,
      })
      .eq("id", (existing as DbDomain).id)
      .select()
      .single();
    return (updated as DbDomain) || (existing as DbDomain);
  }

  // Insert new
  const { data: inserted } = await supabase
    .from("domains")
    .insert({ domain })
    .select()
    .single();
  return inserted as DbDomain | null;
}

/**
 * Find a cached scan for a domain within the last 15 minutes.
 */
export async function findRecentScan(
  domain: string
): Promise<DbScan | null> {
  if (!isSupabaseConfigured()) return null;

  const cacheWindow = new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("scans")
    .select("*, domains!inner(domain)")
    .eq("domains.domain", domain)
    .gte("scanned_at", cacheWindow)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .single();

  return (data as DbScan) || null;
}

/**
 * Store a scan result. Returns the slug.
 */
export async function storeScan(
  domainId: string,
  domain: string,
  result: ScanResult
): Promise<string> {
  const slug = domainToSlug(domain);

  const tierSummary: Record<string, Tier> = {};
  let greenCount = 0;
  let yellowCount = 0;
  let redCount = 0;

  for (const cat of result.categories) {
    tierSummary[cat.category_id] = cat.tier;
    if (cat.tier === "green") greenCount++;
    else if (cat.tier === "yellow") yellowCount++;
    else redCount++;
  }

  // Check if slug already exists
  const { data: existingScan } = await supabase
    .from("scans")
    .select("id")
    .eq("slug", slug)
    .single();

  if (existingScan) {
    // Update existing scan with new results
    await supabase
      .from("scans")
      .update({
        scanned_at: result.scanned_at,
        scan_version: result.scan_version,
        scan_duration_ms: result.scan_duration_ms,
        results: result as unknown as Record<string, unknown>,
        tier_summary: tierSummary,
        green_count: greenCount,
        yellow_count: yellowCount,
        red_count: redCount,
      })
      .eq("id", (existingScan as { id: string }).id);
  } else {
    // Insert new scan
    await supabase
      .from("scans")
      .insert({
        domain_id: domainId,
        slug,
        scanned_at: result.scanned_at,
        scan_version: result.scan_version,
        scan_duration_ms: result.scan_duration_ms,
        results: result as unknown as Record<string, unknown>,
        tier_summary: tierSummary,
        green_count: greenCount,
        yellow_count: yellowCount,
        red_count: redCount,
      });
  }

  return slug;
}

/**
 * Fetch a scan by slug.
 */
export async function fetchScanBySlug(slug: string): Promise<DbScan | null> {
  if (!isSupabaseConfigured()) return null;

  const { data } = await supabase
    .from("scans")
    .select("*")
    .eq("slug", slug)
    .single();

  return (data as DbScan) || null;
}

/**
 * Fetch the previous scan for a domain (the scan before the current one).
 * Returns null if no previous scan exists.
 */
export async function fetchPreviousScan(
  domainId: string,
  currentScanId: string
): Promise<DbScan | null> {
  if (!isSupabaseConfigured()) return null;

  const { data } = await supabase
    .from("scans")
    .select("*")
    .eq("domain_id", domainId)
    .neq("id", currentScanId)
    .order("scanned_at", { ascending: false })
    .limit(1)
    .single();

  return (data as DbScan) || null;
}

/**
 * Subscribe an email for scan change notifications.
 * @deprecated Use the subscribe API route directly — it handles domain lookup and green_count.
 */
export async function subscribeEmail(
  email: string,
  domainId?: string
): Promise<{ success: boolean; alreadySubscribed?: boolean }> {
  if (!isSupabaseConfigured()) {
    return { success: false };
  }

  const { error } = await supabase.from("subscribers").insert({
    email,
    domain_id: domainId || null,
  });

  if (error) {
    if (error.code === "23505") {
      return { success: true, alreadySubscribed: true };
    }
    console.error("Subscribe error:", error);
    return { success: false };
  }

  return { success: true };
}
