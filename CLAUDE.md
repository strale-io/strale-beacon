# Strale Beacon

## What is this?
Strale Beacon (scan.strale.io) is a free agent-readiness scanner. It scans any URL and assesses how ready that product is for AI agent discovery and interaction. It produces a five-category assessment with a radar chart visual. It's a Strale-branded sub-product that serves as the growth engine for Strale's marketplace.

## Key relationships
- Beacon is the diagnostic. Strale's SQS is the destination.
- Beacon has NO aggregate score — only per-category tiers (Green/Yellow/Red) — to avoid competing with SQS.
- Beacon is free. No paywall. No gated content. Revenue comes from driving traffic to Strale.

## Tech stack
- Framework: Next.js (App Router)
- Styling: Tailwind CSS with Strale design tokens (light-mode adapted)
- Database: Supabase (scan results, domain cache, email subscribers)
- Deployment: Vercel (scan.strale.io subdomain)
- Scanning engine: Serverless API routes running HTTP-based checks

## Project structure
```
strale-beacon/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── page.tsx            # Landing page (URL input + scan button)
│   │   ├── results/
│   │   │   └── [slug]/
│   │   │       └── page.tsx    # Results page (radar chart + findings)
│   │   └── api/
│   │       └── scan/
│   │           └── route.ts    # Scanning engine API route
│   ├── lib/
│   │   ├── checks/             # Individual check implementations
│   │   │   ├── registry.ts     # Check configuration (JSON check definitions)
│   │   │   ├── runner.ts       # Generic check execution engine
│   │   │   ├── discoverability.ts
│   │   │   ├── comprehension.ts
│   │   │   ├── usability.ts
│   │   │   ├── stability.ts
│   │   │   └── agent-experience.ts
│   │   ├── scoring.ts          # Tier calculation (red/yellow/green)
│   │   ├── supabase.ts         # Supabase client
│   │   └── strale-api.ts       # Client for calling Strale's own API
│   └── components/
│       ├── RadarChart.tsx       # Five-axis radar chart (the signature visual)
│       ├── CategoryBadge.tsx    # Green/Yellow/Red tier indicator
│       ├── ScanFeed.tsx         # Live scanning progress feed
│       ├── ActionPlan.tsx       # Prioritized recommendations
│       └── ShareBar.tsx         # Share results button/card
├── _ui/                        # Design tokens (from system folder)
├── _rules/                     # Simplified laws
├── _design-systems/            # Beacon light-mode design system
├── handoff/                    # Session handoff files
├── CLAUDE.md                   # This file
├── check-registry.yaml         # Check definitions (configuration, not code)
└── strale-beacon-spec.docx     # Full product specification
```

## Five scan categories
1. **Discoverability** — Can agents find you?
2. **Comprehension** — Can agents understand what you do?
3. **Usability** — Can agents interact with you?
4. **Stability** — Can agents depend on you?
5. **Agent Experience** — What happens when an agent shows up?

Each category: Green (Ready), Yellow (Partial), Red (Not Ready). No aggregate score.

## Design system
- Light mode (Strale main site is dark mode)
- Font: Inter (same as Strale), JetBrains Mono for code
- Same spacing scale as Strale (4px base)
- Brand color: Strale primary (hsl 225 42% 52%) adapted for light-mode contrast
- Tier colors: Green (#16A34A), Yellow (#CA8A04), Red (#DC2626)
- Radar chart is the signature visual — design it with care
- Minimal decoration, data-forward layout
- Border radius: 0.5rem (same as Strale)

## Strale integration
- Beacon calls Strale's own API for some checks (ssl-check, header-security-check, dns-lookup, tech-stack-detect) — dogfooding
- Recommendations include Strale marketplace listing as one remediation path
- Footer: "Built by the team behind Strale — the trust layer for the agent economy"
- Contact email: hello@strale.io (never @strale.dev)
- Website domain: strale.dev

## Check architecture
Checks are defined as configuration in check-registry.yaml, not hardcoded. The scanning engine reads the registry and executes generically by check type (file_exists, header_parse, html_analyze, api_probe, etc.). Adding new checks = adding config entries, not writing new engine code. Check suite is versioned.

## Scoring methodology
- No aggregate score. Five independent category assessments.
- Each category: Green (Ready), Yellow (Partial), Red (Not Ready).
- Primary visual: five-axis radar chart with colored fills per tier.
- Shareable summary: radar chart shape + count ("3 of 5 areas agent-ready").

## Results page layers
1. **Overview** (above fold): Product name, radar chart hero, five tier badges with one-sentence summaries
2. **Agent's-eye narrative**: Simulated agent interaction walkthrough (collapsible)
3. **Detailed findings**: Five expandable sections, one per category, with specific checks and recommendations
4. **Prioritized action plan**: Top 3-5 highest-impact fixes across all categories

## Session protocol (simplified)
1. Declare session intent (one sentence)
2. Read relevant handoff files if they exist
3. Do the work
4. Write a handoff file to handoff/_general/from-code/
