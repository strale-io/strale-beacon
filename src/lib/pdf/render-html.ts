/**
 * Renders the Beacon report as a self-contained HTML string.
 * Used by both the /report/[slug] preview page and the PDF generation route.
 */

import type { ScanResult, CheckResult, Tier } from "../checks/types";
import { generateNarrative } from "./narrative";
import { categorySummary, getActionTitle } from "../checks/summaries";

const TIER_CFG: Record<Tier, { label: string; color: string; bg: string }> = {
  green: { label: "Ready", color: "#15803D", bg: "#F0FDF4" },
  yellow: { label: "Partial", color: "#B45309", bg: "#FEFCE8" },
  red: { label: "Not Ready", color: "#B91C1C", bg: "#FEF2F2" },
};

const STATUS_DOT: Record<string, { color: string }> = {
  pass: { color: "#15803D" },
  warn: { color: "#B45309" },
  fail: { color: "#B91C1C" },
};

const EFFORT_PILL: Record<string, string> = {
  low: "background:#DCFCE7;color:#15803D",
  medium: "background:#FEF3C7;color:#B45309",
  high: "background:#FEE2E2;color:#B91C1C",
};

const IMPACT_PILL: Record<string, string> = {
  high: "background:#DBEAFE;color:#1E40AF",
  medium: "background:#FEF3C7;color:#B45309",
  low: "background:#F3F4F6;color:#6B7280",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Capitalize first letter */
function cap(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function scoreColor(ready: number, total: number): string {
  if (ready >= total) return "#15803D";
  if (ready >= Math.ceil(total / 2)) return "#B45309";
  return "#B91C1C";
}

function scoreBg(ready: number, total: number): string {
  if (ready >= total) return "#F0FDF4";
  if (ready >= Math.ceil(total / 2)) return "#FEFCE8";
  return "#FEF2F2";
}

/** Score ring as a simple bordered circle with number inside — reliable in Puppeteer PDF */
function scoreRingHtml(ready: number, total: number): string {
  const color = scoreColor(ready, total);
  const bg = scoreBg(ready, total);
  return `<div style="width:120px;height:120px;border-radius:50%;border:5px solid ${color};background:${bg};display:flex;align-items:center;justify-content:center;margin:0 auto 12pt;flex-direction:column;">
    <span style="font-size:40pt;font-weight:700;color:${color};line-height:1;">${ready}</span>
    <span style="font-size:10pt;color:${color};margin-top:2pt;">of ${total} ready</span>
  </div>`;
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

  const h: string[] = [];
  const w = (s: string) => h.push(s);

  w(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">`);
  w(`<title>${esc(result.domain)} — Agent Readiness Report</title>`);
  w(`<style>${CSS(result.domain, dateStr)}</style>`);
  w(`</head><body>`);

  // ════════════════════════════════════════════════════════════════════════
  // PAGE 1: COVER
  // ════════════════════════════════════════════════════════════════════════
  w(`<div class="page cover">`);
  // Logo — matches web exactly: lowercase, 30px, font-weight 600, tracking -0.025em
  w(`<div style="display:inline-flex;align-items:baseline;gap:8px;">`);
  w(`<span style="font-size:30px;font-weight:600;letter-spacing:-0.025em;line-height:1;color:#111827;">strale</span>`);
  w(`<span style="font-size:30px;font-weight:600;letter-spacing:-0.025em;line-height:1;color:#9CA3AF;">beacon</span>`);
  w(`</div>`);

  w(`<div class="cover-body">`);
  w(`<h1 class="domain">${esc(result.domain)}</h1>`);
  w(`<p class="subtitle">Agent-Readiness Report</p>`);
  w(`<p class="meta">Scanned ${esc(dateStr)} · Check suite v${esc(result.scan_version)} · ${totalChecks} checks</p>`);

  // Score ring
  w(scoreRingHtml(greenCount, total));

  // Category overview
  w(`<table class="overview"><tbody>`);
  for (const cat of result.categories) {
    const c = TIER_CFG[cat.tier];
    w(`<tr>`);
    w(`<td style="width:18pt;padding:6pt 4pt;border-bottom:0.5pt solid #E5E7EB;vertical-align:middle;"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c.color};"></span></td>`);
    w(`<td class="ov-name">${esc(cat.label)}</td>`);
    w(`<td class="ov-tier" style="color:${c.color}">${c.label}</td>`);
    w(`<td class="ov-sum">${esc(cap(categorySummary(cat)))}</td>`);
    w(`</tr>`);
  }
  w(`</tbody></table>`);

  // Narrative
  w(`<div class="narrative">`);
  for (const p of narrative) w(`<p>${esc(p)}</p>`);
  w(`</div>`);
  w(`</div>`); // cover-body
  w(`</div>`); // cover page

  // ════════════════════════════════════════════════════════════════════════
  // CATEGORY DETAIL PAGES
  // ════════════════════════════════════════════════════════════════════════
  for (const cat of result.categories) {
    const tc = TIER_CFG[cat.tier];
    w(`<div class="cat-section">`);

    // Header row: dot + name on left, tier label on right
    w(`<div class="cat-head">`);
    w(`<div class="cat-head-left"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${tc.color};vertical-align:middle;"></span><span class="cat-name">${esc(cat.label)}</span></div>`);
    w(`<span class="cat-tier" style="color:${tc.color}">${tc.label}</span>`);
    w(`</div>`);
    w(`<p class="cat-q">${esc(cat.question)}</p>`);
    w(`<hr class="rule">`);

    for (const check of cat.checks) {
      const sd = STATUS_DOT[check.status] || STATUS_DOT.warn;
      const failing = check.status !== "pass";

      w(`<div class="chk">`);
      w(`<div class="chk-head"><span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${sd.color};vertical-align:middle;"></span><span class="chk-name">${esc(check.name)}</span>`);
      if (check.confidence && check.confidence !== "high") {
        w(`<span class="badge">${esc(check.confidence)} confidence</span>`);
      }
      if (check.foundButUnrecognized) {
        w(`<span class="badge badge-warn">format not recognized</span>`);
      }
      w(`</div>`);
      w(`<p class="chk-finding">${esc(cap(check.finding))}</p>`);

      // Probes — failing only
      if (failing && check.probes && check.probes.length > 0) {
        w(`<div class="probes" style="border-left-color:${sd.color}">`);
        for (const p of check.probes.slice(0, 6)) {
          w(`<div class="probe">${esc(p.method)} ${esc(p.url)} → ${p.status || esc(p.error || "failed")}</div>`);
        }
        if (check.probes.length > 6) w(`<div class="probe muted">…and ${check.probes.length - 6} more</div>`);
        w(`</div>`);
      }

      // Fix — failing only
      if (failing && check.fix) {
        w(`<div class="fix">`);
        w(`<p class="fix-title">${esc(check.fix.what)}</p>`);
        w(`<div class="fix-pills">`);
        w(`<span class="pill" style="${EFFORT_PILL[check.fix.effort] || ""}">${esc(check.fix.effort)} effort</span>`);
        w(`<span class="pill" style="${IMPACT_PILL[check.fix.impact] || ""}">${esc(check.fix.impact)} impact</span>`);
        w(`</div>`);
        w(`<p class="fix-why">${esc(check.fix.why)}</p>`);
        if (check.fix.verification) {
          w(`<div class="mono-block">Verify: ${esc(check.fix.verification)}</div>`);
        }
        w(`</div>`);
      }

      // Recommendation fallback — failing only, no fix
      if (failing && check.recommendation && !check.fix) {
        w(`<div class="rec">→ ${esc(check.recommendation)}</div>`);
      }

      w(`</div>`); // chk
    }
    w(`</div>`); // cat-section
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACTION PLAN
  // ════════════════════════════════════════════════════════════════════════
  w(`<div class="plan-section">`);
  w(`<h2 class="sec-title">Priority Action Plan</h2>`);
  w(`<p class="sec-sub">The highest-impact changes ranked by effort-to-impact ratio.</p>`);

  if (topActions.length === 0) {
    w(`<p class="all-clear">No critical issues found — your product is well-prepared for AI agents.</p>`);
  } else {
    w(`<div class="actions">`);
    topActions.forEach((a, i) => {
      w(`<div class="act">`);
      w(`<div class="act-row">`);
      w(`<span class="act-num">${i + 1}</span>`);
      w(`<div class="act-body">`);
      w(`<div class="act-head"><span class="act-title">${esc(getActionTitle(a.check_id, a.name))}</span><span class="act-cat">${esc(a.category)}</span></div>`);
      if (a.fix) {
        w(`<div class="act-pills">`);
        w(`<span class="pill" style="${EFFORT_PILL[a.fix.effort] || ""}">${esc(a.fix.effort)} effort</span>`);
        w(`<span class="pill" style="${IMPACT_PILL[a.fix.impact] || ""}">${esc(a.fix.impact)} impact</span>`);
        w(`</div>`);
      }
      w(`<p class="act-desc">${esc(a.fix ? a.fix.why : a.recommendation)}</p>`);
      w(`</div></div></div>`);
    });
    w(`</div>`);
  }
  w(`</div>`);

  // ════════════════════════════════════════════════════════════════════════
  // DEVELOPER CHECKLIST
  // ════════════════════════════════════════════════════════════════════════
  if (fixableChecks.length > 0) {
    w(`<div class="dev-section">`);
    w(`<h2 class="sec-title">Developer Checklist</h2>`);
    w(`<p class="sec-sub">Hand this page to a developer. Each item is a single fix with a verification command.</p>`);
    fixableChecks.forEach((c, i) => {
      w(`<div class="dev-item">`);
      w(`<div class="dev-row"><span class="dev-num">${i + 1}.</span><strong class="dev-title">${esc(c.fix!.what)}</strong></div>`);
      w(`<div class="dev-indent"><span class="dev-meta">${esc(c.category)} · ${esc(c.name)} · ${esc(c.fix!.effort)} effort · ${esc(c.fix!.impact)} impact</span>`);
      if (c.fix!.verification) w(`<div class="mono-block">$ ${esc(c.fix!.verification)}</div>`);
      w(`</div></div>`);
    });
    w(`</div>`);
  }

  // Closing
  w(`<div class="closing">Generated by Strale Beacon — scan.strale.io | Built by Strale — strale.dev</div>`);
  w(`</body></html>`);

  return h.join("\n");
}

// ──────────────────────────────────────────────────────────────────────────────
// CSS
// ──────────────────────────────────────────────────────────────────────────────
function CSS(domain: string, date: string): string {
  return `
@page {
  size: A4;
  margin: 1.5cm 1.5cm 2cm 1.5cm;
  @bottom-center {
    content: "Strale Beacon · scan.strale.io · ${domain} · ${date} · Page " counter(page) " of " counter(pages);
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 7.5pt;
    color: #9CA3AF;
  }
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 9.5pt;
  color: #111827;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── Layout ── */
.page { page-break-after: always; }
.page:last-of-type { page-break-after: auto; }

/* ── Pills ── */
.pill {
  display: inline-block;
  font-size: 8pt;
  font-weight: 500;
  padding: 1pt 6pt;
  border-radius: 3pt;
  white-space: nowrap;
}

/* ── Mono blocks ── */
.mono-block {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 8pt;
  color: #6B7280;
  background: #F9FAFB;
  padding: 5pt 8pt;
  border-radius: 3pt;
  margin-top: 3pt;
  word-break: break-all;
}

/* ── Badges ── */
.badge {
  font-size: 7pt;
  color: #9CA3AF;
  background: #F3F4F6;
  padding: 1pt 4pt;
  border-radius: 3pt;
  margin-left: 2pt;
}
.badge-warn { color: #B45309; background: #FEFCE8; }

/* ════════════════════════════════════════════════════
   COVER PAGE
   ════════════════════════════════════════════════════ */
.cover { display: flex; flex-direction: column; min-height: 100%; }

.cover-body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.domain { font-size: 28pt; font-weight: 700; letter-spacing: -0.02em; text-align: center; margin-bottom: 4pt; }
.subtitle { font-size: 14pt; font-weight: 400; color: #6B7280; margin-bottom: 6pt; }
.meta { font-size: 9pt; color: #9CA3AF; margin-bottom: 20pt; }

/* Overview table */
.overview { width: 100%; border-collapse: collapse; margin: 16pt 0 0; font-size: 9pt; }
.overview td { padding: 6pt 4pt; border-bottom: 0.5pt solid #E5E7EB; vertical-align: top; }
.ov-name { font-weight: 600; width: 22%; white-space: nowrap; padding: 6pt 4pt; border-bottom: 0.5pt solid #E5E7EB; }
.ov-tier { font-weight: 600; width: 12%; font-size: 9pt; padding: 6pt 4pt; border-bottom: 0.5pt solid #E5E7EB; }
.ov-sum { color: #6B7280; font-size: 8.5pt; line-height: 1.45; padding: 6pt 4pt; border-bottom: 0.5pt solid #E5E7EB; }

/* Narrative */
.narrative { margin-top: 20pt; font-size: 9.5pt; line-height: 1.6; color: #4B5563; text-align: justify; }
.narrative p { margin-bottom: 8pt; }
.narrative p:last-child { margin-bottom: 0; }

/* ════════════════════════════════════════════════════
   CATEGORY SECTIONS (flow naturally, no forced page breaks)
   ════════════════════════════════════════════════════ */
.cat-section { margin-top: 24pt; page-break-inside: auto; }
.cat-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 2pt;
  page-break-after: avoid;
}
.cat-head-left { display: flex; align-items: center; gap: 8pt; }
.cat-name { font-size: 14pt; font-weight: 600; }
.cat-tier { font-size: 11pt; font-weight: 600; }
.cat-q { font-size: 9.5pt; color: #6B7280; margin-bottom: 6pt; margin-left: 18pt; page-break-after: avoid; }
.rule { border: none; border-top: 0.5pt solid #E5E7EB; margin-bottom: 12pt; page-break-after: avoid; }

/* ── Check blocks ── */
.chk { margin-bottom: 12pt; page-break-inside: avoid; }
.chk-head { display: flex; align-items: center; gap: 5pt; margin-bottom: 2pt; }
.chk-name { font-size: 11pt; font-weight: 600; }
.chk-finding { font-size: 10pt; color: #374151; line-height: 1.45; margin-bottom: 3pt; }

.probes {
  background: #F9FAFB;
  border-left: 2pt solid #D1D5DB;
  border-radius: 0 3pt 3pt 0;
  padding: 5pt 8pt;
  margin: 4pt 0;
}
.probe {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 8pt;
  color: #6B7280;
  line-height: 1.8;
  word-break: break-all;
}
.probe.muted { color: #9CA3AF; }

.fix {
  margin-top: 6pt;
  padding: 6pt 10pt;
  border-left: 2pt solid #185FA5;
  background: #F8FAFC;
  border-radius: 0 3pt 3pt 0;
}
.fix-title { font-size: 10pt; font-weight: 600; margin-bottom: 3pt; }
.fix-pills { display: flex; gap: 4pt; margin-bottom: 3pt; }
.fix-why { font-size: 9pt; color: #6B7280; line-height: 1.45; }

.rec {
  font-size: 9pt;
  color: #6B7280;
  background: #F9FAFB;
  padding: 5pt 10pt;
  border-radius: 3pt;
  margin-top: 4pt;
}

/* ════════════════════════════════════════════════════
   ACTION PLAN
   ════════════════════════════════════════════════════ */
.plan-section { page-break-before: always; margin-top: 0; }
.sec-title { font-size: 16pt; font-weight: 700; margin-bottom: 4pt; }
.sec-sub { font-size: 9.5pt; color: #6B7280; margin-bottom: 16pt; }
.all-clear { font-size: 11pt; color: #15803D; margin-top: 16pt; }

.act {
  padding-bottom: 12pt;
  margin-bottom: 12pt;
  border-bottom: 0.5pt solid #F3F4F6;
  page-break-inside: avoid;
}
.act:last-child { border-bottom: none; margin-bottom: 0; }
.act-row { display: flex; gap: 10pt; align-items: flex-start; }
.act-num {
  flex-shrink: 0;
  width: 22pt; height: 22pt;
  background: #111827; color: #fff;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 10pt; font-weight: 700;
  margin-top: 1pt;
}
.act-body { flex: 1; min-width: 0; }
.act-head { display: flex; align-items: baseline; justify-content: space-between; gap: 6pt; margin-bottom: 2pt; }
.act-title { font-size: 11pt; font-weight: 600; }
.act-cat { font-size: 9pt; color: #9CA3AF; white-space: nowrap; }
.act-pills { display: flex; gap: 4pt; margin-bottom: 3pt; }
.act-desc { font-size: 9.5pt; color: #6B7280; line-height: 1.45; }

/* ════════════════════════════════════════════════════
   DEVELOPER CHECKLIST
   ════════════════════════════════════════════════════ */
.dev-section { page-break-before: always; }
.dev-item {
  margin-bottom: 12pt;
  padding-bottom: 10pt;
  border-bottom: 0.5pt solid #E5E7EB;
  page-break-inside: avoid;
}
.dev-item:last-child { border-bottom: none; }
.dev-row { display: flex; align-items: baseline; gap: 4pt; margin-bottom: 2pt; }
.dev-num { font-weight: 600; font-size: 11pt; color: #111827; flex-shrink: 0; }
.dev-title { font-size: 11pt; font-weight: 600; }
.dev-indent { padding-left: 18pt; }
.dev-meta { display: block; font-size: 9pt; color: #9CA3AF; margin-bottom: 3pt; }

/* ── Closing ── */
.closing {
  font-size: 7.5pt; color: #9CA3AF;
  text-align: center;
  margin-top: 20pt; padding-top: 10pt;
  border-top: 0.5pt solid #E5E7EB;
}

/* ── Screen preview ── */
@media screen { body { max-width: 800px; margin: 40px auto; padding: 20px; } }
`;
}
