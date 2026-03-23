import { NextRequest, NextResponse } from "next/server";
import { fetchScanBySlug, fetchPreviousScan, isSupabaseConfigured } from "@/lib/supabase";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: "Database not configured" },
      { status: 503 }
    );
  }

  const scan = await fetchScanBySlug(slug);

  if (!scan) {
    return NextResponse.json(
      { error: "Scan not found" },
      { status: 404 }
    );
  }

  // Fetch previous scan for score progression
  let previousTiers: Record<string, string> | null = null;
  let previousScannedAt: string | null = null;
  if (scan.domain_id) {
    const prevScan = await fetchPreviousScan(scan.domain_id, scan.id);
    if (prevScan) {
      previousTiers = prevScan.tier_summary;
      previousScannedAt = prevScan.scanned_at;
    }
  }

  return NextResponse.json({
    ...scan.results,
    slug: scan.slug,
    previousTiers,
    previousScannedAt,
  });
}
