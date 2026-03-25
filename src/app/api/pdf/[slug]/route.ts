import { NextRequest, NextResponse } from "next/server";
import { fetchScanBySlug, isSupabaseConfigured } from "@/lib/supabase";
import { renderReportHtml } from "@/lib/pdf/render-html";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium-min";

const CHROMIUM_PACK =
  "https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar";

export const maxDuration = 60;

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

  let failedAt = "fetch-scan";
  let browser;

  try {
    const scan = await fetchScanBySlug(slug);
    if (!scan) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    failedAt = "render-html";
    const html = renderReportHtml(scan.results);

    failedAt = "launch-browser";
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1200, height: 800 },
      executablePath: await chromium.executablePath(CHROMIUM_PACK),
      headless: true,
    });

    failedAt = "set-content";
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });

    failedAt = "generate-pdf";
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
    console.error(`PDF generation error at ${failedAt}:`, err);
    return NextResponse.json(
      {
        error: "Failed to generate PDF",
        failedAt,
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
