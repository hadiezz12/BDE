/**
 * The ?next= destination after signing in, only when it is a same-site path.
 *
 * Rejects absolute and protocol-relative URLs, backslashes (browsers read
 * "/\host" as "//host"), control characters, and the sign-in pages
 * themselves (no loops). Returns the normalised path + query + hash, or null.
 *
 * No path-alias imports: the unit tests load this file with plain Node.
 */

/** Reserved TLD: never resolves, only used to parse relative paths. */
const BASE = "http://vpc.invalid";

/** routes.login and routes.authCallback: never a destination. */
const SIGN_IN_PREFIXES = ["/login", "/auth"];

export function safeNextPath(value: string | string[] | null | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || raw.length > 512) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return null;
  for (const ch of raw) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return null;
  }
  let url: URL;
  try {
    url = new URL(raw, BASE);
  } catch {
    return null;
  }
  if (url.origin !== BASE) return null;
  if (SIGN_IN_PREFIXES.some((p) => url.pathname === p || url.pathname.startsWith(`${p}/`))) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** "/login?next=…" (or "/login/verification?next=…"), with the destination kept only when safe. */
export function withNext(path: string, next: string | null | undefined): string {
  const safe = safeNextPath(next ?? undefined);
  return safe ? `${path}?next=${encodeURIComponent(safe)}` : path;
}
