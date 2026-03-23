import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { fetchScanBySlug, isSupabaseConfigured } from "@/lib/supabase";
import BeaconReport from "@/lib/pdf/BeaconReport";
import { createElement } from "react";

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

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const element = createElement(BeaconReport, { result: scan.results }) as any;
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
