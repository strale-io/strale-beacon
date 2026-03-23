# PDF Report Export

**Intent:** Add downloadable PDF report generation to Strale Beacon results pages.

## What was built

### Logo consistency
- Investigated strale.dev — the Strale logo is a text-only wordmark: the word "strale" in lowercase, rendered in Inter 600 (semibold) with tight letter-spacing. No SVG graphic, no icon — pure typography.
- Created `src/components/StraleLogo.tsx` — canonical React component with `variant` (dark/light), `size` (sm/md/lg), and `showBeacon` props. Also exports `getStraleLogoStyles()` for non-React contexts (PDF, OG images).
- Updated `src/components/Header.tsx` to use the StraleLogo component instead of inline text.
- Updated `src/app/api/og/[slug]/route.tsx` to use correct logo styling (fontWeight 600, lowercase "strale", tight tracking).

### PDF generation
- **Library:** `@react-pdf/renderer` — chosen because it uses React components (natural fit with the codebase) and renders PDFs server-side without a headless browser.
- **Files created:**
  - `src/lib/pdf/narrative.ts` — rule-based narrative summary generator. Synthesizes tier combination and key findings into 2-3 natural sentences (e.g., "stripe.com has strong operational stability... but is not discoverable by agents through standard protocols").
  - `src/lib/pdf/radar.tsx` — static radar chart for PDF using @react-pdf/renderer's SVG primitives. Same five-axis shape as the web version, adapted for print (no animation, Helvetica font, high contrast).
  - `src/lib/pdf/BeaconReport.tsx` — the full 9-page PDF document:
    1. Cover page (logo, domain, subtitle, date, check count)
    2. Executive summary (radar chart, narrative, category summary table)
    3-7. One page per category (tier badge, all checks with pass/warn/fail status, findings, recommendation boxes)
    8. Priority action plan (top 5 failed checks ranked by weight)
    9. About page (category explanations, tier rating legend, Strale CTA)
  - `src/app/api/pdf/[slug]/route.ts` — GET endpoint that fetches scan from Supabase, generates PDF, returns with proper Content-Disposition header.
  - `src/components/DownloadReport.tsx` — client component with download button, loading state, and blob download trigger.

### Results page integration
- Added DownloadReport component to `src/components/ResultsView.tsx`, positioned below the share bar.
- Button shows "Download PDF report" with a download icon, and "Generating report..." with spinner during generation.

## Design decisions

- **Helvetica font in PDF:** @react-pdf/renderer has limited font support. Helvetica is the safe default built into every PDF reader. We could register Inter as a custom font in a future pass, but Helvetica looks professional and avoids font-loading complexity.
- **No email gate:** The `BEACON_GATE_PDF` feature was scoped but not implemented — the prompt said to start with gate OFF and the simplest approach is to just not build it until needed.
- **PDF caching:** The API route sets `Cache-Control: public, s-maxage=3600` so Vercel's edge cache serves the same PDF for repeated downloads within an hour.

## Test results

- `/api/pdf/strale-dev` → 200, valid PDF, ~24KB, starts with `%PDF-` header
- `/api/pdf/nonexistent-slug` → 404
- TypeScript: clean compile, zero errors
- Production build: passes

## Known limitations

- **Font:** PDF uses Helvetica, not Inter. The logo in the PDF says "strale" in Helvetica Bold which is close but not pixel-identical to Inter Semibold. Could register Inter as a custom font if this matters.
- **Radar chart in PDF:** Uses @react-pdf/renderer SVG primitives which are more limited than browser SVG. The chart is functional and correct but slightly less polished than the web version (no gradients, simpler line rendering).
- **Page breaks:** @react-pdf/renderer handles page breaks automatically with `wrap={false}` on check items, but categories with many checks may still split across pages in edge cases.
- **No email gate:** Not implemented — just direct download for now.

## What's next

1. **Deploy** — push to trigger Vercel auto-deploy, verify PDF works in production
2. **Visual polish** — open the PDF in a viewer and fine-tune spacing, especially on category pages with many checks
3. **Custom font** — register Inter with @react-pdf/renderer for exact brand match
4. **Email gate** — implement BEACON_GATE_PDF if we decide to gate downloads
5. **PDF for OG sharing** — consider generating a one-page summary PDF optimized for email forwarding
