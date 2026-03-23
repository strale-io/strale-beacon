# JSON Report Endpoint and Fix Blocks

**Intent:** Make Beacon output directly actionable by LLMs — paste a report into Claude and say "fix everything."

## What was built

### Fix blocks (check-registry.yaml)
All 20 MVP checks now have a `fix` block with:
- `what`: one-sentence action to take
- `why`: one-sentence impact explanation
- `effort`: low/medium/high
- `impact`: low/medium/high
- `example_before`: what a failing state looks like
- `example_after`: what a passing state looks like (usable as a template)
- `verification`: curl/command to verify the fix worked

### JSON report endpoint (GET /api/report/[slug])
Structured JSON designed for LLM consumption. Schema:
- `meta`: tool name, version, report format, timestamp
- `llm_instructions`: plain-text instructions for an LLM on how to use the report
- `scan`: URL, domain, duration, check counts
- `summary`: tier counts, per-category tiers, narrative
- `progression`: previous scan comparison (if exists)
- `checks[]`: every check with status, confidence, evidence (probes), fix block
- `action_plan[]`: top 5 fixes ranked by impact/effort ratio

### Priority ranking
Action plan uses: `impactScore - effortPenalty` where:
- Impact: high=30, medium=20, low=10
- Effort penalty: low=0, medium=10, high=25
- Result: high impact + low effort = 30 (best), high impact + high effort = 5 (worst)

### UI updates
- **CheckDetail.tsx**: "How to fix" expandable section with effort/impact badges, before/after code blocks (red/green tinted), verification command
- **ActionPlan.tsx**: ranking uses fix block effort/impact instead of just weight
- **ResultsView.tsx**: `{ } JSON Report` link next to PDF download button (monospace styled)

### PDF updates
- Category detail pages: fix block below recommendation with what/why, effort/impact, example_after code block, verification command
- Developer appendix page (page 10): numbered checklist of all fixable checks with action, metadata, and verification command — designed to be handed to a developer

### Type changes
- `FixBlock` interface added to types.ts
- `CheckDefinition.fix?: FixBlock`
- `CheckResult.fix?: FixBlock` — attached by makeResult() for warn/fail checks
- Registry loader parses fix blocks from YAML

## Test results

JSON report for strale.dev:
- 23 checks run, 13 pass, 4 warn, 6 fail
- 10 warn/fail checks all have fix blocks (0 without)
- Action plan: 5 items sorted correctly (low effort + high impact first)
- LLM instructions contain domain and rescan URL
- All endpoints return 200 in production

## What's next
1. Run a fresh scan (`force=true`) so the fix blocks are stored in Supabase results (currently they're only in the registry and merged at render time)
2. Add fix block examples for v2 checks when they're implemented
3. Consider adding a "Copy JSON report" button for easy paste into LLM conversations
4. Test LLM actionability by pasting the JSON into Claude and asking it to generate implementation code
