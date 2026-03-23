# Scanning Engine Implementation

**Intent:** Build the core scanning engine — takes a URL, runs all checks, returns structured results with per-category tiers.

## What was built

### Architecture

```
src/lib/checks/
├── types.ts        # All interfaces: CheckDefinition, CheckResult, CategoryResult, ScanResult, ScanContext
├── registry.ts     # YAML loader — reads check-registry.yaml, filters MVP checks, caches
├── fetch.ts        # HTTP utility — beaconFetch() with User-Agent, timeout, redirect following
├── handlers.ts     # 20 check handlers, one per MVP check ID, plus dispatch map
├── scoring.ts      # Per-category tier calculation (green/yellow/red)
├── runner.ts       # Orchestrator — two-pass parallel execution with shared context
└── index.ts        # Barrel export

src/app/api/scan/
└── route.ts        # POST /api/scan — validates URL, runs engine, returns JSON
```

### Key design decisions

1. **Two-pass execution model**: Discovery checks (homepage, robots.txt, OpenAPI, API probes) run first in parallel. Analysis checks (auth, friction, versioning) run second in parallel, consuming shared context from pass 1. This avoids re-fetching and lets downstream checks use OpenAPI specs, doc URLs, and API responses found by upstream checks.

2. **ScanContext as shared state**: A mutable context object accumulates findings as checks run. Contains: homepage HTML/headers, robots.txt, OpenAPI spec, discovered doc URLs, API responses, and a page cache. Checks both read from and write to it.

3. **Per-check timeout (10s) + total scan timeout (30s)**: Individual slow checks don't block the scan. If total time exceeds 28s, remaining analysis checks are skipped with a warning.

4. **Handler dispatch by check ID, not check_type**: Each check has unique analysis logic beyond its nominal type. The `CHECK_HANDLERS` map in handlers.ts dispatches by `check.id` to the specific handler function. Unknown checks fall through to a generic "not implemented" warning.

5. **Never throws**: All handlers return CheckResult with status pass/warn/fail. Errors and timeouts become warn results, never crash the scan.

6. **SSRF protection**: The API route blocks localhost, 127.0.0.1, and private IP ranges. Only http/https protocols allowed.

### Check handlers implemented (20 MVP checks)

| Category | Check ID | What it does |
|---|---|---|
| Discoverability | disc-llms-txt | Fetches /llms.txt and /llms-full.txt, analyzes quality |
| | disc-ai-crawler-policy | Parses robots.txt for 10 AI crawler rules |
| | disc-structured-data | Extracts JSON-LD from homepage, looks for Schema.org types |
| | disc-sitemap | Checks sitemap.xml for developer-facing pages |
| | disc-mcp-a2a | Probes /.well-known/mcp.json and /.well-known/agent.json |
| Comprehension | comp-openapi | Checks 5 standard OpenAPI spec locations |
| | comp-api-docs | Probes /docs, /api, /developers, /api-reference for public access |
| | comp-endpoint-completeness | Analyzes OpenAPI spec for description/schema coverage |
| | comp-machine-pricing | Checks /pricing for JSON-LD or structured pricing data |
| Usability | use-auth-docs | Searches OpenAPI spec + docs for auth method keywords |
| | use-signup-friction | Detects CAPTCHA, email/phone verification, credit card, waitlist |
| | use-sandbox | Looks for sandbox/test/free-tier keywords across docs and pricing |
| | use-error-quality | Probes /api, /v1, /api/v1, /api/v2 — checks if JSON or HTML |
| | use-sdk | Searches for npm/pip/SDK references and agent framework mentions |
| Stability | stab-versioning | Checks URL patterns, headers, OpenAPI for version info |
| | stab-changelog-status | Probes /changelog, /status, + statuspage.io links |
| | stab-rate-limits | Checks X-RateLimit headers + docs for rate limit mentions |
| | stab-tos-agents | Fetches ToS pages, searches for bot/automation keywords |
| | stab-security | Checks HTTPS, HSTS, CSP, X-Content-Type-Options, X-Frame-Options |
| Agent Experience | ax-first-contact | Tests API endpoints for JSON vs HTML responses |
| | ax-doc-navigability | Counts doc link hops from homepage |
| | ax-response-consistency | Checks JSON consistency across API responses |
| | ax-support-paths | Looks for status API, contact data, webhook docs |

## Test scan results (summary)

### stripe.com (7.4s)
| Category | Tier | Key findings |
|---|---|---|
| Discoverability | Yellow | Has llms.txt (298 lines), but no MCP/A2A, no structured data types |
| Comprehension | Yellow | No OpenAPI at standard paths (Stripe uses its own spec format), docs accessible |
| Usability | Yellow | Auth documented, sandbox available, but high signup friction (5 friction points) |
| Stability | **Green** | Versioned API (v1/v2), changelog, status page, security headers 5/5 |
| Agent Experience | Red | API paths return HTML (auth required), docs well-linked from homepage |

### strale.dev (1.5s)
| Category | Tier | Key findings |
|---|---|---|
| Discoverability | **Green** | llms.txt (388 lines), allows 6 AI crawlers, SoftwareApplication structured data, rich sitemap |
| Comprehension | Yellow | No OpenAPI at standard paths, but docs accessible at 4 paths, machine-readable pricing |
| Usability | Yellow | API key auth mentioned, low signup friction, sandbox references, but /api returns HTML |
| Stability | Yellow | Versioned URLs, changelog + status, but no rate limit headers, missing CSP |
| Agent Experience | Red | API paths return HTML (SPA), doc links need JS navigation |

### cal.com (6.4s)
| Category | Tier | Key findings |
|---|---|---|
| Discoverability | Yellow | llms.txt (8 lines, thin), no structured data, no MCP/A2A |
| Comprehension | Yellow | No OpenAPI at standard paths, docs accessible at /docs and /developers |
| Usability | Yellow | Auth well-documented (6 methods!), but high signup friction, JSON error responses at /api/v2 |
| Stability | Yellow | Versioned API, external status page, ToS may prohibit bots |
| Agent Experience | Yellow | /api/v2 returns JSON (good), docs well-linked, but mixed HTML/JSON responses |

## Threshold calibration observations

1. **Agent Experience scoring may be too harsh**: Stripe scores red despite being one of the best-documented APIs on the web. The issue is that /api, /v1 etc. return HTML because Stripe's API isn't at stripe.com/api — it's at api.stripe.com. The check probes only the scanned domain's paths. Consider: in the future, check for API-specific subdomains (api.*, developer.*) or follow links from the llms.txt/docs.

2. **"Unaddressed" AI crawlers scored as warn**: Stripe's robots.txt doesn't mention AI crawlers, which is scored as warn. This is debatable — "unaddressed" means allowed by default. Consider making this pass-level if no crawlers are blocked.

3. **Signup friction detection has false positives**: The check looks for keyword matches across ALL fetched pages. Stripe's docs mention "CAPTCHA" in educational context, not as a signup requirement. This inflates the friction score. Needs refinement — only check actual signup pages.

4. **OpenAPI discovery misses non-standard locations**: Stripe, Strale, and Cal.com all have API specs, just not at the standard 5 paths. Consider: following links from docs, checking <link> tags in HTML, checking llms.txt for spec URLs.

## What's next

1. **Results page UI** — Build the radar chart and results layout at `src/app/results/[slug]/page.tsx`
2. **Landing page** — URL input + scan button at `src/app/page.tsx`
3. **SSE streaming** — Server-Sent Events for live scanning feed during the scan
4. **Supabase integration** — Store scan results, domain cache, email subscribers
5. **Threshold refinement** — Address the calibration issues noted above
6. **Strale API integration** — Use Strale's own API for ssl-check, header-security-check (dogfooding)
