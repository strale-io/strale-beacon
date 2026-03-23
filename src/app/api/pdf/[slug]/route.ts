import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { fetchScanBySlug, fetchPreviousScan, isSupabaseConfigured } from "@/lib/supabase";
import BeaconReport from "@/lib/pdf/BeaconReport";
import { createElement } from "react";
import type { Tier } from "@/lib/checks/types";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  const scan = await fetchScanBySlug(slug);

  if (!scan) {
    return NextResponse.json({ error: "Scan not found" }, { status: 404 });
  }

  // Fetch previous scan for score progression
  let previousTiers: Record<string, Tier> | undefined;
  let previousScannedAt: string | undefined;
  if (scan.domain_id) {
    const prevScan = await fetchPreviousScan(scan.domain_id, scan.id);
    if (prevScan) {
      previousTiers = prevScan.tier_summary as Record<string, Tier>;
      previousScannedAt = prevScan.scanned_at;
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = createElement(BeaconReport, {
      result: scan.results,
      previousTiers,
      previousScannedAt,
    }) as any;
    const buffer = await renderToBuffer(element);

    const domain = scan.results.domain || slug;
    const filename = `beacon-report-${domain}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "public, s-maxage=3600",
      },
    });
  } catch (err) {
    console.error("PDF generation error:", err);
    return NextResponse.json(
      { error: "Failed to generate PDF", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
