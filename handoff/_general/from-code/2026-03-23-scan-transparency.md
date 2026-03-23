# Scan Transparency — Probe Details, Detection Methods, Confidence

**Intent:** Show users exactly what Beacon checked so they can fix issues precisely instead of guessing at detection logic.

## What was built

### Type extensions (types.ts)
- `Probe` interface: url, method, status, contentType, snippet, error
- `Confidence` type: "high" | "medium" | "low"
- Added to `CheckResult`: `probes: Probe[]`, `detectionMethod: string`, `confidence: Confidence`, `foundButUnrecognized: boolean`
- Added `how_we_check: string` to `CheckDefinition`
- Added `domainType: DomainType` and `crossDomainLinks` to `ScanContext`

### Registry (check-registry.yaml)
- Added `how_we_check` field to all 22 checks (20 MVP + 2 v2)
- Each describes: exactly what URLs are fetched, what response content is analyzed, what patterns determine pass/fail, and when detection is keyword-based

### Handler updates (handlers.ts) — all 20 MVP handlers updated
- Every `beaconFetch()` call produces a Probe entry
- `foundButUnrecognized` set when content exists but doesn't match expected format (e.g., JSON-LD blocks without relevant Schema.org types)
- `confidence` set per check: high for structural detection, medium for pattern matching, low for keyword inference
- Findings now include what was checked and what was found, not just what was missing

Low-confidence checks: use-signup-friction, use-sandbox, use-sdk, stab-tos-agents

### Domain type detection (runner.ts)
- Phase 0 added before discovery/analysis passes
- Fetches root URL, checks Content-Type: JSON → "api", HTML → "website"
- Extracts cross-domain links from root response (both JSON and HTML)
- `ScanContext.crossDomainLinks` available to all handlers

### Cross-domain awareness
- `comp-api-docs`: follows cross-domain doc links for API domains
- `comp-machine-pricing`: follows cross-domain pricing links for API domains
- `stab-changelog-status`: follows cross-domain changelog/status links for API domains
- `ax-first-contact`: extracts links from JSON API responses
- `ax-doc-navigability`: checks JSON link objects for API domains

### Results page UI (CheckDetail.tsx)
- "What we checked" expandable section per check (collapsed by default)
  - Shows detection method text
  - Lists every probe: method, URL, status code (color-coded), error
- Confidence indicator next to check name when not "high"
- "Found but format not recognized" badge for foundButUnrecognized checks
- `CategoryProbeSummary` component: deduplicated probe list at bottom of expanded category

### PDF report (BeaconReport.tsx)
- Detection method text under each check name (small grey)
- Probe URLs with status codes (Courier font, compact list, max 6 per check)
- Confidence and foundButUnrecognized indicators in check headers

## Test results (strale.dev)

| Category | Tier | Total Probes | Low Confidence Checks |
|---|---|---|---|
| Discoverability | Green | 6 | 0 |
| Comprehension | Green | 10 | 0 |
| Usability | Yellow | 17 | 3 (signup, sandbox, sdk) |
| Stability | Yellow | 14 | 1 (tos) |
| Agent Experience | Red | 4 | 0 |

- Total probes across scan: 51
- All 20 checks have detectionMethod populated
- foundButUnrecognized correctly flags partial matches
- PDF generates successfully with new fields (34KB vs 24KB before)
- TypeScript: clean compile
- Production build: passes

## Known issues
- Some checks show 0 probes when they reuse homepage HTML cached by Phase 0 domain detection. The probes for those fetches live in the detection phase, not the check. This is correct (no redundant fetches) but could be confusing — a future improvement could attribute Phase 0 probes to the checks that use them.
- Cross-domain link extraction from HTML is broad — captures all external links, not just relevant ones. The handlers filter by keyword, so this doesn't cause false positives but does mean `ctx.crossDomainLinks` can be large.

## What's next
1. Push and deploy
2. Test cross-domain detection with api.strale.io or a domain with separate API subdomain
3. Consider attributing Phase 0 probes to consuming checks
4. Phase 2: score progression and engagement features
