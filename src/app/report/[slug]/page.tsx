import { notFound } from "next/navigation";
import { fetchScanBySlug } from "@/lib/supabase";
import { generateNarrative } from "@/lib/pdf/narrative";
import { categorySummary, getActionTitle } from "@/lib/checks/summaries";
import type { ScanResult, CategoryResult, CheckResult, Tier } from "@/lib/checks/types";

const TIER_CFG: Record<Tier, { label: string; color: string; bg: string; icon: string }> = {
  green: { label: "Ready", color: "#15803D", bg: "#F0FDF4", icon: "✓" },
  yellow: { label: "Partial", color: "#B45309", bg: "#FEFCE8", icon: "◐" },
  red: { label: "Not Ready", color: "#B91C1C", bg: "#FEF2F2", icon: "✗" },
};

const STATUS_CFG: Record<string, { icon: string; color: string }> = {
  pass: { icon: "✓", color: "#15803D" },
  warn: { icon: "!", color: "#B45309" },
  fail: { icon: "✗", color: "#B91C1C" },
};

export default async function PrintReport({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const scan = await fetchScanBySlug(slug);
  if (!scan) notFound();

  const result = scan.results;
  const greenCount = result.categories.filter((c) => c.tier === "green").length;
  const total = result.categories.length;
  const totalChecks = result.categories.reduce((n, c) => n + c.checks.length, 0);
  const dateStr = new Date(result.scanned_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const narrative = generateNarrative(result);

  // Action plan
  const failedChecks: Array<CheckResult & { category: string; score: number }> = [];
  for (const cat of result.categories) {
    for (const check of cat.checks) {
      if (check.status === "pass") continue;
      if (!check.recommendation && !check.fix) continue;
      const score = check.fix
        ? ({ high: 30, medium: 20, low: 10 }[check.fix.impact] - { low: 0, medium: 10, high: 25 }[check.fix.effort])
        : ({ high: 3, medium: 2, low: 1 }[check.weight] || 0);
      failedChecks.push({ ...check, category: cat.label, score });
    }
  }
  failedChecks.sort((a, b) => b.score - a.score);
  const topActions = failedChecks.slice(0, 5);

  // Developer checklist
  const fixableChecks = result.categories.flatMap((cat) =>
    cat.checks
      .filter((c) => c.status !== "pass" && c.fix)
      .map((c) => ({ ...c, category: cat.label }))
  );

  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>{result.domain} — Agent Readiness Report</title>
        <style dangerouslySetInnerHTML={{ __html: printStyles(result.domain, dateStr) }} />
      </head>
      <body>
        {/* ── PAGE 1: COVER + EXECUTIVE SUMMARY ── */}
        <div className="page cover-page">
          <div className="cover-header">
            <span className="logo-strale">STRALE</span>{" "}
            <span className="logo-beacon">BEACON</span>
          </div>

          <div className="cover-center">
            <h1 className="cover-domain">{result.domain}</h1>
            <p className="cover-subtitle">Agent-Readiness Report</p>
            <div className="cover-divider" />
            <p className="cover-meta">Scanned {dateStr}</p>
            <p className="cover-meta">
              Check suite v{result.scan_version} · {totalChecks} checks
            </p>

            {/* Score display */}
            <div className="score-display">
              <span className="score-number">{greenCount}</span>
              <span className="score-sep">/</span>
              <span className="score-total">{total}</span>
              <span className="score-label">areas agent-ready</span>
            </div>
          </div>

          {/* Category overview table */}
          <table className="overview-table">
            <tbody>
              {result.categories.map((cat) => {
                const cfg = TIER_CFG[cat.tier];
                return (
                  <tr key={cat.category_id}>
                    <td className="overview-dot">
                      <span className="dot" style={{ backgroundColor: cfg.color }} />
                    </td>
                    <td className="overview-name">{cat.label}</td>
                    <td className="overview-tier" style={{ color: cfg.color }}>
                      {cfg.label}
                    </td>
                    <td className="overview-summary">{categorySummary(cat)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Narrative */}
          <div className="narrative">
            {narrative.map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
        </div>

        {/* ── PAGES 2+: CATEGORY DETAILS ── */}
        {result.categories.map((cat) => (
          <div key={cat.category_id} className="page category-page">
            <div className="cat-header">
              <span
                className="tier-badge"
                style={{ backgroundColor: TIER_CFG[cat.tier].bg, color: TIER_CFG[cat.tier].color }}
              >
                <span className="tier-icon">{TIER_CFG[cat.tier].icon}</span>
                {TIER_CFG[cat.tier].label}
              </span>
              <div>
                <h2 className="cat-title">{cat.label}</h2>
                <p className="cat-question">{cat.question}</p>
              </div>
            </div>

            {cat.checks.map((check) => {
              const scfg = STATUS_CFG[check.status] || STATUS_CFG.warn;
              const isFailing = check.status !== "pass";
              return (
                <div key={check.check_id} className="check-block">
                  <div className="check-header">
                    <span className="check-icon" style={{ color: scfg.color }}>
                      {scfg.icon}
                    </span>
                    <span className="check-name">{check.name}</span>
                    {check.confidence && check.confidence !== "high" && (
                      <span className="check-badge">{check.confidence} confidence</span>
                    )}
                    {check.foundButUnrecognized && (
                      <span className="check-badge warn">format not recognized</span>
                    )}
                  </div>
                  <p className="check-finding">{check.finding}</p>

                  {/* Probes — failing checks only */}
                  {isFailing && check.probes && check.probes.length > 0 && (
                    <div className="probes">
                      {check.probes.slice(0, 6).map((p, i) => (
                        <div key={i} className="probe-line">
                          {p.method} {p.url} → {p.status || p.error || "failed"}
                        </div>
                      ))}
                      {check.probes.length > 6 && (
                        <div className="probe-line muted">
                          ...and {check.probes.length - 6} more
                        </div>
                      )}
                    </div>
                  )}

                  {/* Fix — failing checks only */}
                  {isFailing && check.fix && (
                    <div className="fix-block">
                      <p className="fix-title">{check.fix.what}</p>
                      <p className="fix-meta">
                        {check.fix.effort} effort · {check.fix.impact} impact · {check.fix.why}
                      </p>
                      {check.fix.verification && (
                        <div className="verify-cmd">Verify: {check.fix.verification}</div>
                      )}
                    </div>
                  )}

                  {/* Recommendation — failing checks only */}
                  {isFailing && check.recommendation && !check.fix && (
                    <div className="rec-block">→ {check.recommendation}</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {/* ── ACTION PLAN ── */}
        <div className="page action-page">
          <h2 className="section-title">Priority Action Plan</h2>
          <p className="section-subtitle">
            The highest-impact changes ranked by effort-to-impact ratio.
          </p>

          {topActions.length === 0 ? (
            <p className="all-clear">
              No critical issues found — your product is well-prepared for AI agents.
            </p>
          ) : (
            <ol className="action-list">
              {topActions.map((action) => (
                <li key={action.check_id} className="action-item">
                  <div className="action-header">
                    <strong>{getActionTitle(action.check_id, action.name)}</strong>
                    <span className="action-tag">{action.category}</span>
                    {action.fix && (
                      <>
                        <span className="pill effort">{action.fix.effort} effort</span>
                        <span className="pill impact">{action.fix.impact} impact</span>
                      </>
                    )}
                  </div>
                  <p className="action-desc">
                    {action.fix ? action.fix.why : action.recommendation}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>

        {/* ── DEVELOPER CHECKLIST ── */}
        {fixableChecks.length > 0 && (
          <div className="page checklist-page">
            <h2 className="section-title">Developer Checklist</h2>
            <p className="section-subtitle">
              Hand this page to a developer. Each item is a single fix with a verification command.
            </p>

            <ol className="checklist">
              {fixableChecks.map((check) => (
                <li key={check.check_id} className="checklist-item">
                  <strong>{check.fix!.what}</strong>
                  <span className="checklist-meta">
                    {check.category} · {check.name} · {check.fix!.effort} effort · {check.fix!.impact} impact
                  </span>
                  {check.fix!.verification && (
                    <div className="verify-cmd">$ {check.fix!.verification}</div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* ── LAST LINE ── */}
        <div className="closing">
          Generated by Strale Beacon — scan.strale.io | Built by Strale — strale.dev
        </div>
      </body>
    </html>
  );
}

// ─── Print styles ─────────────────────────────────────────────────────────────

function printStyles(domain: string, date: string): string {
  return `
    @page {
      size: A4;
      margin: 1.5cm 1.5cm 2cm 1.5cm;

      @bottom-center {
        content: "Strale Beacon · scan.strale.io · ${domain} · ${date} · Page " counter(page) " of " counter(pages);
        font-family: 'Inter', system-ui, sans-serif;
        font-size: 7.5pt;
        color: #9CA3AF;
      }
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      font-size: 10pt;
      color: #111827;
      background: #fff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .page { page-break-after: always; }
    .page:last-of-type { page-break-after: auto; }

    /* ── Cover ── */
    .cover-page {
      display: flex;
      flex-direction: column;
      min-height: 100%;
    }
    .cover-header {
      letter-spacing: 2px;
      font-size: 10pt;
      color: #6B7280;
      margin-bottom: 20pt;
    }
    .logo-strale { font-weight: 600; color: #111827; }
    .logo-beacon { font-weight: 400; }

    .cover-center {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6pt;
    }
    .cover-domain {
      font-size: 30pt;
      font-weight: 700;
      letter-spacing: -0.02em;
      text-align: center;
    }
    .cover-subtitle {
      font-size: 13pt;
      color: #6B7280;
    }
    .cover-divider {
      width: 60%;
      border-bottom: 1px solid #E5E7EB;
      margin: 14pt 0;
    }
    .cover-meta {
      font-size: 9pt;
      color: #9CA3AF;
    }

    .score-display {
      margin-top: 16pt;
      display: flex;
      align-items: baseline;
      gap: 3pt;
    }
    .score-number { font-size: 36pt; font-weight: 700; }
    .score-sep { font-size: 24pt; color: #9CA3AF; }
    .score-total { font-size: 24pt; color: #9CA3AF; }
    .score-label { font-size: 13pt; color: #6B7280; margin-left: 8pt; }

    /* Overview table */
    .overview-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 24pt;
      font-size: 9pt;
    }
    .overview-table td {
      padding: 6pt 4pt;
      border-bottom: 0.5pt solid #E5E7EB;
      vertical-align: top;
    }
    .overview-dot { width: 16pt; }
    .dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }
    .overview-name { font-weight: 600; width: 20%; }
    .overview-tier { font-weight: 600; width: 12%; font-size: 8.5pt; }
    .overview-summary { color: #6B7280; }

    /* Narrative */
    .narrative {
      margin-top: 20pt;
      font-size: 10pt;
      line-height: 1.65;
      color: #4B5563;
      text-align: justify;
    }
    .narrative p { margin-bottom: 8pt; }
    .narrative p:last-child { margin-bottom: 0; }

    /* ── Category pages ── */
    .cat-header {
      display: flex;
      align-items: center;
      gap: 10pt;
      margin-bottom: 16pt;
    }
    .tier-badge {
      display: inline-flex;
      align-items: center;
      gap: 4pt;
      padding: 3pt 8pt;
      border-radius: 10pt;
      font-size: 8pt;
      font-weight: 700;
      white-space: nowrap;
    }
    .tier-icon { font-size: 9pt; }
    .cat-title { font-size: 15pt; font-weight: 700; }
    .cat-question { font-size: 10pt; color: #6B7280; margin-top: 2pt; }

    .check-block {
      margin-bottom: 12pt;
      page-break-inside: avoid;
    }
    .check-header {
      display: flex;
      align-items: center;
      gap: 6pt;
      margin-bottom: 2pt;
    }
    .check-icon { font-weight: 700; font-size: 10pt; }
    .check-name { font-weight: 600; font-size: 10pt; }
    .check-badge {
      font-size: 7pt;
      color: #9CA3AF;
      background: #F3F4F6;
      padding: 1pt 4pt;
      border-radius: 2pt;
    }
    .check-badge.warn { color: #B45309; background: #FEFCE8; }

    .check-finding {
      font-size: 9pt;
      color: #111827;
      line-height: 1.5;
      margin-bottom: 4pt;
    }

    .probes {
      background: #F3F4F6;
      border-radius: 4pt;
      padding: 6pt 10pt;
      margin: 4pt 0;
    }
    .probe-line {
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      font-size: 7pt;
      color: #6B7280;
      line-height: 1.8;
    }
    .probe-line.muted { color: #9CA3AF; }

    .fix-block {
      margin: 4pt 0;
      padding: 6pt 10pt;
      border-left: 2pt solid #185FA5;
      background: #F8FAFC;
    }
    .fix-title { font-size: 8.5pt; font-weight: 600; margin-bottom: 2pt; }
    .fix-meta { font-size: 7.5pt; color: #9CA3AF; margin-bottom: 3pt; }

    .verify-cmd {
      font-family: 'JetBrains Mono', 'Courier New', monospace;
      font-size: 7pt;
      color: #6B7280;
      background: #F3F4F6;
      padding: 4pt 8pt;
      border-radius: 3pt;
      margin-top: 3pt;
    }

    .rec-block {
      font-size: 8.5pt;
      color: #6B7280;
      background: #F9FAFB;
      padding: 6pt 10pt;
      border-radius: 4pt;
      margin: 4pt 0;
    }

    /* ── Action plan ── */
    .action-page, .checklist-page { page-break-before: always; }

    .section-title {
      font-size: 17pt;
      font-weight: 700;
      margin-bottom: 8pt;
    }
    .section-subtitle {
      font-size: 10pt;
      color: #6B7280;
      margin-bottom: 16pt;
    }
    .all-clear {
      font-size: 12pt;
      color: #15803D;
      margin-top: 16pt;
    }

    .action-list {
      list-style: decimal;
      padding-left: 20pt;
    }
    .action-item {
      margin-bottom: 12pt;
      page-break-inside: avoid;
    }
    .action-header {
      display: flex;
      align-items: baseline;
      gap: 6pt;
      flex-wrap: wrap;
      margin-bottom: 2pt;
      font-size: 10pt;
    }
    .action-tag {
      font-size: 7.5pt;
      color: #9CA3AF;
      background: #F3F4F6;
      padding: 1pt 5pt;
      border-radius: 2pt;
    }
    .pill {
      font-size: 7pt;
      padding: 1pt 5pt;
      border-radius: 2pt;
      font-weight: 500;
    }
    .pill.effort { background: #DCFCE7; color: #15803D; }
    .pill.impact { background: #DBEAFE; color: #1E40AF; }
    .action-desc {
      font-size: 9pt;
      color: #6B7280;
      line-height: 1.5;
    }

    /* ── Developer checklist ── */
    .checklist {
      list-style: decimal;
      padding-left: 20pt;
    }
    .checklist-item {
      margin-bottom: 8pt;
      padding-bottom: 6pt;
      border-bottom: 0.5pt solid #E5E7EB;
      page-break-inside: avoid;
      font-size: 9pt;
    }
    .checklist-item strong { display: block; font-size: 9pt; margin-bottom: 2pt; }
    .checklist-meta {
      display: block;
      font-size: 7pt;
      color: #9CA3AF;
      margin-bottom: 2pt;
    }

    /* ── Closing ── */
    .closing {
      font-size: 8pt;
      color: #9CA3AF;
      text-align: center;
      margin-top: 24pt;
      padding-top: 12pt;
      border-top: 0.5pt solid #E5E7EB;
    }

    /* Hide in normal browsing — this page is for Puppeteer only */
    @media screen {
      body { max-width: 800px; margin: 40px auto; padding: 20px; }
    }
  `;
}
