/**
 * The e-mail worker's loop, independent of how it reaches the database (the
 * Edge Function passes a Postgres connection; the unit tests a fake).
 *
 * One run: read the mode; "off" does nothing. Otherwise claim a small batch
 * (private.claim_notification_deliveries re-checks each message: address,
 * suppression, preference, obsolete reminder, quiet hours, earlier attempt
 * acknowledged by the provider), render each one, hand it to the transport,
 * report each outcome (private.complete_notification_delivery decides
 * retries, backoff and dead letters), and claim again while time remains.
 * Every run is recorded with its counts, never a recipient or a message.
 */

import { renderNotificationEmail } from "./email.ts";
import type { Payload } from "./catalog.ts";
import { brevoTransport, captureTransport, parseAddress, type SendOutcome, type Transport } from "./transport.ts";
import type { RenderedEmail } from "./email.ts";

export type DeliveryMode = "off" | "capture" | "live";

export interface WorkerConfig {
  mode: DeliveryMode;
  email_from: string | null;
  reply_to: string | null;
  site_url: string | null;
}

/** One e-mail as private.claim_notification_deliveries returns it. */
export interface ClaimedDelivery {
  id: number;
  key: string;
  kind: string;
  topic: string;
  essential: boolean;
  confidential: boolean;
  importance: string | null;
  payload: Payload;
  event_id: string | null;
  application_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  organization: { slug: string; name: string | null; short_name: string | null } | null;
  email: string;
  name: string | null;
  attempt: number;
  unsubscribe: string | null;
}

export interface WorkerDb {
  config(): Promise<WorkerConfig | null>;
  startRun(mode: DeliveryMode): Promise<number>;
  finishRun(id: number, report: RunReport): Promise<void>;
  claim(limit: number): Promise<ClaimedDelivery[]>;
  complete(id: number, provider: Transport["name"], result: SendOutcome): Promise<string>;
  capture(id: number, email: RenderedEmail): Promise<void>;
}

export interface RunReport {
  mode: DeliveryMode;
  claimed: number;
  accepted: number;
  failed: number;
  skipped: number;
  error: string | null;
}

export interface RunOptions {
  /** BREVO_API_KEY (live mode only). */
  brevoKey?: string | null;
  /** A transport to use instead of the one the mode selects (tests). */
  transport?: Transport;
  /** Stop claiming after this many milliseconds (each batch then has at most its send timeout to finish). */
  budgetMs?: number;
  batchSize?: number;
  now?: () => number;
}

const SITE = /^https:\/\/[a-z0-9.-]+(:\d+)?\/?$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/;

/** The site's address for links: https (or a local address for development), nothing else. */
export function siteFrom(value: string | null): URL | null {
  const v = (value ?? "").trim();
  return SITE.test(v) ? new URL(v) : null;
}

export async function runWorker(db: WorkerDb, options: RunOptions = {}): Promise<RunReport> {
  const now = options.now ?? Date.now;
  const started = now();
  const budget = options.budgetMs ?? 15_000;
  const batchSize = options.batchSize ?? 10;

  const config = await db.config();
  const mode: DeliveryMode = config?.mode === "capture" || config?.mode === "live" ? config.mode : "off";
  const report: RunReport = { mode, claimed: 0, accepted: 0, failed: 0, skipped: 0, error: null };
  if (mode === "off" || !config) return report;

  const runId = await db.startRun(mode);
  try {
    const from = parseAddress(config.email_from, "Very Pink Club");
    const replyTo = parseAddress(config.reply_to);
    const site = siteFrom(config.site_url);
    let transport: Transport | null = options.transport ?? null;
    if (!transport && mode === "capture") transport = captureTransport((id, email) => db.capture(id, email));
    if (!transport && mode === "live") {
      // Live e-mails need a sender on the BDE's domain, the site's address for
      // every link, and the provider's key; until then nothing is claimed and
      // the queue waits (the monitoring page says why).
      if (!from || !site) report.error = "config_incomplete";
      else if (!options.brevoKey) report.error = "transport_not_configured";
      else transport = brevoTransport({ apiKey: options.brevoKey });
    }
    if (!transport) return report;
    const sender = from ?? { email: "capture@example.test", name: "Very Pink Club" };

    while (now() - started < budget) {
      const batch = await db.claim(batchSize);
      if (batch.length === 0) break;
      report.claimed += batch.length;
      const results = await Promise.all(batch.map((d) => deliver(d, transport!, sender, replyTo, site)));
      for (const [i, result] of results.entries()) {
        let status: string;
        try {
          status = await db.complete(batch[i].id, transport.name, result);
        } catch {
          // Its lease expires and the database treats the outcome as unknown.
          report.error = "complete_failed";
          continue;
        }
        if (status === "provider_accepted" || status === "delivered") report.accepted += 1;
        else if (status === "failed_permanent" || status === "failed_retryable") report.failed += 1;
        else report.skipped += 1;
      }
      if (batch.length < batchSize) break;
    }
    return report;
  } catch {
    report.error = report.error ?? "worker_failed";
    return report;
  } finally {
    await db.finishRun(runId, report).catch(() => undefined);
  }
}

async function deliver(
  d: ClaimedDelivery,
  transport: Transport,
  from: { email: string; name: string | null },
  replyTo: { email: string; name: string | null } | null,
  site: URL | null,
): Promise<SendOutcome> {
  let rendered: RenderedEmail;
  try {
    rendered = renderNotificationEmail({
      kind: d.kind,
      payload: d.payload ?? {},
      name: d.name,
      site,
      essential: d.essential,
      confidential: d.confidential,
      importance: d.importance,
      event_id: d.event_id,
      application_id: d.application_id,
      resource_type: d.resource_type,
      resource_id: d.resource_id,
      organization: d.organization,
      unsubscribe: d.unsubscribe,
    });
  } catch {
    return { outcome: "failed_permanent", error: "render_failed" };
  }
  try {
    return await transport.send({ id: d.id, key: d.key, to: { email: d.email, name: d.name }, from, replyTo, rendered });
  } catch {
    return transport.name === "capture"
      ? { outcome: "failed_retryable", error: "capture_failed" }
      : { outcome: "outcome_unknown", error: "transport_error" };
  }
}
