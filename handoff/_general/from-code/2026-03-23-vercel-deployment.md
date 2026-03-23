# Vercel Deployment

**Intent:** Deploy Strale Beacon to Vercel with environment variables and custom domain configuration.

## Deployment details

- **Vercel URL:** https://strale-beacon.vercel.app
- **Custom domain:** scan.strale.io (added, pending DNS configuration)
- **GitHub repo:** https://github.com/petterlindstrom79/strale-beacon (private)
- **Vercel project:** strale-beacon (linked to GitHub for auto-deploys)
- **Region:** iad1 (Washington DC — Vercel's default; vercel.json specifies arn1 for functions)

## Pre-deployment changes

1. **Created `src/lib/url.ts`** — centralized `getSiteUrl()` utility that checks `NEXT_PUBLIC_SITE_URL` → `VERCEL_URL` → fallback to `https://scan.strale.io`
2. **Updated all BASE_URL references** in layout.tsx, results page, sitemap.ts, robots.ts to use `getSiteUrl()`
3. **Fixed `next.config.ts`** — added `turbopack.root` to resolve lockfile warning from parent directory
4. **Added `.env.local.example` to git** — fixed `.gitignore` exclusion pattern (`!.env.local.example`)

## Environment variables configured in Vercel

| Variable | Value | Scope |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://jouxfvoyjugmwlsxkras.supabase.co` | Production |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOi...` (anon key) | Production |
| `NEXT_PUBLIC_SITE_URL` | `https://scan.strale.io` | Production |

## DNS configuration required

The domain `scan.strale.io` has been added to the Vercel project but DNS is not yet configured.

**Action required — add this DNS record at your DNS provider (GoDaddy/Domaincontrol):**

| Type | Name | Value | TTL |
|---|---|---|---|
| A | scan | 76.76.21.21 | 600 (or default) |

Current nameservers are `ns71.domaincontrol.com` and `ns72.domaincontrol.com` (GoDaddy).

After adding the A record, Vercel will automatically:
- Verify the domain
- Provision an SSL certificate
- Route traffic to the deployment

DNS propagation typically takes 5-30 minutes.

## Post-deployment verification (all passed on Vercel URL)

| Check | Result |
|---|---|
| Landing page | 200 |
| robots.txt | Correct (allows AI crawlers) |
| llms.txt | Correct (machine-readable description) |
| sitemap.xml | Correct (includes landing page + strale-dev results) |
| Scan API (POST /api/scan) | Works (returned cached strale.dev result from Supabase) |
| Results API (GET /api/results/strale-dev) | 200 |
| Results page (/results/strale-dev) | 200, dynamic title: "strale.dev — Agent-Readiness Report" |
| OG image (/api/og/strale-dev) | 200, 29KB PNG |

## First public scan result

**strale.dev** — available at `https://strale-beacon.vercel.app/results/strale-dev`
(Will be at `https://scan.strale.io/results/strale-dev` once DNS propagates)

Results:
| Category | Tier |
|---|---|
| Discoverability | Green (Ready) |
| Comprehension | Yellow (Partial) |
| Usability | Yellow (Partial) |
| Stability | Yellow (Partial) |
| Agent Experience | Red (Not Ready) |

## Git

- Initial commit: `c8bb650` — "Initial release: Strale Beacon agent-readiness scanner"
- 61 files, 12,212 lines
- Pushed to `origin/master`
- Vercel is linked to GitHub repo for auto-deploys on push

## What's next

1. **Configure DNS** — Add the A record for `scan.strale.io` → `76.76.21.21`
2. **Verify custom domain** — Once DNS propagates, test https://scan.strale.io
3. **Threshold calibration** — Scan 20+ real products, compare with manual assessment
4. **Rate limiting** — Prevent scan API abuse
5. **Strale API dogfooding** — Integrate Strale's own API checks
6. **Marketing launch** — Share strale.dev scan result, write "State of Agent-Readiness" blog post
