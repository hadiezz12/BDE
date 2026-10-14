import { routes } from "@/lib/routes";

/** Reserved TLD: never resolves, only used to parse relative paths. */
const BASE = "http://vpc.invalid";

/**
 * The ?next= target, only when it is a same-site path. Rejects absolute and
 * protocol-relative URLs, backslashes (browsers read "/\host" as "//host"),
 * control characters, and the login page itself (no loop). Returns the
 * normalised path + query + hash, or null.
 */
export function safeNextPath(value: string | string[] | undefined): string | null {
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
  if (url.pathname === routes.login || url.pathname.startsWith(`${routes.login}/`)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}
