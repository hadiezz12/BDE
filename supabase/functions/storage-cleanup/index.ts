/**
 * storage-cleanup — deletes from Storage the files the database let go:
 * application documents replaced, removed, purged with their application
 * (by the retention rules or an erasure), or reserved and never confirmed.
 * A database trigger queues them in private.storage_cleanup_queue.
 *
 * Woken by the database when files wait (private.kick_storage_cleanup,
 * job storage-cleanup: pg_cron → pg_net), with `Authorization: Bearer <token>`
 * compared with the Vault secret storage_cleanup_token. Deployed with
 * verify_jwt = false: the token is the only key, and without it the function
 * answers 404.
 *
 * One narrow capability: it claims queued paths through its database
 * connection (SUPABASE_DB_URL, provided by the platform), deletes only those
 * paths, only in the buckets listed here, through the Storage API with the
 * project's secret key (SUPABASE_SECRET_KEYS, provided by the platform, sent
 * as `apikey` only), and reports each outcome. A claimed file is leased for
 * five minutes, so two runs never take the same one and a crash gives it
 * back. Deleting a file that is already gone counts as done. Nothing
 * personal is logged: counts and short error codes only.
 */

import postgres from "npm:postgres@3.4.5";

const BUCKETS = new Set(["recruitment-documents"]);
const PATH = /^applications\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;

const dbUrl = Deno.env.get("SUPABASE_DB_URL");
const sql = dbUrl ? postgres(dbUrl, { prepare: false, max: 2, idle_timeout: 20, connect_timeout: 10 }) : null;

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function bearer(request: Request): string | null {
  const value = request.headers.get("authorization") ?? "";
  const m = value.match(/^Bearer\s+(\S{32,512})$/i);
  return m ? m[1] : null;
}

/** The project's secret key: the new default secret key, or the legacy service-role key. */
function storageHeaders(): Record<string, string> | null {
  const keys = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      const key = parsed.default ?? Object.values(parsed)[0];
      if (key?.startsWith("sb_secret_")) return { apikey: key };
    } catch {
      // fall through to the legacy key
    }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return legacy ? { apikey: legacy, Authorization: `Bearer ${legacy}` } : null;
}

interface Claimed {
  id: number;
  bucket: string;
  path: string;
}

async function remove(url: string, headers: Record<string, string>, item: Claimed): Promise<string | null> {
  if (!BUCKETS.has(item.bucket) || !PATH.test(item.path)) return "unexpected_path";
  try {
    const response = await fetch(`${url}/storage/v1/object/${encodeURIComponent(item.bucket)}`, {
      method: "DELETE",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: [item.path] }),
      signal: AbortSignal.timeout(15_000),
    });
    await response.body?.cancel();
    return response.ok ? null : response.status === 401 || response.status === 403 ? "storage_unauthorized" : "storage_error";
  } catch {
    return "storage_unreachable";
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(404, { error: "not_found" });
  if (!sql) return json(503, { error: "database_not_configured" });
  const token = bearer(request);
  if (!token) return json(404, { error: "not_found" });
  try {
    const [row] = await sql`select private.notification_token_ok('storage_cleanup_token', ${token}) as ok`;
    if (!row?.ok) return json(404, { error: "not_found" });
  } catch {
    console.error("[storage-cleanup] token check failed");
    return json(503, { error: "database_unreachable" });
  }

  const url = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const headers = storageHeaders();
  if (!url || !headers) return json(503, { error: "storage_not_configured" });

  const [claim] = await sql`select public.claim_storage_cleanup(100) as batch`;
  const batch = (claim?.batch ?? []) as Claimed[];
  const outcome = { claimed: batch.length, deleted: 0, failed: 0 };
  for (const item of batch) {
    const error = await remove(url, headers, item);
    await sql`select public.complete_storage_cleanup(${item.id}, ${error === null}, ${error})`;
    if (error === null) outcome.deleted += 1;
    else outcome.failed += 1;
  }
  console.info(`[storage-cleanup] claimed ${outcome.claimed}, deleted ${outcome.deleted}, failed ${outcome.failed}`);
  return json(200, outcome);
});
