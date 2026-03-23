# Supabase Integration — Persistent Scan Storage & Shareable URLs

**Intent:** Replace sessionStorage with Supabase for persistent scan storage, enabling shareable URLs, cache-aware rescanning, and email subscriptions.

## What was built

### Supabase project
- **Project:** `strale-beacon` (ID: `jouxfvoyjugmwlsxkras`)
- **Region:** eu-west-1
- **URL:** https://jouxfvoyjugmwlsxkras.supabase.co

### Database schema

Three tables with RLS enabled:

**domains** — One row per scanned domain
- `id` UUID PK, `domain` TEXT UNIQUE, `display_name` TEXT, `first_scanned_at`, `last_scanned_at`, `scan_count` INTEGER
- RLS: publicly readable, service can insert/update

**scans** — One row per scan result (latest per slug)
- `id` UUID PK, `domain_id` UUID FK, `slug` TEXT UNIQUE, `scanned_at`, `scan_version`, `scan_duration_ms`, `results` JSONB (full ScanResult), `tier_summary` JSONB, `green_count`/`yellow_count`/`red_count` INTEGER
- RLS: publicly readable, service can insert/update

**subscribers** — Email subscriptions for score change notifications
- `id` UUID PK, `email` TEXT, `domain_id` UUID FK, `subscribed_at`
- UNIQUE(email, domain_id)
- RLS: insert-only (not readable via anon key)

### Files created/modified

| File | Change |
|---|---|
| `src/lib/supabase.ts` | **Created** — Supabase client, DB types, domain helpers (`normalizeDomain`, `domainToSlug`), CRUD operations (`upsertDomain`, `findRecentScan`, `storeScan`, `fetchScanBySlug`, `subscribeEmail`) |
| `src/app/api/scan/route.ts` | **Updated** — Persists scan to Supabase after running, checks cache before scanning, returns `slug` in response, supports `force` param |
| `src/app/api/results/[slug]/route.ts` | **Created** — GET endpoint fetching scan by slug from Supabase |
| `src/app/api/subscribe/route.ts` | **Created** — POST endpoint for email subscriptions with validation |
| `src/app/results/[slug]/page.tsx` | **Updated** — Fetches from `/api/results/[slug]` instead of sessionStorage, loading skeleton, 404 page, subscribe form |
| `src/app/page.tsx` | **Updated** — Reads `slug` from scan API response, no more sessionStorage |
| `src/components/SubscribeForm.tsx` | **Created** — Email input with submit, success confirmation, error state |
| `.env.local` | **Created** — Supabase URL and anon key |
| `.env.local.example` | **Created** — Template for env vars |

### Caching behavior

1. When a scan is requested, the API checks Supabase for a recent scan of the same domain (within 1 hour)
2. If found, returns cached result with `cached: true` — no HTTP checks run against the target
3. If not found (or `force: true` in request body), runs full scan and persists new results
4. Slug is deterministic: `domain.replace(/\./g, '-')` — so `strale.dev` always gets slug `strale-dev`
5. Subsequent scans for the same domain update the existing scan row (same slug, new data)

### Slug generation

- `stripe.com` → `stripe-com`
- `api.example.io` → `api-example-io`
- `www.acme.co` → `acme-co` (www stripped during domain normalization)

## Environment variables

```
NEXT_PUBLIC_SUPABASE_URL=https://jouxfvoyjugmwlsxkras.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Both are `NEXT_PUBLIC_` prefixed because the Supabase client is used in client components for the subscribe form. The anon key is safe to expose — RLS controls access.

## Test results

All tests pass:

| Test | Result |
|---|---|
| Scan strale.dev → get slug back | slug: `strale-dev`, 5 categories |
| Fetch `/api/results/strale-dev` | Returns full scan result |
| Re-scan strale.dev (within 1 hour) | Returns cached result (`cached: true`) |
| Re-scan with `force: true` | Runs fresh scan, updates stored result |
| Fetch non-existent slug | Returns 404 |
| Subscribe with email | Success, stored in Supabase |
| Subscribe duplicate email | Returns `alreadySubscribed: true` |
| Full browser flow | Scan → redirect → results load from Supabase |
| Refresh results page | Data persists (loaded from API) |

Supabase data verified:
- `domains` table: `strale.dev` with `scan_count: 2`
- `scans` table: `strale-dev` with `green_count: 1, yellow_count: 3, red_count: 1`
- `subscribers` table: `test@example.com` and `peter@strale.io`

## What's next

1. **SEO and Open Graph** — Meta tags per results page, OG image generation with radar chart
2. **Visual polish** — Loading skeletons, radar chart draw animation, custom category icons
3. **Vercel deployment** — Deploy to scan.strale.io with environment variables
4. **Rate limiting** — Prevent abuse of the scan endpoint
5. **Historical tracking** — Store scan history per domain, show trends over time
