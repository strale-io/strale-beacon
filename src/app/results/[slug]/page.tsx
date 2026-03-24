import type { Metadata } from "next";
import { fetchScanBySlug } from "@/lib/supabase";
import { getSiteUrl } from "@/lib/url";
import ResultsView from "@/components/ResultsView";

const TIER_LABELS = { green: "Ready", yellow: "Partial", red: "Not Ready" };
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

  const tierDescriptions = result.categories
    .map((c) => `${c.label}: ${TIER_LABELS[c.tier]}`)
    .join(". ");

  const title = `${result.domain} — Agent Readiness Report | Strale Beacon`;
  const description = `${result.domain} scores ${greenCount}/${total} on agent readiness. See what AI agents can and can't do with this product.`;
  const ogImageUrl = `${BASE_URL}/api/og/${slug}`;
  const pageUrl = `${BASE_URL}/results/${slug}`;

  return {
    title,
    description,
    openGraph: {
      title,
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
      title,
      description,
      images: [ogImageUrl],
      site: "@strale_io",
    },
  };
}

export default function ResultsPage() {
  return <ResultsView />;
}
