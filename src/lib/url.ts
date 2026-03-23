/**
 * Returns the site's base URL, respecting environment.
 * - NEXT_PUBLIC_SITE_URL: explicitly set (production)
 * - VERCEL_URL: auto-set by Vercel (preview deployments)
 * - Fallback: https://scan.strale.io
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "https://scan.strale.io";
}
