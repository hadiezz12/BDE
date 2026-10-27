import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { createSupabasePublicClient } from "@/lib/supabase/public";

/**
 * GET /api/health — the site's state for an external uptime check (Phase
 * 11, docs/operations/scheduled-jobs.md): the database answers, sign-in
 * answers, and the essential jobs ran on time. Measured from outside the
 * database, so a scheduler that stopped altogether is still noticed.
 * Booleans only, no detail: 200 when everything verifiable is fine, 503
 * otherwise. Anyone may call it; it reads nothing private.
 */

export const dynamic = "force-dynamic";

const json = (status: number, body: object) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function authAnswers(url: string, key: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key }, signal: AbortSignal.timeout(4_000), cache: "no-store" });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

export async function GET() {
  let env: ReturnType<typeof getSupabasePublicEnv>;
  try {
    env = getSupabasePublicEnv();
  } catch {
    return json(503, { status: "not_configured" });
  }
  // A visitor's client, without cookies: the heartbeat is the same for everyone.
  const supabase = createSupabasePublicClient();
  const [heartbeat, auth] = await Promise.all([
    supabase.rpc("platform_heartbeat").then(
      (r) => (r.error ? null : (r.data as { database: boolean; jobs_on_time: boolean | null })),
      () => null,
    ),
    authAnswers(env.url, env.publishableKey),
  ]);
  const database = heartbeat?.database === true;
  const jobs = heartbeat ? (heartbeat.jobs_on_time === null ? "unverifiable" : heartbeat.jobs_on_time ? "on_time" : "late") : "unknown";
  const ok = database && auth && jobs !== "late" && jobs !== "unknown";
  return json(ok ? 200 : 503, { status: ok ? "ok" : "degraded", database, auth, jobs, checked_at: new Date().toISOString() });
}
