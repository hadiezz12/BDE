/**
 * An event message as an e-mail: subject, plain text and a small HTML
 * version in the site's colours. Same words as the in-app message
 * (messages.ts); no image, no tracking pixel, no link other than the event's
 * page and "Mes événements" on the site's own address. Never the private
 * joining details (the outbox payload does not hold them): the student reads
 * those on the site, signed in. Pure module.
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
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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
  const hello = name ? `Bonjour ${name.split(" ")[0]},` : "Bonjour,";
  const footer =
    "Tu reçois ce message parce que tu as une inscription à un événement sur le site du Very Pink Club, le BDE. " +
    "Tes messages sont aussi dans ton espace, rubrique Notifications.";

  const text = [
    hello,
    "",
    message.title,
    "",
    message.body,
    "",
    ...(eventUrl ? [`L'événement : ${eventUrl}`] : []),
    ...(mine ? [`Mes événements : ${mine}`] : []),
    "",
    "—",
    footer,
  ].join("\n");

  const button = (href: string, label: string, primary: boolean) =>
    `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;border:2px solid #16101a;border-radius:4px;` +
    `background:${primary ? "#16101a" : "#ffffff"};color:${primary ? "#ffffff" : "#16101a"};font-weight:700;text-decoration:none">${escapeHtml(label)}</a>`;

  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(message.title)}</title></head>
<body style="margin:0;padding:0;background:#f6efe6;font-family:Arial,Helvetica,sans-serif;color:#16101a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6efe6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:2px solid #16101a">
<tr><td style="background:#16101a;padding:14px 20px;color:#ff4fa3;font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:13px">Very Pink Club</td></tr>
<tr><td style="padding:24px 20px">
<p style="margin:0 0 16px;font-size:15px">${escapeHtml(hello)}</p>
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">${escapeHtml(message.title)}</h1>
<p style="margin:0 0 20px;font-size:15px;line-height:1.5">${escapeHtml(message.body)}</p>
${[eventUrl ? button(eventUrl, "Voir l'événement", true) : "", mine ? button(mine, "Mes événements", !eventUrl) : ""].join("")}
</td></tr>
<tr><td style="padding:14px 20px;border-top:1px solid #e5d9cc;font-size:12px;line-height:1.5;color:#5c5360">${escapeHtml(footer)}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject: message.title, text, html };
}
