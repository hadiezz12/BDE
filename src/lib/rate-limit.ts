/**
 * A small fixed-window limiter, in the server's memory: enough to stop one
 * client hammering a public endpoint (the search) without an outside
 * service. Per server instance (several instances each count on their own),
 * so it is a brake, not a quota; the database bounds each request's work
 * anyway (short queries, small pages). Pure module, tested with plain Node.
 */

export interface RateLimiter {
  /** Counts one hit for `key`; false once the window's allowance is used. */
  hit(key: string, now?: number): boolean;
  /** Seconds until `key` may try again (0 when it may). */
  retryAfter(key: string, now?: number): number;
}

export function createRateLimiter({ limit, windowMs, maxKeys = 5000 }: { limit: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const windows = new Map<string, { start: number; count: number }>();

  function current(key: string, now: number) {
    const w = windows.get(key);
    if (w && now - w.start < windowMs) return w;
    return null;
  }

  return {
    hit(key, now = Date.now()) {
      const w = current(key, now);
      if (w) {
        w.count += 1;
        return w.count <= limit;
      }
      if (windows.size >= maxKeys) {
        // Forget finished windows first, then the oldest ones: memory stays bounded.
        for (const [k, v] of windows) if (now - v.start >= windowMs) windows.delete(k);
        while (windows.size >= maxKeys) windows.delete(windows.keys().next().value as string);
      }
      windows.set(key, { start: now, count: 1 });
      return true;
    },
    retryAfter(key, now = Date.now()) {
      const w = current(key, now);
      if (!w || w.count <= limit) return 0;
      return Math.max(1, Math.ceil((w.start + windowMs - now) / 1000));
    },
  };
}

/** The client's address as the hosting proxy reports it (never trusted for anything but counting). */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (headers.get("x-real-ip") ?? forwarded ?? "unknown").slice(0, 64);
}
