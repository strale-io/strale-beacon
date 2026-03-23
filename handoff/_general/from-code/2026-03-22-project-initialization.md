# Project Initialization

**Intent:** Initialize Strale Beacon as a Next.js project, strip the starter kit template to what Beacon actually needs, and set up full project context for future sessions.

## What was done

### Template cleanup
- Moved `claude-project-template-v1.0` contents to project root
- Removed 25+ unnecessary folders/files: `_quality`, `_critique`, `_surfaces`, `_expectations`, `_presets`, `_modes`, `_interaction`, `_primitives`, `_examples`, `_content`, `_model`, `_artifacts`, `_decisions`, `_extensions`, `_flows`, `_guides`, `_ia`, `_invariants`, `_jobs`, `_nfr`, `_research`, `_resilience`, `_runs`, `_strategy`, `EVOLUTION.md`, `CONSTRAINTS_INDEX.yaml`, `DESIGN_ROUTER.yaml`, `.claude/DISPATCH.yaml`, `.claude/BUILD.md`, `.claude/NOTION.md`, `.claude/RUNBOOK.md`, `.claude/WORKFLOW.md`, `docs/`, `tasks/`
- Removed `_design-systems/professional` and `_design-systems/publishing` (replaced with `beacon`)

### Next.js initialization
- Created Next.js app with TypeScript, Tailwind CSS, ESLint, App Router, src directory
- Installed `@supabase/supabase-js`
- Project uses Next.js 16 with Turbopack

### Project context files created
- `CLAUDE.md` — Full project context including tech stack, structure, categories, design system, integration points, and session protocol
- `check-registry.yaml` — All 22 checks across 5 categories with types, weights, descriptions, recommendations, and MVP flags. v2 checks (description specificity, registry presence) marked `mvp: false`
- `_ui/tokens.yaml` — Beacon design tokens adapted from Strale's dark-mode system: brand color darkened for light-mode contrast, tier colors (green/yellow/red), Inter + JetBrains Mono fonts, 4px spacing scale, 0.5rem border radius
- `_ui/components.yaml` — Lightweight component registry (8 components: RadarChart, CategoryBadge, ScanFeed, ActionPlan, ShareBar, ScanInput, CategoryDetail, Footer)
- `_rules/laws.yaml` — 6 laws (3 supreme, 3 locked) covering: no hardcoded values, tier colors from tokens, data accuracy, accessible contrast, no aggregate score, Strale brand consistency
- `_design-systems/beacon/system.yaml` — Beacon design system definition documenting relationship to Strale's system
- `config/manifest.yaml` — Project manifest with identity, audience, product voice, tech stack
- `.claude/PROTOCOL.md` — Simplified session protocol (declare intent → read handoff → work → write handoff)

### Design decisions
- **Brand color:** Strale's primary is `hsl(225, 42%, 52%)`. Beacon uses `hsl(225, 50%, 45%)` — slightly more saturated and darker for light-mode contrast.
- **Tier colors:** Green (#16A34A), Yellow (#CA8A04), Red (#DC2626) with corresponding light backgrounds for badges/cards.
- **Font:** Inter (same as Strale frontend) confirmed from `strale-frontend/tailwind.config.ts`.
- **Radius:** 0.5rem (same as Strale's `--radius` CSS variable).
- **No aggregate score** is encoded as a locked rule (RULE-002) to prevent accidental implementation.

## What's next
1. **Build the scanning engine** — Implement `src/app/api/scan/route.ts` with the generic check runner that reads `check-registry.yaml`
2. **Implement individual check types** — `file_exists_and_parse`, `header_parse`, `html_analyze`, `api_probe`
3. **Build the landing page** — URL input + scan button at `src/app/page.tsx`
4. **Build the results page** — Radar chart + findings at `src/app/results/[slug]/page.tsx`
5. **Set up Supabase** — Schema for domains, scans, and subscribers tables
6. **Implement SSE** — Server-Sent Events for live scanning feed

## Open questions
- Supabase project: needs to be created and connection string configured
- Strale API base URL for dogfooding checks (ssl-check, header-security-check, dns-lookup, tech-stack-detect)
- Vercel project setup for scan.strale.io deployment
