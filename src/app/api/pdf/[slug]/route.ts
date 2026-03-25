import { NextRequest, NextResponse } from "next/server";
import { fetchScanBySlug, isSupabaseConfigured } from "@/lib/supabase";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

const CHROMIUM_PACK =
  "https://github.com/nickmomrik/chromium-compact/releases/download/v131.0.0/chromium-v131.0.0-pack.tar";

export const maxDuration = 60; // Vercel function timeout

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

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://scan.strale.io";
  const reportUrl = `${baseUrl}/report/${slug}`;

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1200, height: 800 },
      executablePath: await chromium.executablePath(CHROMIUM_PACK),
      headless: true,
    });

    const page = await browser.newPage();
    await page.goto(reportUrl, { waitUntil: "networkidle0", timeout: 30000 });

    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "1cm", right: "1.5cm", bottom: "1.5cm", left: "1.5cm" },
    });

    const domain = scan.results.domain || slug;
    const filename = `beacon-report-${domain}.pdf`;

    return new NextResponse(Buffer.from(pdf), {
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
      {
        error: "Failed to generate PDF",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
