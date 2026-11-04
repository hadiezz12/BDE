/**
 * The Content-Security-Policy of every page (Phase 15, finding F6 of Phase 14).
 *
 * Scripts run only with the nonce generated for that request ('strict-dynamic'
 * lets Next's own chunks load the rest), so a script injected into a page
 * cannot run even if escaping ever failed. The proxy (src/proxy.ts) puts the
 * policy on the request — Next then adds the nonce to its scripts — and on the
 * response.
 *
 * Choices, from what the site actually does:
 * - style-src keeps 'unsafe-inline': React renders `style` attributes (association
 *   colours, the editor), and attributes cannot carry a nonce. Styles cannot run code.
 * - connect-src adds the project's Supabase origin and its WebSocket: the
 *   notification bell reads its count and listens for changes from the browser.
 * - img-src: the site's own routes (/media/…), data: (the second-factor QR code)
 *   and blob: (previews of a picked file). No outside host anywhere.
 * - frame-ancestors 'self', like X-Frame-Options: SAMEORIGIN.
 * - In development only, 'unsafe-eval' (React's debugging needs it).
 *
 * Pure: imported by the proxy and by the unit tests.
 */

export type CspOptions = { nonce: string; supabaseUrl?: string | null; development?: boolean };

export function supabaseConnectSources(supabaseUrl?: string | null): string[] {
  if (!supabaseUrl) return [];
  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return [];
    const ws = url.protocol === "https:" ? "wss:" : "ws:";
    return [url.origin, `${ws}//${url.host}`];
  } catch {
    return [];
  }
}

export function contentSecurityPolicy({ nonce, supabaseUrl, development = false }: CspOptions): string {
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(nonce)) throw new Error("invalid nonce");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    ["connect-src 'self'", ...supabaseConnectSources(supabaseUrl)].join(" "),
    "media-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    // The page preview shows the site itself in a phone-sized frame (/associations/<slug>/apercu?vue=telephone).
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
  ].join("; ");
}

/** A fresh, unguessable nonce for one response (Web Crypto: works in every runtime). */
export function newNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
