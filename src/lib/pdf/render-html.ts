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

function scoreRingSvg(ready: number, total: number): string {
  const size = 130;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = total > 0 ? ready / total : 0;
  const filled = circumference * fraction;
  const gap = circumference - filled;
  const color = scoreColor(ready, total);
  const bg = scoreBg(ready, total);

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="display:block;margin:0 auto 8pt;">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${bg}" stroke="#E5E7EB" stroke-width="${stroke}" />
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-dasharray="${filled} ${gap}" stroke-dashoffset="${circumference * 0.25}"
      stroke-linecap="round" />
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="44" font-weight="700" fill="${color}" font-family="system-ui,sans-serif">${ready}</text>
    <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="13" fill="${color}" font-family="system-ui,sans-serif">of ${total} ready</text>
  </svg>`;
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
  w(`<div class="brand"><span class="brand-s">STRALE</span> <span class="brand-b">BEACON</span></div>`);

  w(`<div class="cover-body">`);
  w(`<h1 class="domain">${esc(result.domain)}</h1>`);
  w(`<p class="subtitle">Agent-Readiness Report</p>`);
  w(`<p class="meta">Scanned ${esc(dateStr)} · Check suite v${esc(result.scan_version)} · ${totalChecks} checks</p>`);

  // Score ring SVG
  w(scoreRingSvg(greenCount, total));

  // Category overview
  w(`<table class="overview"><tbody>`);
  for (const cat of result.categories) {
    const c = TIER_CFG[cat.tier];
    w(`<tr>`);
    w(`<td class="ov-dot"><span class="dot" style="background:${c.color}"></span></td>`);
    w(`<td class="ov-name">${esc(cat.label)}</td>`);
    w(`<td class="ov-tier" style="color:${c.color}">${c.label}</td>`);
    w(`<td class="ov-sum">${esc(categorySummary(cat))}</td>`);
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
    w(`<div class="page cat-page">`);

    // Header row: dot + name on left, tier label on right
    w(`<div class="cat-head">`);
    w(`<div class="cat-head-left"><span class="dot dot-lg" style="background:${tc.color}"></span><span class="cat-name">${esc(cat.label)}</span></div>`);
    w(`<span class="cat-tier" style="color:${tc.color}">${tc.label}</span>`);
    w(`</div>`);
    w(`<p class="cat-q">${esc(cat.question)}</p>`);
    w(`<hr class="rule">`);

    for (const check of cat.checks) {
      const sd = STATUS_DOT[check.status] || STATUS_DOT.warn;
      const failing = check.status !== "pass";
      const dotSize = failing ? "dot-sm" : "dot-sm";

      w(`<div class="chk">`);
      w(`<div class="chk-head"><span class="dot ${dotSize}" style="background:${sd.color}"></span><span class="chk-name">${esc(check.name)}</span>`);
      if (check.confidence && check.confidence !== "high") {
        w(`<span class="badge">${esc(check.confidence)} confidence</span>`);
      }
      if (check.foundButUnrecognized) {
        w(`<span class="badge badge-warn">format not recognized</span>`);
      }
      w(`</div>`);
      w(`<p class="chk-finding">${esc(check.finding)}</p>`);

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
    w(`</div>`); // cat-page
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACTION PLAN
  // ════════════════════════════════════════════════════════════════════════
  w(`<div class="page plan-page">`);
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
      w(`</div></div></div>`); // act-body, act-row, act
    });
    w(`</div>`);
  }
  w(`</div>`);

  // ════════════════════════════════════════════════════════════════════════
  // DEVELOPER CHECKLIST
  // ════════════════════════════════════════════════════════════════════════
  if (fixableChecks.length > 0) {
    w(`<div class="page dev-page">`);
    w(`<h2 class="sec-title">Developer Checklist</h2>`);
    w(`<p class="sec-sub">Hand this page to a developer. Each item is a single fix with a verification command.</p>`);
    w(`<ol class="devlist">`);
    fixableChecks.forEach((c) => {
      w(`<li class="dev-item">`);
      w(`<strong>${esc(c.fix!.what)}</strong>`);
      w(`<span class="dev-meta">${esc(c.category)} · ${esc(c.name)} · ${esc(c.fix!.effort)} effort · ${esc(c.fix!.impact)} impact</span>`);
      if (c.fix!.verification) w(`<div class="mono-block">$ ${esc(c.fix!.verification)}</div>`);
      w(`</li>`);
    });
    w(`</ol></div>`);
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
    font-size: 8pt;
    color: #9CA3AF;
  }
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  font-size: 11pt;
  color: #111827;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* ── Layout ── */
.page { page-break-after: always; }
.page:last-of-type { page-break-after: auto; }

/* ── Dots ── */
.dot { display: inline-block; border-radius: 50%; vertical-align: middle; }
.dot-lg { width: 10px; height: 10px; }
.dot-sm { width: 7px; height: 7px; }

/* ── Pills ── */
.pill {
  display: inline-block;
  font-size: 9pt;
  font-weight: 500;
  padding: 1pt 7pt;
  border-radius: 3pt;
  white-space: nowrap;
}

/* ── Mono blocks ── */
.mono-block {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 9pt;
  color: #6B7280;
  background: #F9FAFB;
  padding: 6pt 10pt;
  border-radius: 4pt;
  margin-top: 4pt;
  word-break: break-all;
}

/* ── Badges ── */
.badge {
  font-size: 8pt;
  color: #9CA3AF;
  background: #F3F4F6;
  padding: 1pt 5pt;
  border-radius: 3pt;
  margin-left: 2pt;
}
.badge-warn { color: #B45309; background: #FEFCE8; }

/* ════════════════════════════════════════════════════
   COVER PAGE
   ════════════════════════════════════════════════════ */
.cover { display: flex; flex-direction: column; min-height: 100%; }
.brand { letter-spacing: 2.5px; font-size: 10pt; color: #9CA3AF; margin-bottom: 16pt; }
.brand-s { font-weight: 600; color: #111827; }
.brand-b { font-weight: 400; }

.cover-body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.domain { font-size: 28pt; font-weight: 700; letter-spacing: -0.02em; text-align: center; margin-bottom: 4pt; }
.subtitle { font-size: 14pt; font-weight: 400; color: #6B7280; margin-bottom: 6pt; }
.meta { font-size: 9pt; color: #9CA3AF; margin-bottom: 20pt; }

/* Overview table */
.overview { width: 100%; border-collapse: collapse; margin: 20pt 0 0; font-size: 10pt; }
.overview td { padding: 7pt 5pt; border-bottom: 0.5pt solid #E5E7EB; vertical-align: top; }
.ov-dot { width: 18pt; }
.ov-name { font-weight: 600; width: 22%; white-space: nowrap; }
.ov-tier { font-weight: 600; width: 12%; font-size: 10pt; }
.ov-sum { color: #6B7280; font-size: 9.5pt; line-height: 1.45; }

/* Narrative */
.narrative { margin-top: 24pt; font-size: 11pt; line-height: 1.65; color: #4B5563; text-align: justify; }
.narrative p { margin-bottom: 10pt; }
.narrative p:last-child { margin-bottom: 0; }

/* ════════════════════════════════════════════════════
   CATEGORY PAGES
   ════════════════════════════════════════════════════ */
.cat-page { page-break-before: always; }
.cat-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 2pt;
}
.cat-head-left { display: flex; align-items: center; gap: 8pt; }
.cat-name { font-size: 16pt; font-weight: 600; }
.cat-tier { font-size: 12pt; font-weight: 600; }
.cat-q { font-size: 11pt; color: #6B7280; margin-bottom: 8pt; margin-left: 18pt; }
.rule { border: none; border-top: 0.5pt solid #E5E7EB; margin-bottom: 16pt; }

/* ── Check blocks ── */
.chk { margin-bottom: 16pt; page-break-inside: avoid; }
.chk-head { display: flex; align-items: center; gap: 6pt; margin-bottom: 3pt; }
.chk-name { font-size: 12pt; font-weight: 600; }
.chk-finding { font-size: 11pt; color: #374151; line-height: 1.5; margin-bottom: 4pt; }

.probes {
  background: #F9FAFB;
  border-left: 2pt solid #D1D5DB;
  border-radius: 0 4pt 4pt 0;
  padding: 6pt 10pt;
  margin: 6pt 0;
}
.probe {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 8pt;
  color: #6B7280;
  line-height: 1.9;
  word-break: break-all;
}
.probe.muted { color: #9CA3AF; }

.fix {
  margin-top: 8pt;
  padding: 8pt 12pt;
  border-left: 2pt solid #185FA5;
  background: #F8FAFC;
  border-radius: 0 4pt 4pt 0;
}
.fix-title { font-size: 11pt; font-weight: 600; margin-bottom: 4pt; }
.fix-pills { display: flex; gap: 5pt; margin-bottom: 4pt; }
.fix-why { font-size: 10pt; color: #6B7280; line-height: 1.5; }

.rec {
  font-size: 10pt;
  color: #6B7280;
  background: #F9FAFB;
  padding: 6pt 12pt;
  border-radius: 4pt;
  margin-top: 6pt;
}

/* ════════════════════════════════════════════════════
   ACTION PLAN
   ════════════════════════════════════════════════════ */
.plan-page { page-break-before: always; }
.sec-title { font-size: 18pt; font-weight: 700; margin-bottom: 6pt; }
.sec-sub { font-size: 11pt; color: #6B7280; margin-bottom: 20pt; }
.all-clear { font-size: 13pt; color: #15803D; margin-top: 20pt; }

.actions { }
.act {
  padding-bottom: 16pt;
  margin-bottom: 16pt;
  border-bottom: 0.5pt solid #F3F4F6;
  page-break-inside: avoid;
}
.act:last-child { border-bottom: none; margin-bottom: 0; }
.act-row { display: flex; gap: 12pt; align-items: flex-start; }
.act-num {
  flex-shrink: 0;
  width: 24pt; height: 24pt;
  background: #111827; color: #fff;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11pt; font-weight: 700;
  margin-top: 1pt;
}
.act-body { flex: 1; min-width: 0; }
.act-head { display: flex; align-items: baseline; justify-content: space-between; gap: 8pt; margin-bottom: 3pt; }
.act-title { font-size: 12pt; font-weight: 600; }
.act-cat { font-size: 10pt; color: #9CA3AF; white-space: nowrap; }
.act-pills { display: flex; gap: 5pt; margin-bottom: 4pt; }
.act-desc { font-size: 11pt; color: #6B7280; line-height: 1.5; }

/* ════════════════════════════════════════════════════
   DEVELOPER CHECKLIST
   ════════════════════════════════════════════════════ */
.dev-page { page-break-before: always; }
.devlist { list-style: none; padding: 0; counter-reset: dev; }
.dev-item {
  margin-bottom: 16pt;
  padding-bottom: 12pt;
  border-bottom: 0.5pt solid #E5E7EB;
  page-break-inside: avoid;
  counter-increment: dev;
  padding-left: 28pt;
  position: relative;
}
.dev-item::before {
  content: counter(dev) ".";
  position: absolute;
  left: 0;
  font-weight: 600;
  font-size: 12pt;
  color: #111827;
}
.dev-item:last-child { border-bottom: none; }
.dev-item strong { display: block; font-size: 12pt; font-weight: 600; margin-bottom: 3pt; }
.dev-meta { display: block; font-size: 10pt; color: #9CA3AF; margin-bottom: 4pt; }

/* ── Closing ── */
.closing {
  font-size: 8pt; color: #9CA3AF;
  text-align: center;
  margin-top: 24pt; padding-top: 12pt;
  border-top: 0.5pt solid #E5E7EB;
}

/* ── Screen preview ── */
@media screen { body { max-width: 800px; margin: 40px auto; padding: 20px; } }
`;
}
