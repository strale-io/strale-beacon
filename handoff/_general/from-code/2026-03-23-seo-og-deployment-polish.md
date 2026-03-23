# SEO, Open Graph, Deployment Prep & Visual Polish

**Intent:** Make Beacon launch-ready — proper meta tags for social sharing, deployment configuration for Vercel, and visual polish.

## What was built

### SEO & Open Graph

**Landing page meta tags** (via `layout.tsx` `Metadata` export):
- Title: "Strale Beacon — How Visible Is Your Product to AI Agents?"
- Description: "Free agent-readiness scanner..."
- OG title/description/url/siteName
- Twitter card (summary_large_image) with @strale_io
- Favicon references (ico + svg)

**Results page dynamic meta tags** (via `generateMetadata` in server component):
- Title: "[domain] — Agent-Readiness Report | Strale Beacon"
- Description: "X of 5 areas agent-ready. Discoverability: Ready. Comprehension: Partial..."
- OG image: `/api/og/[slug]` (dynamic 1200x630 PNG)
- Twitter card with dynamic image
- All server-rendered for social media crawler compatibility

**Architecture change:** Results page split into server component (`page.tsx` with `generateMetadata`) + client component (`ResultsView.tsx` with interactivity). This was necessary because `generateMetadata` runs on the server while the interactive results UI needs client-side state.

### OG Image Generation

**File:** `src/app/api/og/[slug]/route.tsx` (edge runtime)
- Uses `@vercel/og` (Satori) to generate 1200x630 PNG images
- Layout: Strale Beacon logo, domain name, 5 tier badges with colored dots, "X of 5 areas agent-ready" summary, scan.strale.io footer
- Generates from Supabase data — no scan needed
- Cached by Vercel CDN for 24 hours (via vercel.json headers)

### Structured Data

**JSON-LD on landing page:** WebApplication schema with name, description, URL, applicationCategory (DeveloperApplication), free pricing, and Strale as creator organization.

### Crawlability Assets

| File | Purpose |
|---|---|
| `src/app/sitemap.ts` | Dynamic sitemap with landing page + all scan result slugs from Supabase |
| `src/app/robots.ts` | Allows all crawlers, explicitly allows GPTBot, ClaudeBot, PerplexityBot, Google-Extended |
| `public/llms.txt` | Machine-readable Beacon description with API endpoints, categories, and links |
| `public/icon.svg` | SVG favicon — beacon/radar icon in brand blue |
| `public/favicon.ico` | ICO favicon — 16x16 brand blue circle |

### Deployment Configuration

**`vercel.json`:**
- Region: `arn1` (Stockholm — close to Strale EU infrastructure)
- API routes: `no-store` cache (scans must be fresh)
- OG images: 24-hour CDN cache
- Results pages: 1-hour CDN cache with stale-while-revalidate
- llms.txt: 24-hour cache with correct content-type

### Visual Polish

- Removed default Next.js placeholder SVGs from `public/`
- Desktop landing page verified: clean hierarchy, prominent headline, well-padded input, visible Scan button
- Desktop results page verified: radar chart centered as hero, clear tier badges, scannable check details
- OG image verified: clean layout, readable at thumbnail size, all tier badges visible

### Files created/modified

| File | Action |
|---|---|
| `src/app/layout.tsx` | Updated — full Metadata with OG, Twitter, favicon refs |
| `src/app/results/[slug]/page.tsx` | Rewritten — server component with `generateMetadata`, renders `ResultsView` |
| `src/components/ResultsView.tsx` | Created — extracted client component from results page |
| `src/app/api/og/[slug]/route.tsx` | Created — dynamic OG image generation |
| `src/app/sitemap.ts` | Created — dynamic sitemap |
| `src/app/robots.ts` | Created — robots.txt with AI crawler rules |
| `src/app/page.tsx` | Updated — added JSON-LD structured data |
| `public/llms.txt` | Created — machine-readable Beacon description |
| `public/icon.svg` | Created — SVG favicon |
| `public/favicon.ico` | Created — ICO favicon |
| `vercel.json` | Created — deployment configuration |
| `.env.local.example` | Updated — added NEXT_PUBLIC_SITE_URL |

## Verification checklist

All verified:
- [x] Landing page: title, description, OG tags, JSON-LD in page source
- [x] Results page: dynamic title with domain, OG image URL, Twitter card
- [x] `/api/og/strale-dev` returns 1200x630 PNG (29KB)
- [x] `/sitemap.xml` lists landing page + strale-dev results
- [x] `/robots.txt` allows all crawlers including AI crawlers
- [x] `/llms.txt` returns machine-readable Beacon description
- [x] Favicon SVG renders in browser tab
- [x] TypeScript compiles clean
- [x] vercel.json exists with correct configuration

## Deployment instructions

To deploy to Vercel:

1. **Create Vercel project:**
   ```
   npx vercel --yes
   ```

2. **Set environment variables in Vercel dashboard:**
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://jouxfvoyjugmwlsxkras.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from .env.local>
   NEXT_PUBLIC_SITE_URL=https://scan.strale.io
   ```

3. **Configure custom domain:**
   - Add `scan.strale.io` as a custom domain in Vercel dashboard
   - Add the CNAME record in DNS (strale.io DNS provider)
   - Vercel will auto-provision SSL

4. **Deploy:**
   ```
   npx vercel --prod
   ```

## What's next after launch

1. **Threshold calibration** — Run scans against 20+ real products, compare results with manual assessment, adjust scoring rules
2. **Rate limiting** — Add rate limiting to scan API (per-IP, per-domain) to prevent abuse
3. **Scan history** — Store multiple scans per domain, show trend over time on results page
4. **Strale API dogfooding** — Integrate Strale's own API for ssl-check, header-security-check checks
5. **A/B test CTAs** — Test different Strale marketplace CTA copy and placement
6. **Content marketing** — "State of Agent-Readiness" aggregate report from scan data
7. **Embeddable badge** — SVG badge sites can embed showing their tier summary
