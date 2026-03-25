import type { MetadataRoute } from "next";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { getSiteUrl } from "@/lib/url";

const BASE_URL = getSiteUrl();

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${BASE_URL}/about`,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  // Add all published results pages
  if (isSupabaseConfigured()) {
    const { data: scans } = await supabase
      .from("scans")
      .select("slug, scanned_at")
      .order("scanned_at", { ascending: false })
      .limit(1000);

    if (scans) {
      for (const scan of scans) {
        entries.push({
          url: `${BASE_URL}/results/${scan.slug}`,
          lastModified: new Date(scan.scanned_at),
          changeFrequency: "weekly",
          priority: 0.8,
        });
      }
    }
  }

  return entries;
}
