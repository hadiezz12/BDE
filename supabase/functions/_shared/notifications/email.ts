/**
 * Site messages as e-mails: subject, plain text and a small HTML version in
 * the site's colours. Same words as the in-app message (events/messages.ts,
 * recruitment/messages.ts); no image, no tracking pixel, no link other than
 * the site's own pages. Never the private joining details of an event nor
 * an application's answers (the outbox payload holds neither): the student
 * reads those on the site, signed in. Pure module.
 */

import { eventMessage, type EventMessageKind, type EventMessagePayload } from "./messages.ts";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only a slug the site could have written ends up in a link. */
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * The shared layout: greeting, title, body, up to two links (already
 * resolved against the site's address; the first is the main one) and a
 * footer saying why the person gets this message.
 */
export function renderMessageEmail({
  title,
  body,
  links,
  name,
  footer,
}: {
  title: string;
  body: string;
  links: { href: string; label: string; text: string }[];
  name: string | null;
  footer: string;
}): RenderedEmail {
  const hello = name ? `Bonjour ${name.split(" ")[0]},` : "Bonjour,";
  const text = [hello, "", title, "", body, "", ...links.map((l) => `${l.text} : ${l.href}`), "", "—", footer].join("\n");

  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border:2px solid #16101a;border-radius:4px;` +
    `background:${primary ? "#16101a" : "#ffffff"};color:${primary ? "#ffffff" : "#16101a"};font-weight:700;text-decoration:none">${escapeHtml(label)}</a>`;

  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f6efe6;font-family:Arial,Helvetica,sans-serif;color:#16101a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6efe6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:2px solid #16101a">
<tr><td style="background:#16101a;padding:14px 20px;color:#ff4fa3;font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:13px">Very Pink Club</td></tr>
<tr><td style="padding:24px 20px">
<p style="margin:0 0 16px;font-size:15px">${escapeHtml(hello)}</p>
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">${escapeHtml(title)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">${escapeHtml(body)}</p>
${links.map((l, i) => button(l.href, l.label, i === 0)).join("")}
</td></tr>
<tr><td style="padding:14px 20px;border-top:1px solid #e5d9cc;font-size:12px;line-height:1.5;color:#5c5360">${escapeHtml(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject: title, text, html };
}

export function renderEventEmail({
  kind,
  payload,
  name,
  site,
}: {
  kind: EventMessageKind;
  payload: EventMessagePayload;
  /** The recipient's name as the site shows it, or null. */
  name: string | null;
  /** The site's public address (SITE_URL), or null: then no link at all. */
  site: URL | null;
}): RenderedEmail {
  const message = eventMessage(kind, payload);
  const link = (path: string) => (site ? new URL(path, site).toString() : null);
  const eventUrl = payload.slug && SLUG.test(payload.slug) && kind !== "event_registration_removed" ? link(`/events/${payload.slug}`) : null;
  const mine = link("/account/events");
  return renderMessageEmail({
    title: message.title,
    body: message.body,
    name,
    links: [
      ...(eventUrl ? [{ href: eventUrl, label: "Voir l'événement", text: "L'événement" }] : []),
      ...(mine ? [{ href: mine, label: "Mes événements", text: "Mes événements" }] : []),
    ],
    footer:
      "Tu reçois ce message parce que tu as une inscription à un événement sur le site du Very Pink Club, le BDE. " +
      "Tes messages sont aussi dans ton espace, rubrique Notifications.",
  });
}
