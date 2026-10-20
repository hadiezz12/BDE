/**
 * The site's public address, for absolute links (Open Graph images,
 * canonical URLs, the sitemap). Server-only setting `SITE_URL`, e.g.
 * "https://<the BDE's domain>": the BDE buys the domain, so it stays empty
 * until then and nothing guesses it. Without it, metadata keeps relative
 * URLs on localhost and the sitemap lists nothing.
 */
export function siteUrl(): URL | null {
  const raw = process.env.SITE_URL?.trim();
  if (!raw) return process.env.NODE_ENV === "production" ? null : new URL("http://localhost:3020");
  try {
    const url = new URL(raw);
    return url.protocol === "https:" || url.hostname === "localhost" ? url : null;
  } catch {
    return null;
  }
}
