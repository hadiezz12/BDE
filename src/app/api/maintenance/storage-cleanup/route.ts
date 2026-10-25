import { timingSafeEqual } from "node:crypto";
// eslint-disable-next-line no-restricted-imports -- the Storage cleanup worker: a trusted server job listed in docs/backend/security-foundations.md (claim_storage_cleanup is service_role only).
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/maintenance/storage-cleanup — deletes from Storage the files the
 * database let go: application documents replaced, removed, purged with
 * their application, or reserved and never confirmed (a database trigger
 * queues them in private.storage_cleanup_queue). One batch per call.
 *
 * Called by a scheduler the operator sets up (every hour is plenty), with
 * `Authorization: Bearer <MAINTENANCE_WORKER_SECRET>`; not found without the
 * secret, so the endpoint does not exist until it is configured. It only
 * ever deletes paths the queue names, in the buckets the queue names, and
 * logs nothing personal (no path, no name).
 */

const json = (status: number, body: object) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

const BUCKETS = new Set(["recruitment-documents"]);

function authorized(request: Request): boolean {
  const secret = process.env.MAINTENANCE_WORKER_SECRET?.trim();
  if (!secret || secret.length < 32) return false;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Claimed {
  id: number;
  bucket: string;
  path: string;
}

export async function POST(request: Request) {
  if (!authorized(request)) return json(404, { error: "not_found" });
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("claim_storage_cleanup", { p_limit: 100 });
  if (error) {
    console.error("[storage-cleanup] claim failed", error.code);
    return json(500, { error: "claim_failed" });
  }
  const batch = (data as unknown as Claimed[]) ?? [];
  const outcome = { claimed: batch.length, deleted: 0, failed: 0 };

  for (const item of batch) {
    let ok = false;
    let reason: string | null = null;
    if (!BUCKETS.has(item.bucket) || !/^applications\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(item.path)) {
      reason = "unexpected_path";
    } else {
      // Deleting a file that is already gone is a success too.
      const removed = await supabase.storage.from(item.bucket).remove([item.path]);
      ok = !removed.error;
      reason = removed.error ? "storage_error" : null;
    }
    const done = await supabase.rpc("complete_storage_cleanup", { p_id: item.id, p_ok: ok, p_error: reason ?? undefined });
    if (done.error) console.error("[storage-cleanup] complete failed", item.id, done.error.code);
    if (ok) outcome.deleted += 1;
    else outcome.failed += 1;
  }
  return json(200, outcome);
}
