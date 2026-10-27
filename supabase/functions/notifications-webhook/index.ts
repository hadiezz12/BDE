/**
 * notifications-webhook — Brevo's transactional events (delivered, bounced,
 * blocked, complaint…), so a message's state follows what really happened
 * and undeliverable addresses stop receiving mail.
 *
 * Brevo calls it with `Authorization: Bearer <token>` (the webhook's
 * "bearer" authentication), compared with the Vault secret
 * notifications_webhook_token. Deployed with verify_jwt = false; without
 * the token it answers 404 and records nothing. Each event is matched by
 * the key we sent in X-Mailin-custom (or Brevo's message id) and recorded
 * once (private.record_provider_event: repeats and late events never move a
 * message backwards). Opens and clicks are ignored. No address, subject or
 * payload is logged.
 */

import postgres from "npm:postgres@3.4.5";

const dbUrl = Deno.env.get("SUPABASE_DB_URL");
const sql = dbUrl ? postgres(dbUrl, { prepare: false, max: 2, idle_timeout: 20, connect_timeout: 10 }) : null;

const json = (status: number, body: object) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function bearer(request: Request): string | null {
  const m = (request.headers.get("authorization") ?? "").match(/^Bearer\s+(\S{32,512})$/i);
  return m ? m[1] : null;
}

/** "hardBounce" and "hard_bounce" → "hard_bounce". */
const eventName = (value: unknown) =>
  typeof value === "string" ? value.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().slice(0, 40) : "";

function occurredAt(e: Record<string, unknown>): string {
  for (const field of ["ts_event", "ts_epoch", "ts"]) {
    const v = Number(e[field]);
    if (Number.isFinite(v) && v > 0) return new Date(field === "ts_epoch" ? v : v * 1000).toISOString();
  }
  const date = typeof e.date === "string" ? Date.parse(e.date) : NaN;
  return new Date(Number.isFinite(date) ? date : Date.now()).toISOString();
}

const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

Deno.serve(async (request) => {
  if (request.method !== "POST") return json(404, { error: "not_found" });
  if (!sql) return json(503, { error: "database_not_configured" });
  const token = bearer(request);
  if (!token) return json(404, { error: "not_found" });
  try {
    const [row] = await sql`select private.notification_token_ok('notifications_webhook_token', ${token}) as ok`;
    if (!row?.ok) return json(404, { error: "not_found" });
  } catch {
    console.error("[notifications-webhook] token check failed");
    return json(503, { error: "database_unreachable" });
  }

  const raw = await request.text();
  if (raw.length > 512 * 1024) return json(413, { error: "too_large" });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const events = (Array.isArray(body) ? body : [body]).slice(0, 500);
  const outcome = { recorded: 0, duplicate: 0, ignored: 0, invalid: 0 };
  for (const item of events) {
    if (!item || typeof item !== "object") {
      outcome.invalid += 1;
      continue;
    }
    const e = item as Record<string, unknown>;
    const name = eventName(e.event);
    if (!/^[a-z_]{2,40}$/.test(name)) {
      outcome.invalid += 1;
      continue;
    }
    try {
      const [row] = await sql`
        select private.record_provider_event('brevo', ${name}, ${text(e["message-id"], 300)}, ${text(e["X-Mailin-custom"], 100)},
                                             ${occurredAt(e)}::timestamptz, ${text(e.email, 320)}) as result`;
      const result = (row?.result ?? {}) as { duplicate?: boolean; ignored?: boolean };
      if (result.duplicate) outcome.duplicate += 1;
      else if (result.ignored) outcome.ignored += 1;
      else outcome.recorded += 1;
    } catch {
      outcome.invalid += 1;
    }
  }
  if (outcome.invalid) console.error(`[notifications-webhook] ${outcome.invalid} event(s) not recorded`);
  return json(200, outcome);
});
