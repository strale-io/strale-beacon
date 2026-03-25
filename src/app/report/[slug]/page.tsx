import { notFound } from "next/navigation";
import { fetchScanBySlug } from "@/lib/supabase";
import { renderReportHtml } from "@/lib/pdf/render-html";

/**
 * Print-optimized HTML report page.
 * Primarily used as a preview — the PDF route uses renderReportHtml() directly
 * via page.setContent() to avoid Vercel self-fetch issues.
 */
export default async function PrintReport({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const scan = await fetchScanBySlug(slug);
  if (!scan) notFound();

  const html = renderReportHtml(scan.results);

  return (
    <div dangerouslySetInnerHTML={{ __html: html }} />
  );
}
