/**
 * How the worker hands an e-mail over, and what it learns back.
 *
 *  - "brevo": Brevo's transactional API (EU-hosted). The key stays in the
 *    Edge Function's secrets (BREVO_API_KEY), never in the database or the
 *    site. Brevo has no idempotency key: each message carries ours in the
 *    X-Mailin-custom header instead, which Brevo echoes in every webhook
 *    event, so an attempt whose outcome was lost (a timeout after sending) is
 *    recognised from its events before anything is sent again.
 *  - "capture": test mode. Nothing leaves the platform; the rendered message
 *    is stored for the operator to read (notification_email_captures).
 *
 * Each send returns one of the outcomes the database records
 * (private.complete_notification_delivery) with a short error code, never
 * the provider's own message (it may echo the address). Pure module: fetch
 * is injected, so the unit tests run without a network.
 */

import type { RenderedEmail } from "./email.ts";

export type SendOutcome =
  | { outcome: "provider_accepted"; messageId: string | null }
  | { outcome: "failed_retryable"; error: string; retryAfter?: number | null }
  | { outcome: "failed_permanent"; error: string }
  | { outcome: "outcome_unknown"; error: string };

export interface Address {
  email: string;
  name: string | null;
}

export interface OutgoingEmail {
  /** The delivery's id (the capture's key). */
  id: number;
  /** The delivery's idempotency key (a uuid), echoed by the provider's events. */
  key: string;
  to: Address;
  from: Address;
  replyTo: Address | null;
  rendered: RenderedEmail;
}

export interface Transport {
  name: "brevo" | "capture";
  send(mail: OutgoingEmail): Promise<SendOutcome>;
}

const ADDRESS = /^[^<>\s@",;]+@[^<>\s@",;]+\.[^<>\s@",;]+$/;

/** "Name <a@b.c>" or "a@b.c" → an address (the sender and reply-to set by the operator). */
export function parseAddress(raw: string | null | undefined, fallbackName: string | null = null): Address | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const m = value.match(/^(?:"?([^"<]*)"?\s*)?<([^<>]+)>$/);
  const email = (m ? m[2] : value).trim();
  if (!ADDRESS.test(email)) return null;
  const name = (m?.[1] ?? "").trim() || fallbackName;
  return { email, name };
}

/** Seconds to wait from a Retry-After header (seconds or an HTTP date), capped at 6 hours. */
export function retryAfterSeconds(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const s = header.trim();
  const seconds = /^\d+$/.test(s) ? Number(s) : Math.ceil((Date.parse(s) - now) / 1000);
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds, 6 * 3600) : null;
}

/**
 * Brevo's answer → an outcome. 2xx: accepted. 400: refused for good (an
 * invalid recipient address is suppressed by the database). 401/403: our key
 * or sender is wrong, retried while the operator fixes it. 402: no credit
 * left, retried. 429: rate limited, retried after Retry-After. 5xx: Brevo is
 * down, retried.
 */
export function classifyBrevoResponse(status: number, body: unknown, retryAfter: string | null): SendOutcome {
  if (status >= 200 && status < 300) {
    const id = (body as { messageId?: unknown } | null)?.messageId;
    return { outcome: "provider_accepted", messageId: typeof id === "string" ? id.slice(0, 300) : null };
  }
  if (status === 400) {
    const message = String((body as { message?: unknown } | null)?.message ?? "").toLowerCase();
    // Brevo says which field is wrong ("email is not valid in to"); only the
    // recipient's address makes the address itself undeliverable.
    return { outcome: "failed_permanent", error: /\bto\b|recipient/.test(message) && /email|address/.test(message) ? "invalid_address" : "refused" };
  }
  if (status === 401 || status === 403) return { outcome: "failed_retryable", error: "transport_auth" };
  if (status === 402) return { outcome: "failed_retryable", error: "transport_quota" };
  if (status === 429) return { outcome: "failed_retryable", error: "rate_limited", retryAfter: retryAfterSeconds(retryAfter) };
  if (status >= 500) return { outcome: "failed_retryable", error: "transport_down" };
  return { outcome: "failed_permanent", error: "refused" };
}

export interface BrevoOptions {
  apiKey: string;
  fetch?: typeof fetch;
  /** Milliseconds before the call is abandoned (its outcome is then unknown). */
  timeoutMs?: number;
  endpoint?: string;
}

export function brevoTransport(options: BrevoOptions): Transport {
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const endpoint = options.endpoint ?? "https://api.brevo.com/v3/smtp/email";
  return {
    name: "brevo",
    async send(mail) {
      const person = (a: Address) => ({ email: a.email, ...(a.name ? { name: a.name } : {}) });
      let response: Response;
      try {
        response = await doFetch(endpoint, {
          method: "POST",
          headers: { "api-key": options.apiKey, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            sender: person(mail.from),
            to: [person(mail.to)],
            ...(mail.replyTo ? { replyTo: person(mail.replyTo) } : {}),
            subject: mail.rendered.subject,
            htmlContent: mail.rendered.html,
            textContent: mail.rendered.text,
            headers: { ...mail.rendered.headers, "X-Mailin-custom": mail.key },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        // Abandoned after sending: Brevo may have accepted it. The database
        // waits for its events before trying again. Anything else (DNS,
        // refused connection) happened before Brevo had the message.
        const name = (error as { name?: string } | null)?.name;
        return name === "TimeoutError" || name === "AbortError"
          ? { outcome: "outcome_unknown", error: "timeout" }
          : { outcome: "failed_retryable", error: "transport_unreachable" };
      }
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      return classifyBrevoResponse(response.status, body, response.headers.get("retry-after"));
    },
  };
}

/** Test mode: the message is stored, never sent. */
export function captureTransport(store: (id: number, email: RenderedEmail) => Promise<void>): Transport {
  return {
    name: "capture",
    async send(mail) {
      await store(mail.id, mail.rendered);
      return { outcome: "provider_accepted", messageId: null };
    },
  };
}
