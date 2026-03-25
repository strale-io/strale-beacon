import { NextRequest, NextResponse } from "next/server";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  // Total scans and unique domains
  const { count: totalScans } = await supabase
    .from("scans")
    .select("*", { count: "exact", head: true });

  const { count: uniqueDomains } = await supabase
    .from("domains")
    .select("*", { count: "exact", head: true });

  // Average ready count
  const { data: avgData } = await supabase
    .from("scans")
    .select("green_count");
  const avgReadyCount = avgData && avgData.length > 0
    ? Math.round((avgData.reduce((s, r) => s + (r.green_count || 0), 0) / avgData.length) * 10) / 10
    : 0;

  // Top failing checks — aggregate from failed_checks arrays
  const { data: failedData } = await supabase
    .from("scans")
    .select("failed_checks")
    .not("failed_checks", "is", null);

  const failCounts: Record<string, number> = {};
  let scansWithChecks = 0;
  if (failedData) {
    for (const row of failedData) {
      const checks = row.failed_checks as string[] | null;
      if (!checks) continue;
      scansWithChecks++;
      for (const id of checks) {
        failCounts[id] = (failCounts[id] || 0) + 1;
      }
    }
  }
  const topFailingChecks = Object.entries(failCounts)
    .map(([check, count]) => ({ check, fail_rate: Math.round((count / Math.max(scansWithChecks, 1)) * 100) / 100 }))
    .sort((a, b) => b.fail_rate - a.fail_rate)
    .slice(0, 10);

  // Top capability gaps
  const { data: gapData } = await supabase
    .from("scans")
    .select("capability_gaps")
    .not("capability_gaps", "is", null);

  const gapCounts: Record<string, number> = {};
  if (gapData) {
    for (const row of gapData) {
      const gaps = row.capability_gaps as string[] | null;
      if (!gaps) continue;
      for (const gap of gaps) {
        gapCounts[gap] = (gapCounts[gap] || 0) + 1;
      }
    }
  }
  const topCapabilityGaps = Object.entries(gapCounts)
    .map(([gap, count]) => ({ gap, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Category distribution
  const { data: catData } = await supabase
    .from("scans")
    .select("product_category");

  const categoryDistribution: Record<string, number> = {};
  if (catData) {
    for (const row of catData) {
      const cat = (row.product_category as string) || "null";
      categoryDistribution[cat] = (categoryDistribution[cat] || 0) + 1;
    }
  }

  // Strale integration count
  const { count: straleCount } = await supabase
    .from("scans")
    .select("*", { count: "exact", head: true })
    .eq("has_strale_integration", true);

  // Average checks fixed per rescan
  const { data: fixData } = await supabase
    .from("scans")
    .select("checks_fixed")
    .not("checks_fixed", "is", null);

  let totalFixed = 0;
  let rescansWithFixes = 0;
  if (fixData) {
    for (const row of fixData) {
      const fixed = row.checks_fixed as string[] | null;
      if (fixed && fixed.length > 0) {
        totalFixed += fixed.length;
        rescansWithFixes++;
      }
    }
  }
  const avgChecksFixedPerRescan = rescansWithFixes > 0
    ? Math.round((totalFixed / rescansWithFixes) * 10) / 10
    : 0;

  return NextResponse.json({
    total_scans: totalScans || 0,
    unique_domains: uniqueDomains || 0,
    avg_ready_count: avgReadyCount,
    top_failing_checks: topFailingChecks,
    top_capability_gaps: topCapabilityGaps,
    category_distribution: categoryDistribution,
    strale_integration_count: straleCount || 0,
    avg_checks_fixed_per_rescan: avgChecksFixedPerRescan,
  });
}
