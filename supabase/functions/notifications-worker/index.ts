/**
 * notifications-worker — sends the e-mails of the notification centre.
 *
 * Woken every minute by the database when something is due
 * (private.kick_notification_worker: pg_cron → pg_net), with
 * `Authorization: Bearer <token>` compared with the Vault secret
 * notifications_worker_token. Deployed with verify_jwt = false: the token is
 * the only key, and without it the function answers 404.
 *
 * It reaches the database through SUPABASE_DB_URL (provided by the platform)
 * and calls only the private worker functions; no API key, no row-level
 * bypass from the site. The Brevo key is the function's secret BREVO_API_KEY.
 * Nothing personal is logged: counts and short error codes only.
 */

import postgres from "npm:postgres@3.4.5";
import { runWorker, type ClaimedDelivery, type WorkerConfig, type WorkerDb } from "../_shared/notifications/worker.ts";

const dbUrl = Deno.env.get("SUPABASE_DB_URL");
const sql = dbUrl ? postgres(dbUrl, { prepare: false, max: 2, idle_timeout: 20, connect_timeout: 10 }) : null;

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function bearer(request: Request): string | null {
  const value = request.headers.get("authorization") ?? "";
  const m = value.match(/^Bearer\s+(\S{32,512})$/i);
  return m ? m[1] : null;
}

function database(db: postgres.Sql): WorkerDb {
  return {
    async config() {
      const [row] = await db`select private.notification_worker_config() as config`;
      return (row?.config ?? null) as WorkerConfig | null;
    },
    async startRun(mode) {
      const [row] = await db`select private.start_notification_run(${mode}) as id`;
      return Number(row.id);
    },
    async finishRun(id, r) {
      await db`select private.finish_notification_run(${id}, ${r.claimed}, ${r.accepted}, ${r.failed}, ${r.skipped}, ${r.error})`;
    },
    async claim(limit) {
      const [row] = await db`select private.claim_notification_deliveries(${limit}) as batch`;
      return (row?.batch ?? []) as ClaimedDelivery[];
    },
    async complete(id, provider, result) {
      const messageId = result.outcome === "provider_accepted" ? result.messageId : null;
      const error = result.outcome === "provider_accepted" ? null : result.error;
      const retryAfter = result.outcome === "failed_retryable" ? (result.retryAfter ?? null) : null;
      const [row] = await db`
        select private.complete_notification_delivery(${id}, ${result.outcome}, ${provider}, ${messageId}, ${error}, ${retryAfter}) as status`;
      return String(row.status);
    },
    async capture(id, email) {
      await db`select private.capture_notification_email(${id}, ${email.subject}, ${email.text}, ${email.html}, ${db.json(email.headers)})`;
    },
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(404, { error: "not_found" });
  if (!sql) return json(503, { error: "database_not_configured" });
  const token = bearer(request);
  if (!token) return json(404, { error: "not_found" });
  try {
    const [row] = await sql`select private.notification_token_ok('notifications_worker_token', ${token}) as ok`;
    if (!row?.ok) return json(404, { error: "not_found" });
  } catch {
    console.error("[notifications-worker] token check failed");
    return json(503, { error: "database_unreachable" });
  }

  const report = await runWorker(database(sql), { brevoKey: Deno.env.get("BREVO_API_KEY")?.trim() || null });
  if (report.error) console.error(`[notifications-worker] ${report.mode}: ${report.error}`);
  console.info(`[notifications-worker] ${report.mode}: claimed ${report.claimed}, accepted ${report.accepted}, failed ${report.failed}, skipped ${report.skipped}`);
  return json(200, report);
});
