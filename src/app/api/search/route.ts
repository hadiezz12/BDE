import { NextResponse, type NextRequest } from "next/server";
import { quickSearch } from "@/lib/data/search";
import { searchQuery } from "@/lib/search/query";
import { clientKey, createRateLimiter } from "@/lib/rate-limit";

/**
 * GET /api/search?q= — the quick search of the ⌘K dialog: the best few
 * public results of each type (public.search_campus, read as a visitor:
 * only what anyone may read right now) and the BDE's events of the year.
 * No session is read and nothing personal is returned. Never cached (a
 * moderated or unpublished item must disappear at the next keystroke).
 * Thirty requests per ten seconds per client, then 429: the dialog waits
 * for the typing to pause, so a person never reaches it.
 */

const limiter = createRateLimiter({ limit: 30, windowMs: 10_000 });

const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

export async function GET(request: NextRequest) {
  const key = clientKey(request.headers);
  if (!limiter.hit(key)) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limiter.retryAfter(key)) } },
    );
  }
  const q = searchQuery(request.nextUrl.searchParams.get("q") ?? undefined);
  if (!q) return NextResponse.json({ q, results: [], total: 0, tooShort: false }, { headers: NO_STORE });
  const found = await quickSearch(q);
  if (!found) return NextResponse.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ q, ...found }, { headers: NO_STORE });
}
