import type { Metadata } from "next";
import { fetchScanBySlug } from "@/lib/supabase";
import { getSiteUrl } from "@/lib/url";
import ResultsView from "@/components/ResultsView";

const BASE_URL = getSiteUrl();

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  const scan = await fetchScanBySlug(slug);

  if (!scan) {
    return {
      title: "Scan Not Found | Strale Beacon",
      description: "This scan doesn't exist or has expired.",
    };
  }

  const result = scan.results;
  const greenCount = result.categories.filter((c) => c.tier === "green").length;
  const total = result.categories.length;

  const title = `${result.domain} — Agent Readiness Report | Strale Beacon`;
  const ogTitle = `${result.domain} — Agent Readiness Report`;
  const description = `${greenCount}/${total} areas agent-ready. See the full report.`;
  const ogImageUrl = `${BASE_URL}/api/og/${slug}`;
  const pageUrl = `${BASE_URL}/results/${slug}`;

  return {
    title,
    description,
    openGraph: {
      title: ogTitle,
      description,
      type: "website",
      url: pageUrl,
      siteName: "Strale Beacon",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `Agent-readiness report for ${result.domain}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description,
      images: [ogImageUrl],
      site: "@strale_io",
    },
  };
}

export default function ResultsPage() {
  return <ResultsView />;
}
