import { NextRequest, NextResponse } from "next/server";
import { fetchScanBySlug, isSupabaseConfigured } from "@/lib/supabase";

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

  return NextResponse.json({ ...scan.results, slug: scan.slug });
}
