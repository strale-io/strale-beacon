import { NextRequest, NextResponse } from "next/server";
import { fetchScanBySlug, fetchPreviousScan, isSupabaseConfigured } from "@/lib/supabase";
import { generateNarrative } from "@/lib/pdf/narrative";
import { getCheckRegistry } from "@/lib/checks/registry";
import type { Tier, ScanResult, CheckResult, FixBlock } from "@/lib/checks/types";

const TIER_LABELS: Record<Tier, string> = { green: "Ready", yellow: "Partial", red: "Not Ready" };
const TIER_ORDER: Record<Tier, number> = { red: 0, yellow: 1, green: 2 };

/** Priority score: higher is better (do first). high impact + low effort = best. */
function priorityScore(fix: FixBlock): number {
  const impactScore = { high: 30, medium: 20, low: 10 }[fix.impact];
  const effortPenalty = { low: 0, medium: 10, high: 25 }[fix.effort];
  return impactScore - effortPenalty;
}

function buildActionPlan(result: ScanResult, checkDefs: Map<string, { fix?: FixBlock }>) {
  const items: Array<{ fix: FixBlock; checkId: string; name: string; category: string; score: number }> = [];

  for (const cat of result.categories) {
    for (const check of cat.checks) {
      if (check.status === "pass") continue;
      const fix = check.fix || checkDefs.get(check.check_id)?.fix;
      if (!fix) continue;
      items.push({ fix, checkId: check.check_id, name: check.name, category: cat.label, score: priorityScore(fix) });
    }
  }

  items.sort((a, b) => b.score - a.score);

  return items.slice(0, 5).map((item, i) => ({
    priority: i + 1,
    check_id: item.checkId,
    category: item.category,
    action: item.fix.what,
    effort: item.fix.effort,
    impact: item.fix.impact,
    verification: item.fix.verification,
  }));
}

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

  const result = scan.results;
  const registry = getCheckRegistry();

  // Build a map of check definitions for fix block lookup
  const checkDefs = new Map<string, { fix?: FixBlock }>();
  for (const cat of registry.categories) {
    for (const check of cat.checks) {
      checkDefs.set(check.id, { fix: check.fix });
    }
  }

  // Fetch previous scan for progression
  let progression: {
    has_previous: boolean;
    previous_scan_date: string | null;
    improvements: string[];
    regressions: string[];
  } | null = null;

  if (scan.domain_id) {
    const prevScan = await fetchPreviousScan(scan.domain_id, scan.id);
    if (prevScan) {
      const improvements: string[] = [];
      const regressions: string[] = [];
      const prevTiers = prevScan.tier_summary as Record<string, Tier>;

      for (const cat of result.categories) {
        const prev = prevTiers[cat.category_id] as Tier | undefined;
        if (!prev || prev === cat.tier) continue;
        const label = `${cat.label}: ${TIER_LABELS[prev]} → ${TIER_LABELS[cat.tier]}`;
        if (TIER_ORDER[cat.tier] > TIER_ORDER[prev]) improvements.push(label);
        else regressions.push(label);
      }

      progression = {
        has_previous: true,
        previous_scan_date: prevScan.scanned_at,
        improvements,
        regressions,
      };
    }
  }

  if (!progression) {
    progression = { has_previous: false, previous_scan_date: null, improvements: [], regressions: [] };
  }

  // Counts
  let checksRun = 0, checksPassed = 0, checksWarned = 0, checksFailed = 0;
  for (const cat of result.categories) {
    for (const check of cat.checks) {
      checksRun++;
      if (check.status === "pass") checksPassed++;
      else if (check.status === "warn") checksWarned++;
      else checksFailed++;
    }
  }

  const narrative = generateNarrative(result);

  // Build the full report
  const report = {
    meta: {
      tool: "Strale Beacon",
      version: result.scan_version,
      report_format: "1.0",
      generated_at: new Date().toISOString(),
    },

    llm_instructions: `This is a Strale Beacon agent-readiness report for ${result.domain}. It evaluates how discoverable, comprehensible, and usable this product is for AI agents.\n\nTo fix all issues:\n1. Iterate through the 'checks' array where status is 'fail' or 'warn'\n2. For each failing check, read the 'fix' object\n3. Implement fix.what, using fix.example_before and fix.example_after as templates\n4. Verify each fix using fix.verification\n5. Prioritize by the 'action_plan' array (highest impact, lowest effort first)\n\nThe 'evidence' object shows exactly what Beacon checked — the URLs it probed, the HTTP status codes received, and snippets of the response content. Use this to understand the current state before making changes.\n\nThe 'detection_method' field explains how Beacon detects each signal. Build your fix to match what Beacon will look for on the next scan.\n\nAfter implementing fixes, rescan at: POST https://scan.strale.io/api/scan with {"url": "${result.url}", "force": true}`,

    scan: {
      url: result.url,
      domain: result.domain,
      scanned_at: result.scanned_at,
      scan_duration_ms: result.scan_duration_ms,
      checks_run: checksRun,
      checks_passed: checksPassed,
      checks_warned: checksWarned,
      checks_failed: checksFailed,
    },

    summary: {
      ready_count: result.categories.filter((c) => c.tier === "green").length,
      partial_count: result.categories.filter((c) => c.tier === "yellow").length,
      not_ready_count: result.categories.filter((c) => c.tier === "red").length,
      categories: Object.fromEntries(
        result.categories.map((c) => [
          c.category_id,
          { tier: c.tier, label: TIER_LABELS[c.tier], question: c.question },
        ])
      ),
      narrative,
    },

    progression,

    checks: result.categories.flatMap((cat) =>
      cat.checks.map((check) => {
        // Use fix from check result, or fall back to registry
        const fixBlock = check.fix || (check.status !== "pass" ? checkDefs.get(check.check_id)?.fix : undefined);

        return {
          id: check.check_id,
          category: cat.category_id,
          name: check.name,
          status: check.status,
          confidence: check.confidence,
          found_but_unrecognized: check.foundButUnrecognized,
          human_summary: check.finding,
          detection_method: check.detectionMethod,
          evidence: {
            probes: check.probes.map((p) => ({
              url: p.url,
              method: p.method,
              status: p.status,
              content_type: p.contentType,
              snippet: p.snippet,
              error: p.error,
            })),
          },
          fix: check.status !== "pass" && fixBlock
            ? {
                what: fixBlock.what,
                why: fixBlock.why,
                effort: fixBlock.effort,
                impact: fixBlock.impact,
                example_before: fixBlock.example_before,
                example_after: fixBlock.example_after,
                verification: fixBlock.verification,
              }
            : null,
        };
      })
    ),

    action_plan: buildActionPlan(result, checkDefs),
  };

  return NextResponse.json(report, {
    headers: {
      "Cache-Control": "public, s-maxage=3600",
    },
  });
}
