import { NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json([]);
  }

  // Get 5 most recently scanned domains, deduplicated
  const { data } = await supabase
    .from("scans")
    .select("slug, results->domain")
    .order("scanned_at", { ascending: false })
    .limit(30);

  if (!data) return NextResponse.json([]);

  // Deduplicate by domain, take first 5
  const seen = new Set<string>();
  const recent: Array<{ domain: string; slug: string }> = [];
  for (const row of data) {
    const domain = (row as Record<string, unknown>).domain as string;
    const slug = row.slug as string;
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    recent.push({ domain, slug });
    if (recent.length >= 5) break;
  }

  return NextResponse.json(recent, {
    headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
  });
}
