import { timingSafeEqual } from "node:crypto";
// eslint-disable-next-line no-restricted-imports -- the e-mail worker: a trusted server job listed in docs/backend/security-foundations.md (claim_notification_emails is service_role only).
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { siteUrl } from "@/lib/site-url";
import { renderEventEmail } from "@/lib/events/email";
import type { EventMessageKind, EventMessagePayload } from "@/lib/events/messages";
import { getEmailTransport } from "@/lib/notifications/transport";

/**
 * POST /api/notifications/send — the e-mail worker, one batch per call.
 * Called by a scheduler the operator sets up (every few minutes), with
 * `Authorization: Bearer <NOTIFICATIONS_WORKER_SECRET>`; not found without
 * the secret, so the endpoint does not exist until it is configured.
 *
 * It claims up to 20 pending messages (public.claim_notification_emails:
 * skip locked, a 10-minute lease, so two runs never send the same message),
 * renders each one, hands it to the transport, and records the outcome
 * (complete_notification_email: retries with backoff, "failed" after five
 * attempts). Registrations are never touched: a delivery problem changes
 * nothing about anyone's seat. With no transport configured it claims
 * nothing and says so. Nothing personal is logged (no address, no text).
 */

const json = (status: number, body: object) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function authorized(request: Request): boolean {
  const secret = process.env.NOTIFICATIONS_WORKER_SECRET?.trim();
  if (!secret || secret.length < 32) return false;
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Claimed {
  id: number;
  kind: EventMessageKind;
  payload: EventMessagePayload;
  attempt: number;
  email: string | null;
  name: string | null;
}

export async function POST(request: Request) {
  if (!authorized(request)) return json(404, { error: "not_found" });
  const transport = getEmailTransport();
  if (!transport) return json(503, { error: "email_transport_not_configured", claimed: 0 });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("claim_notification_emails", { p_limit: 20 });
  if (error) {
    console.error("[email] claim failed", error.code);
    return json(500, { error: "claim_failed" });
  }
  const batch = (data as unknown as Claimed[]) ?? [];
  const site = siteUrl();
  const outcome = { claimed: batch.length, sent: 0, failed: 0, skipped: 0, transport: transport.name };

  for (const m of batch) {
    let ok = false;
    let reason: string | null = null;
    if (!m.email) {
      reason = "no_address";
    } else {
      const email = renderEventEmail({ kind: m.kind, payload: m.payload, name: m.name, site });
      const sent = await transport.send({ email: m.email, name: m.name }, email, m.id);
      ok = sent.ok;
      reason = sent.ok ? null : sent.error;
    }
    const done = await supabase.rpc("complete_notification_email", { p_id: m.id, p_ok: ok, p_error: reason ?? undefined });
    if (done.error) console.error("[email] complete failed", m.id, done.error.code);
    if (ok) outcome.sent += 1;
    else if (reason === "no_address") outcome.skipped += 1;
    else outcome.failed += 1;
  }
  return json(200, outcome);
}
