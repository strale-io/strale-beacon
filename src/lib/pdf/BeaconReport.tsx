import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { ScanResult, CheckResult, CategoryResult, Tier } from "../checks/types";
import { generateNarrative } from "./narrative";
import PdfRadarChart from "./radar";

// ─── Styles ──────────────────────────────────────────────────────────────────

const COLORS = {
  foreground: "#111827",
  secondary: "#6B7280",
  muted: "#9CA3AF",
  border: "#E5E7EB",
  surface: "#F9FAFB",
  brand: "#3B5998",
  green: "#16A34A",
  greenBg: "#F0FDF4",
  greenText: "#15803D",
  yellow: "#CA8A04",
  yellowBg: "#FEFCE8",
  yellowText: "#A16207",
  red: "#DC2626",
  redBg: "#FEF2F2",
  redText: "#B91C1C",
  white: "#FFFFFF",
};

const TIER_DISPLAY = {
  green: { label: "Ready", color: COLORS.greenText, bg: COLORS.greenBg, icon: "✓" },
  yellow: { label: "Partial", color: COLORS.yellowText, bg: COLORS.yellowBg, icon: "◐" },
  red: { label: "Not Ready", color: COLORS.redText, bg: COLORS.redBg, icon: "✗" },
};

const STATUS_ICON: Record<string, { icon: string; color: string }> = {
  pass: { icon: "✓", color: COLORS.green },
  warn: { icon: "!", color: COLORS.yellow },
  fail: { icon: "✗", color: COLORS.red },
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: COLORS.foreground,
    paddingTop: 50,
    paddingBottom: 50,
    paddingHorizontal: 50,
  },
  footer: {
    position: "absolute",
    bottom: 25,
    left: 50,
    right: 50,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: COLORS.muted,
  },

  // Cover
  coverLogo: { flexDirection: "row", alignItems: "baseline", gap: 4 },
  coverLogoText: { fontSize: 14, fontWeight: 700, color: COLORS.foreground, letterSpacing: -0.3 },
  coverLogoBeacon: { fontSize: 9, fontWeight: 400, color: COLORS.secondary, letterSpacing: 2 },
  coverDomain: { fontSize: 36, fontWeight: 700, color: COLORS.foreground, textAlign: "center" },
  coverSubtitle: { fontSize: 14, color: COLORS.secondary, textAlign: "center", marginTop: 8 },
  coverDivider: { borderBottomWidth: 1, borderBottomColor: COLORS.border, marginVertical: 20, width: "60%", alignSelf: "center" },
  coverMeta: { fontSize: 9, color: COLORS.muted, textAlign: "center" },

  // Section headers
  sectionTitle: { fontSize: 18, fontWeight: 700, color: COLORS.foreground, marginBottom: 16 },
  sectionSubtitle: { fontSize: 10, color: COLORS.secondary, marginBottom: 12 },

  // Summary table
  tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: COLORS.border, paddingVertical: 8, alignItems: "center" },
  tableCategory: { width: "25%", fontSize: 10, fontWeight: 700 },
  tableTier: { width: "18%" },
  tableSummary: { width: "57%", fontSize: 9, color: COLORS.secondary },

  // Tier badge
  tierBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  tierText: { fontSize: 8, fontWeight: 700 },

  // Category page
  catHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
  catTitle: { fontSize: 16, fontWeight: 700 },
  catQuestion: { fontSize: 10, color: COLORS.secondary },
  checkItem: { marginBottom: 10 },
  checkHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  checkIcon: { fontSize: 10, fontWeight: 700 },
  checkName: { fontSize: 10, fontWeight: 700 },
  checkChecked: { fontSize: 8.5, color: COLORS.muted, marginBottom: 2 },
  checkFinding: { fontSize: 9, color: COLORS.foreground, marginBottom: 2 },
  recBox: { backgroundColor: COLORS.surface, padding: 8, borderRadius: 4, marginTop: 2 },
  recText: { fontSize: 8.5, color: COLORS.secondary },

  // Action plan
  actionItem: { flexDirection: "row", gap: 10, marginBottom: 14 },
  actionNumber: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.brand, justifyContent: "center", alignItems: "center" },
  actionNumberText: { color: COLORS.white, fontSize: 10, fontWeight: 700 },
  actionTitle: { fontSize: 10, fontWeight: 700, marginBottom: 2 },
  actionDesc: { fontSize: 9, color: COLORS.secondary },
  actionTag: { fontSize: 7.5, color: COLORS.muted, backgroundColor: COLORS.surface, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2 },

  // About
  aboutItem: { flexDirection: "row", gap: 8, marginBottom: 6 },
  aboutLabel: { fontSize: 9, fontWeight: 700, width: "30%" },
  aboutValue: { fontSize: 9, color: COLORS.secondary, width: "70%" },
});

// ─── Helper components ───────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: "green" | "yellow" | "red" }) {
  const cfg = TIER_DISPLAY[tier];
  return (
    <View style={[s.tierBadge, { backgroundColor: cfg.bg }]}>
      <Text style={[s.tierText, { color: cfg.color }]}>{cfg.icon}</Text>
      <Text style={[s.tierText, { color: cfg.color }]}>{cfg.label}</Text>
    </View>
  );
}

function PageFooter({ domain, date, pageNum }: { domain: string; date: string; pageNum: number }) {
  return (
    <View style={s.footer} fixed>
      <Text>Strale Beacon Agent-Readiness Report — {domain} — {date} — scan.strale.io</Text>
      <Text>{pageNum}</Text>
    </View>
  );
}

function getCategorySummaryText(cat: CategoryResult): string {
  const passCount = cat.checks.filter((c) => c.status === "pass").length;
  const total = cat.checks.length;
  if (cat.tier === "green") return `${passCount} of ${total} checks passed. Well-prepared in this area.`;
  if (cat.tier === "red") {
    const fail = cat.checks.find((c) => c.status === "fail");
    return fail?.finding?.slice(0, 120) || `Only ${passCount} of ${total} checks passed.`;
  }
  const warnOrFail = cat.checks.find((c) => c.status === "warn" || c.status === "fail");
  return warnOrFail?.finding?.slice(0, 120) || `${passCount} of ${total} checks passed.`;
}

// ─── Report document ─────────────────────────────────────────────────────────

interface BeaconReportProps {
  result: ScanResult;
  previousTiers?: Record<string, Tier>;
  previousScannedAt?: string;
}

const TIER_LABELS: Record<Tier, string> = { green: "Ready", yellow: "Partial", red: "Not Ready" };
const TIER_ORDER: Record<Tier, number> = { red: 0, yellow: 1, green: 2 };

export default function BeaconReport({ result, previousTiers, previousScannedAt }: BeaconReportProps) {
  const greenCount = result.categories.filter((c) => c.tier === "green").length;
  const dateStr = new Date(result.scanned_at).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const narrative = generateNarrative(result);

  // Top 5 failed checks by weight for action plan
  const WEIGHT_PRI: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const failedChecks: Array<CheckResult & { category: string }> = [];
  for (const cat of result.categories) {
    for (const check of cat.checks) {
      if (check.status === "fail" && check.recommendation) {
        failedChecks.push({ ...check, category: cat.label });
      }
    }
  }
  failedChecks.sort((a, b) => (WEIGHT_PRI[b.weight] || 0) - (WEIGHT_PRI[a.weight] || 0));
  const topActions = failedChecks.slice(0, 5);

  let pageNum = 0;
  const nextPage = () => ++pageNum;

  return (
    <Document title={`${result.domain} — Agent-Readiness Report`} author="Strale Beacon">
      {/* ── Page 1: Cover ── */}
      <Page size="A4" style={s.page}>
        <View style={s.coverLogo}>
          <Text style={s.coverLogoText}>strale</Text>
          <Text style={s.coverLogoBeacon}>BEACON</Text>
        </View>

        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <Text style={s.coverDomain}>{result.domain}</Text>
          <Text style={s.coverSubtitle}>Agent-Readiness Report</Text>
          <View style={s.coverDivider} />
          <Text style={s.coverMeta}>Scanned {dateStr}</Text>
          <Text style={[s.coverMeta, { marginTop: 4 }]}>
            Check suite v{result.scan_version} — {result.categories.reduce((n, c) => n + c.checks.length, 0)} checks
          </Text>
        </View>

        <Text style={{ fontSize: 8, color: COLORS.muted, textAlign: "center" }}>
          scan.strale.io
        </Text>
        <PageFooter domain={result.domain} date={dateStr} pageNum={nextPage()} />
      </Page>

      {/* ── Page 2: Executive Summary ── */}
      <Page size="A4" style={s.page}>
        <Text style={s.sectionTitle}>Executive Summary</Text>

        {/* Radar chart */}
        <View style={{ alignItems: "center", marginBottom: 12 }}>
          <PdfRadarChart
            categories={result.categories.map((c) => ({ label: c.label, tier: c.tier }))}
          />
          <Text style={{ fontSize: 14, fontWeight: 700, marginTop: 8 }}>
            {greenCount} of {result.categories.length}{" "}
            <Text style={{ fontWeight: 400, color: COLORS.secondary }}>areas agent-ready</Text>
          </Text>
        </View>

        {/* Narrative */}
        <Text style={{ fontSize: 10, lineHeight: 1.6, color: COLORS.foreground, marginBottom: 20 }}>
          {narrative}
        </Text>

        {/* Summary table */}
        <View style={{ borderTopWidth: 0.5, borderTopColor: COLORS.border }}>
          {result.categories.map((cat) => (
            <View key={cat.category_id} style={s.tableRow} wrap={false}>
              <Text style={s.tableCategory}>{cat.label}</Text>
              <View style={s.tableTier}>
                <TierBadge tier={cat.tier} />
              </View>
              <Text style={s.tableSummary}>{getCategorySummaryText(cat)}</Text>
            </View>
          ))}
        </View>

        {/* Score progression — if previous scan exists */}
        {previousTiers && previousScannedAt && (() => {
          const prevDate = new Date(previousScannedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
          const prevGreen = Object.values(previousTiers).filter((t) => t === "green").length;
          const improvements: string[] = [];
          const regressions: string[] = [];
          for (const cat of result.categories) {
            const prev = previousTiers[cat.category_id] as Tier | undefined;
            if (!prev || prev === cat.tier) continue;
            const label = `${cat.label} (${TIER_LABELS[prev]} → ${TIER_LABELS[cat.tier]})`;
            if (TIER_ORDER[cat.tier] > TIER_ORDER[prev]) improvements.push(label);
            else regressions.push(label);
          }
          return (
            <View style={{ marginTop: 14, paddingTop: 10, borderTopWidth: 0.5, borderTopColor: COLORS.border }}>
              <Text style={{ fontSize: 9, color: COLORS.muted, marginBottom: 4 }}>
                Previous scan: {prevDate} · {prevGreen}/{result.categories.length} Ready → {greenCount}/{result.categories.length} Ready
              </Text>
              {improvements.length > 0 && (
                <Text style={{ fontSize: 9, color: COLORS.greenText }}>
                  {improvements.map((i) => `↑ ${i}`).join("  ·  ")}
                </Text>
              )}
              {regressions.length > 0 && (
                <Text style={{ fontSize: 9, color: COLORS.redText }}>
                  {regressions.map((r) => `↓ ${r}`).join("  ·  ")}
                </Text>
              )}
              {improvements.length === 0 && regressions.length === 0 && (
                <Text style={{ fontSize: 9, color: COLORS.muted }}>No tier changes since last scan</Text>
              )}
            </View>
          );
        })()}

        <PageFooter domain={result.domain} date={dateStr} pageNum={nextPage()} />
      </Page>

      {/* ── Pages 3-7: One per category ── */}
      {result.categories.map((cat) => (
        <Page key={cat.category_id} size="A4" style={s.page}>
          <View style={s.catHeader}>
            <TierBadge tier={cat.tier} />
            <View>
              <Text style={s.catTitle}>{cat.label}</Text>
              <Text style={s.catQuestion}>{cat.question}</Text>
            </View>
          </View>

          {cat.checks.map((check) => {
            const icon = STATUS_ICON[check.status] || STATUS_ICON.warn;
            const probes = check.probes || [];
            return (
              <View key={check.check_id} style={s.checkItem} wrap={false}>
                <View style={s.checkHeader}>
                  <Text style={[s.checkIcon, { color: icon.color }]}>{icon.icon}</Text>
                  <Text style={s.checkName}>{check.name}</Text>
                  {check.confidence && check.confidence !== "high" && (
                    <Text style={{ fontSize: 7, color: COLORS.muted, marginLeft: 4 }}>
                      ({check.confidence} confidence)
                    </Text>
                  )}
                  {check.foundButUnrecognized && (
                    <Text style={{ fontSize: 7, color: COLORS.yellow, marginLeft: 4 }}>
                      (found but format not recognized)
                    </Text>
                  )}
                </View>
                {check.detectionMethod ? (
                  <Text style={{ fontSize: 7.5, color: COLORS.muted, marginBottom: 2 }}>
                    {check.detectionMethod}
                  </Text>
                ) : null}
                <Text style={s.checkFinding}>{check.finding}</Text>
                {probes.length > 0 ? (
                  <View style={{ marginTop: 2, marginBottom: 2 }}>
                    {probes.slice(0, 6).map((p, i) => (
                      <Text key={i} style={{ fontSize: 7, fontFamily: "Courier", color: COLORS.muted }}>
                        {p.method} {p.url} → {p.status || p.error || "failed"}
                      </Text>
                    ))}
                    {probes.length > 6 ? (
                      <Text style={{ fontSize: 7, color: COLORS.muted }}>
                        ...and {probes.length - 6} more
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {check.recommendation ? (
                  <View style={s.recBox}>
                    <Text style={s.recText}>→ {check.recommendation}</Text>
                  </View>
                ) : null}
                {check.fix && check.status !== "pass" ? (
                  <View style={{ marginTop: 4, padding: 6, backgroundColor: "#F8FAFC", borderRadius: 3, borderLeftWidth: 2, borderLeftColor: COLORS.brand }}>
                    <Text style={{ fontSize: 8, fontWeight: 700, color: COLORS.foreground, marginBottom: 2 }}>
                      Fix: {check.fix.what}
                    </Text>
                    <Text style={{ fontSize: 7, color: COLORS.muted, marginBottom: 3 }}>
                      {check.fix.effort} effort · {check.fix.impact} impact · {check.fix.why}
                    </Text>
                    {check.fix.example_after ? (
                      <View style={{ backgroundColor: "#F0FDF4", padding: 4, borderRadius: 2, marginBottom: 2 }}>
                        <Text style={{ fontSize: 6.5, fontFamily: "Courier", color: COLORS.foreground }}>
                          {check.fix.example_after.trim().substring(0, 300)}{check.fix.example_after.trim().length > 300 ? "..." : ""}
                        </Text>
                      </View>
                    ) : null}
                    {check.fix.verification ? (
                      <Text style={{ fontSize: 7, fontFamily: "Courier", color: COLORS.muted }}>
                        Verify: {check.fix.verification}
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}

          <PageFooter domain={result.domain} date={dateStr} pageNum={nextPage()} />
        </Page>
      ))}

      {/* ── Page 8: Priority Action Plan ── */}
      <Page size="A4" style={s.page}>
        <Text style={s.sectionTitle}>Priority Action Plan</Text>
        <Text style={s.sectionSubtitle}>
          The highest-impact changes ranked by effort-to-impact ratio.
        </Text>

        {topActions.length === 0 ? (
          <Text style={{ fontSize: 12, color: COLORS.green, marginTop: 20 }}>
            No critical issues found — your product is well-prepared for AI agents.
          </Text>
        ) : (
          topActions.map((action, i) => (
            <View key={action.check_id} style={s.actionItem} wrap={false}>
              <View style={s.actionNumber}>
                <Text style={s.actionNumberText}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <Text style={s.actionTitle}>{action.name}</Text>
                  <Text style={s.actionTag}>{action.category}</Text>
                </View>
                <Text style={s.actionDesc}>{action.recommendation}</Text>
              </View>
            </View>
          ))
        )}

        <PageFooter domain={result.domain} date={dateStr} pageNum={nextPage()} />
      </Page>

      {/* ── Page 9: About Strale Beacon ── */}
      <Page size="A4" style={s.page}>
        <Text style={s.sectionTitle}>About This Report</Text>

        <Text style={{ fontSize: 10, lineHeight: 1.6, color: COLORS.foreground, marginBottom: 16 }}>
          This report was generated by Strale Beacon, a free agent-readiness scanner that assesses
          how prepared a product is for discovery and interaction by AI agents. Beacon runs {result.categories.reduce((n, c) => n + c.checks.length, 0)} automated
          checks across 5 categories using only publicly available information.
        </Text>

        <Text style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Categories</Text>
        <View style={{ marginBottom: 16 }}>
          {[
            { name: "Discoverability", desc: "Can agents find you? Checks for llms.txt, AI crawler policies, structured data, sitemap, and MCP/A2A endpoints." },
            { name: "Comprehension", desc: "Can agents understand what you do? Checks for OpenAPI specs, documentation accessibility, endpoint completeness, and pricing data." },
            { name: "Usability", desc: "Can agents interact with you? Checks for auth documentation, signup friction, sandbox availability, error responses, and SDK presence." },
            { name: "Stability", desc: "Can agents depend on you? Checks for API versioning, changelogs, rate limits, ToS compatibility, and security headers." },
            { name: "Agent Experience", desc: "What happens when an agent shows up? Checks first-contact quality, documentation navigability, response consistency, and support paths." },
            { name: "Transactability", desc: "Can agents do business with you? Checks for machine-readable pricing, self-serve signup, agent-compatible checkout, usage/billing transparency, and free tier availability." },
          ].map((cat) => (
            <View key={cat.name} style={s.aboutItem}>
              <Text style={s.aboutLabel}>{cat.name}</Text>
              <Text style={s.aboutValue}>{cat.desc}</Text>
            </View>
          ))}
        </View>

        <Text style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Tier Ratings</Text>
        <View style={{ marginBottom: 20 }}>
          <View style={s.aboutItem}>
            <Text style={[s.aboutLabel, { color: COLORS.greenText }]}>✓ Ready (Green)</Text>
            <Text style={s.aboutValue}>Meets the threshold for agent interaction in this category.</Text>
          </View>
          <View style={s.aboutItem}>
            <Text style={[s.aboutLabel, { color: COLORS.yellowText }]}>◐ Partial (Yellow)</Text>
            <Text style={s.aboutValue}>Some agent-friendly signals present but gaps remain.</Text>
          </View>
          <View style={s.aboutItem}>
            <Text style={[s.aboutLabel, { color: COLORS.redText }]}>✗ Not Ready (Red)</Text>
            <Text style={s.aboutValue}>Significant barriers to agent discovery or interaction.</Text>
          </View>
        </View>

        <View style={{ borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 16 }}>
          <Text style={{ fontSize: 11, fontWeight: 700, color: COLORS.foreground, marginBottom: 4 }}>
            Beacon shows you where you stand. Strale helps you get there.
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.secondary, marginBottom: 8 }}>
            List your capabilities on Strale&apos;s marketplace and become accessible to agents today.
          </Text>
          <Text style={{ fontSize: 9, color: COLORS.brand }}>strale.dev</Text>
        </View>

        <View style={{ marginTop: "auto", paddingTop: 20 }}>
          <Text style={{ fontSize: 8, color: COLORS.muted }}>
            Built by the team behind Strale — the trust layer for the agent economy.
          </Text>
          <Text style={{ fontSize: 8, color: COLORS.muted }}>Contact: hello@strale.io</Text>
        </View>

        <PageFooter domain={result.domain} date={dateStr} pageNum={nextPage()} />
      </Page>

      {/* ── Page 10: Developer Appendix ── */}
      {(() => {
        const fixableChecks = result.categories.flatMap((cat) =>
          cat.checks
            .filter((c) => c.status !== "pass" && c.fix)
            .map((c) => ({ ...c, category: cat.label }))
        );
        if (fixableChecks.length === 0) return null;
        return (
          <Page size="A4" style={s.page}>
            <Text style={s.sectionTitle}>Developer Checklist</Text>
            <Text style={s.sectionSubtitle}>
              Hand this page to a developer. Each item is a single fix with a verification command.
            </Text>

            {fixableChecks.map((check, i) => (
              <View key={check.check_id} style={{ flexDirection: "row", gap: 6, marginBottom: 6, borderBottomWidth: 0.5, borderBottomColor: COLORS.border, paddingBottom: 5 }} wrap={false}>
                <Text style={{ fontSize: 9, color: COLORS.muted, width: 16 }}>{i + 1}.</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 8.5, fontWeight: 700, color: COLORS.foreground }}>
                    {check.fix!.what}
                  </Text>
                  <Text style={{ fontSize: 7, color: COLORS.muted }}>
                    {check.category} · {check.name} · {check.fix!.effort} effort · {check.fix!.impact} impact
                  </Text>
                  <Text style={{ fontSize: 7, fontFamily: "Courier", color: COLORS.secondary, marginTop: 1 }}>
                    $ {check.fix!.verification}
                  </Text>
                </View>
              </View>
            ))}

            <PageFooter domain={result.domain} date={dateStr} pageNum={nextPage()} />
          </Page>
        );
      })()}
    </Document>
  );
}
