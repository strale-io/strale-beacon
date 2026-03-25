/**
 * Renders the Beacon report as a self-contained HTML string.
 * Used by both the /report/[slug] preview page and the PDF generation route.
 */

import type { ScanResult, CheckResult, Tier } from "../checks/types";
import { generateNarrative } from "./narrative";
import { categorySummary, getActionTitle } from "../checks/summaries";

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

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function renderReportHtml(result: ScanResult): string {
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
      const impactScore = check.fix ? ({ high: 30, medium: 20, low: 10 }[check.fix.impact] || 0) : 0;
      const effortPenalty = check.fix ? ({ low: 0, medium: 10, high: 25 }[check.fix.effort] || 0) : 0;
      const score = check.fix
        ? impactScore - effortPenalty
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

  // Build HTML
  const lines: string[] = [];
  const w = (s: string) => lines.push(s);

  w(`<!DOCTYPE html>`);
  w(`<html lang="en"><head><meta charset="UTF-8">`);
  w(`<title>${esc(result.domain)} — Agent Readiness Report</title>`);
  w(`<style>${printStyles(result.domain, dateStr)}</style>`);
  w(`</head><body>`);

  // ── PAGE 1: COVER + EXECUTIVE SUMMARY ──
  w(`<div class="page cover-page">`);
  w(`<div class="cover-header"><span class="logo-strale">STRALE</span> <span class="logo-beacon">BEACON</span></div>`);
  w(`<div class="cover-center">`);
  w(`<h1 class="cover-domain">${esc(result.domain)}</h1>`);
  w(`<p class="cover-subtitle">Agent-Readiness Report</p>`);
  w(`<div class="cover-divider"></div>`);
  w(`<p class="cover-meta">Scanned ${esc(dateStr)}</p>`);
  w(`<p class="cover-meta">Check suite v${esc(result.scan_version)} · ${totalChecks} checks</p>`);
  w(`<div class="score-display"><span class="score-number">${greenCount}</span><span class="score-sep">/</span><span class="score-total">${total}</span><span class="score-label">areas agent-ready</span></div>`);
  w(`</div>`);

  // Category overview table
  w(`<table class="overview-table"><tbody>`);
  for (const cat of result.categories) {
    const cfg = TIER_CFG[cat.tier];
    w(`<tr>`);
    w(`<td class="overview-dot"><span class="dot" style="background-color:${cfg.color}"></span></td>`);
    w(`<td class="overview-name">${esc(cat.label)}</td>`);
    w(`<td class="overview-tier" style="color:${cfg.color}">${cfg.label}</td>`);
    w(`<td class="overview-summary">${esc(categorySummary(cat))}</td>`);
    w(`</tr>`);
  }
  w(`</tbody></table>`);

  // Narrative
  w(`<div class="narrative">`);
  for (const para of narrative) {
    w(`<p>${esc(para)}</p>`);
  }
  w(`</div></div>`);

  // ── CATEGORY DETAIL PAGES ──
  for (const cat of result.categories) {
    const tcfg = TIER_CFG[cat.tier];
    w(`<div class="page category-page">`);
    w(`<div class="cat-header">`);
    w(`<span class="tier-badge" style="background-color:${tcfg.bg};color:${tcfg.color}"><span class="tier-icon">${tcfg.icon}</span>${tcfg.label}</span>`);
    w(`<div><h2 class="cat-title">${esc(cat.label)}</h2><p class="cat-question">${esc(cat.question)}</p></div>`);
    w(`</div>`);

    for (const check of cat.checks) {
      const scfg = STATUS_CFG[check.status] || STATUS_CFG.warn;
      const isFailing = check.status !== "pass";

      w(`<div class="check-block">`);
      w(`<div class="check-header">`);
      w(`<span class="check-icon" style="color:${scfg.color}">${scfg.icon}</span>`);
      w(`<span class="check-name">${esc(check.name)}</span>`);
      if (check.confidence && check.confidence !== "high") {
        w(`<span class="check-badge">${esc(check.confidence)} confidence</span>`);
      }
      if (check.foundButUnrecognized) {
        w(`<span class="check-badge warn">format not recognized</span>`);
      }
      w(`</div>`);
      w(`<p class="check-finding">${esc(check.finding)}</p>`);

      if (isFailing && check.probes && check.probes.length > 0) {
        w(`<div class="probes">`);
        for (const p of check.probes.slice(0, 6)) {
          w(`<div class="probe-line">${esc(p.method)} ${esc(p.url)} → ${p.status || esc(p.error || "failed")}</div>`);
        }
        if (check.probes.length > 6) {
          w(`<div class="probe-line muted">...and ${check.probes.length - 6} more</div>`);
        }
        w(`</div>`);
      }

      if (isFailing && check.fix) {
        w(`<div class="fix-block">`);
        w(`<p class="fix-title">${esc(check.fix.what)}</p>`);
        w(`<p class="fix-meta">${esc(check.fix.effort)} effort · ${esc(check.fix.impact)} impact · ${esc(check.fix.why)}</p>`);
        if (check.fix.verification) {
          w(`<div class="verify-cmd">Verify: ${esc(check.fix.verification)}</div>`);
        }
        w(`</div>`);
      }

      if (isFailing && check.recommendation && !check.fix) {
        w(`<div class="rec-block">→ ${esc(check.recommendation)}</div>`);
      }

      w(`</div>`);
    }
    w(`</div>`);
  }

  // ── ACTION PLAN ──
  w(`<div class="page action-page">`);
  w(`<h2 class="section-title">Priority Action Plan</h2>`);
  w(`<p class="section-subtitle">The highest-impact changes ranked by effort-to-impact ratio.</p>`);

  if (topActions.length === 0) {
    w(`<p class="all-clear">No critical issues found — your product is well-prepared for AI agents.</p>`);
  } else {
    w(`<ol class="action-list">`);
    for (const action of topActions) {
      w(`<li class="action-item"><div class="action-header">`);
      w(`<strong>${esc(getActionTitle(action.check_id, action.name))}</strong>`);
      w(`<span class="action-tag">${esc(action.category)}</span>`);
      if (action.fix) {
        w(`<span class="pill effort">${esc(action.fix.effort)} effort</span>`);
        w(`<span class="pill impact">${esc(action.fix.impact)} impact</span>`);
      }
      w(`</div>`);
      w(`<p class="action-desc">${esc(action.fix ? action.fix.why : action.recommendation)}</p>`);
      w(`</li>`);
    }
    w(`</ol>`);
  }
  w(`</div>`);

  // ── DEVELOPER CHECKLIST ──
  if (fixableChecks.length > 0) {
    w(`<div class="page checklist-page">`);
    w(`<h2 class="section-title">Developer Checklist</h2>`);
    w(`<p class="section-subtitle">Hand this page to a developer. Each item is a single fix with a verification command.</p>`);
    w(`<ol class="checklist">`);
    for (const check of fixableChecks) {
      w(`<li class="checklist-item">`);
      w(`<strong>${esc(check.fix!.what)}</strong>`);
      w(`<span class="checklist-meta">${esc(check.category)} · ${esc(check.name)} · ${esc(check.fix!.effort)} effort · ${esc(check.fix!.impact)} impact</span>`);
      if (check.fix!.verification) {
        w(`<div class="verify-cmd">$ ${esc(check.fix!.verification)}</div>`);
      }
      w(`</li>`);
    }
    w(`</ol></div>`);
  }

  // ── CLOSING ──
  w(`<div class="closing">Generated by Strale Beacon — scan.strale.io | Built by Strale — strale.dev</div>`);
  w(`</body></html>`);

  return lines.join("\n");
}

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

    .cover-page { display: flex; flex-direction: column; min-height: 100%; }
    .cover-header { letter-spacing: 2px; font-size: 10pt; color: #6B7280; margin-bottom: 20pt; }
    .logo-strale { font-weight: 600; color: #111827; }
    .logo-beacon { font-weight: 400; }
    .cover-center { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6pt; }
    .cover-domain { font-size: 30pt; font-weight: 700; letter-spacing: -0.02em; text-align: center; }
    .cover-subtitle { font-size: 13pt; color: #6B7280; }
    .cover-divider { width: 60%; border-bottom: 1px solid #E5E7EB; margin: 14pt 0; }
    .cover-meta { font-size: 9pt; color: #9CA3AF; }
    .score-display { margin-top: 16pt; display: flex; align-items: baseline; gap: 3pt; }
    .score-number { font-size: 36pt; font-weight: 700; }
    .score-sep { font-size: 24pt; color: #9CA3AF; }
    .score-total { font-size: 24pt; color: #9CA3AF; }
    .score-label { font-size: 13pt; color: #6B7280; margin-left: 8pt; }

    .overview-table { width: 100%; border-collapse: collapse; margin-top: 24pt; font-size: 9pt; }
    .overview-table td { padding: 6pt 4pt; border-bottom: 0.5pt solid #E5E7EB; vertical-align: top; }
    .overview-dot { width: 16pt; }
    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
    .overview-name { font-weight: 600; width: 20%; }
    .overview-tier { font-weight: 600; width: 12%; font-size: 8.5pt; }
    .overview-summary { color: #6B7280; }

    .narrative { margin-top: 20pt; font-size: 10pt; line-height: 1.65; color: #4B5563; text-align: justify; }
    .narrative p { margin-bottom: 8pt; }
    .narrative p:last-child { margin-bottom: 0; }

    .cat-header { display: flex; align-items: center; gap: 10pt; margin-bottom: 16pt; }
    .tier-badge { display: inline-flex; align-items: center; gap: 4pt; padding: 3pt 8pt; border-radius: 10pt; font-size: 8pt; font-weight: 700; white-space: nowrap; }
    .tier-icon { font-size: 9pt; }
    .cat-title { font-size: 15pt; font-weight: 700; }
    .cat-question { font-size: 10pt; color: #6B7280; margin-top: 2pt; }

    .check-block { margin-bottom: 12pt; page-break-inside: avoid; }
    .check-header { display: flex; align-items: center; gap: 6pt; margin-bottom: 2pt; }
    .check-icon { font-weight: 700; font-size: 10pt; }
    .check-name { font-weight: 600; font-size: 10pt; }
    .check-badge { font-size: 7pt; color: #9CA3AF; background: #F3F4F6; padding: 1pt 4pt; border-radius: 2pt; }
    .check-badge.warn { color: #B45309; background: #FEFCE8; }
    .check-finding { font-size: 9pt; color: #111827; line-height: 1.5; margin-bottom: 4pt; }

    .probes { background: #F3F4F6; border-radius: 4pt; padding: 6pt 10pt; margin: 4pt 0; }
    .probe-line { font-family: 'Courier New', monospace; font-size: 7pt; color: #6B7280; line-height: 1.8; }
    .probe-line.muted { color: #9CA3AF; }

    .fix-block { margin: 4pt 0; padding: 6pt 10pt; border-left: 2pt solid #185FA5; background: #F8FAFC; }
    .fix-title { font-size: 8.5pt; font-weight: 600; margin-bottom: 2pt; }
    .fix-meta { font-size: 7.5pt; color: #9CA3AF; margin-bottom: 3pt; }
    .verify-cmd { font-family: 'Courier New', monospace; font-size: 7pt; color: #6B7280; background: #F3F4F6; padding: 4pt 8pt; border-radius: 3pt; margin-top: 3pt; }
    .rec-block { font-size: 8.5pt; color: #6B7280; background: #F9FAFB; padding: 6pt 10pt; border-radius: 4pt; margin: 4pt 0; }

    .action-page, .checklist-page { page-break-before: always; }
    .section-title { font-size: 17pt; font-weight: 700; margin-bottom: 8pt; }
    .section-subtitle { font-size: 10pt; color: #6B7280; margin-bottom: 16pt; }
    .all-clear { font-size: 12pt; color: #15803D; margin-top: 16pt; }
    .action-list { list-style: decimal; padding-left: 20pt; }
    .action-item { margin-bottom: 12pt; page-break-inside: avoid; }
    .action-header { display: flex; align-items: baseline; gap: 6pt; flex-wrap: wrap; margin-bottom: 2pt; font-size: 10pt; }
    .action-tag { font-size: 7.5pt; color: #9CA3AF; background: #F3F4F6; padding: 1pt 5pt; border-radius: 2pt; }
    .pill { font-size: 7pt; padding: 1pt 5pt; border-radius: 2pt; font-weight: 500; }
    .pill.effort { background: #DCFCE7; color: #15803D; }
    .pill.impact { background: #DBEAFE; color: #1E40AF; }
    .action-desc { font-size: 9pt; color: #6B7280; line-height: 1.5; }

    .checklist { list-style: decimal; padding-left: 20pt; }
    .checklist-item { margin-bottom: 8pt; padding-bottom: 6pt; border-bottom: 0.5pt solid #E5E7EB; page-break-inside: avoid; font-size: 9pt; }
    .checklist-item strong { display: block; font-size: 9pt; margin-bottom: 2pt; }
    .checklist-meta { display: block; font-size: 7pt; color: #9CA3AF; margin-bottom: 2pt; }

    .closing { font-size: 8pt; color: #9CA3AF; text-align: center; margin-top: 24pt; padding-top: 12pt; border-top: 0.5pt solid #E5E7EB; }

    @media screen { body { max-width: 800px; margin: 40px auto; padding: 20px; } }
  `;
}
