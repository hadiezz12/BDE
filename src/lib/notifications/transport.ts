import "server-only";
import type { RenderedEmail } from "@/lib/events/email";

/**
 * How the e-mail worker hands a message over, chosen by EMAIL_TRANSPORT
 * (server only):
 *  - unset / "none": no transport. The worker sends nothing and leaves every
 *    message pending (students still read them in their space). This is the
 *    state until the BDE chooses a sender and its address.
 *  - "log": development only. Prints the subject and the message id (never
 *    the address, never the text) and counts it as delivered, to exercise
 *    the pipeline end to end. Refused in production.
 *  - "brevo": Brevo's transactional API (EU-hosted). Needs BREVO_API_KEY and
 *    EMAIL_FROM ("Very Pink Club <adresse@domaine>"), on a domain the BDE
 *    owns and has authenticated (SPF, DKIM, DMARC) with Brevo.
 * Each send returns ok, or a short error code the outbox stores (never the
 * provider's message, which may echo the address).
 */

export type SendResult = { ok: true } | { ok: false; error: string };

export interface EmailTransport {
  name: "log" | "brevo";
  send(to: { email: string; name: string | null }, email: RenderedEmail, id: number): Promise<SendResult>;
}

/** "Name <a@b.c>" → { name, email }; a bare address works too. */
function parseFrom(raw: string): { name: string; email: string } | null {
  const m = raw.trim().match(/^(?:"?([^"<]*)"?\s*)?<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>$|^([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)$/);
  if (!m) return null;
  return m[3] ? { name: "Very Pink Club", email: m[3] } : { name: (m[1] ?? "").trim() || "Very Pink Club", email: m[2] };
}

export function getEmailTransport(): EmailTransport | null {
  const kind = (process.env.EMAIL_TRANSPORT ?? "").trim().toLowerCase();
  if (kind === "log") {
    if (process.env.NODE_ENV === "production") return null;
    return {
      name: "log",
      async send(_to, email, id) {
        console.info(`[email:log] #${id} « ${email.subject} » (${email.text.length} caractères)`);
        return { ok: true };
      },
    };
  }
  if (kind === "brevo") {
    const key = process.env.BREVO_API_KEY?.trim();
    const from = parseFrom(process.env.EMAIL_FROM ?? "");
    if (!key || !from) return null;
    return {
      name: "brevo",
      async send(to, email) {
        try {
          const res = await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: { "api-key": key, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              sender: from,
              to: [{ email: to.email, ...(to.name ? { name: to.name } : {}) }],
              subject: email.subject,
              htmlContent: email.html,
              textContent: email.text,
            }),
            signal: AbortSignal.timeout(10_000),
          });
          if (res.ok) return { ok: true };
          return { ok: false, error: res.status === 401 || res.status === 403 ? "transport_auth" : res.status >= 500 ? "transport_down" : "transport_refused" };
        } catch {
          return { ok: false, error: "transport_unreachable" };
        }
      },
    };
  }
  return null;
}
