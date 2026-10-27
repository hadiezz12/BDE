/**
 * Every notification as an e-mail: a subject, a plain-text version and an
 * HTML version in the site's identity (night ink band, pink wordmark, cream
 * paper), readable on a phone. Same words as the notification centre
 * (catalog.ts). No image, no tracking pixel, no link other than the site's
 * own pages. Pure module: the site previews it, the worker sends it.
 *
 * Confidential kinds (recruitment) keep their subject neutral and their
 * e-mail short: the details are read on the site, signed in. An optional or
 * operational message carries the one-click unsubscribe headers (RFC 8058)
 * and a link to the person's settings; an essential one cannot be turned off
 * and says so.
 */

import { CATEGORY_LABEL, notificationAction, notificationPath, notificationReason, notificationText, type Payload } from "./catalog.ts";
import { APPLICATION_MESSAGE_KINDS, isTeamMessage } from "./recruitment.ts";

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
  headers: Record<string, string>;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface EmailInput {
  kind: string;
  payload: Payload;
  /** The recipient's name as the site shows it, or null. */
  name: string | null;
  /** The site's public address (configured by the operator), or null: then no link at all. */
  site: URL | null;
  essential: boolean;
  confidential: boolean;
  importance?: string | null;
  event_id?: string | null;
  application_id?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  organization?: { slug: string; name?: string | null; short_name?: string | null } | null;
  /** A fresh one-click unsubscribe token (optional and operational messages). */
  unsubscribe?: string | null;
}

/** An answer to an application: the e-mail never says which one (read on the site, signed in). */
const OUTCOME_KINDS: readonly string[] = [
  "recruitment_offer",
  "recruitment_offer_reminder",
  "recruitment_rejected",
  "recruitment_waitlisted",
  "recruitment_offer_withdrawn",
  "recruitment_offer_expired",
];

/** The short, neutral version of a confidential message (subject, first line). */
function confidentialText(kind: string, payload: Payload): { subject: string; line: string } {
  const org = payload.organization ?? "une asso";
  if (isTeamMessage(kind)) {
    return {
      subject: "Recrutement : du nouveau dans ton espace de gestion",
      line: `Il y a du nouveau dans un recrutement de ${org} sur lequel tu travailles.`,
    };
  }
  return {
    subject: "Du nouveau sur ta candidature",
    line: OUTCOME_KINDS.includes(kind)
      ? `${cap(org)} a répondu à ta candidature.`
      : `Il y a du nouveau sur ta candidature à ${org}.`,
  };
}

export function renderNotificationEmail(input: EmailInput): RenderedEmail {
  const { kind, payload, name, site } = input;
  const message = notificationText(kind, payload);
  const link = (path: string) => (site ? new URL(path, site).toString() : null);
  const main = link(
    notificationPath({
      kind,
      payload,
      event_id: input.event_id,
      application_id: input.application_id,
      resource_type: input.resource_type,
      resource_id: input.resource_id,
      organization: input.organization ?? null,
    }),
  );
  const settings = link("/account/notifications/reglages");
  const token = !input.essential && input.unsubscribe && /^[0-9a-f]{64}$/.test(input.unsubscribe) ? input.unsubscribe : null;
  // The link a person clicks opens a page that asks first; the header is for
  // the mail client's one-click POST (RFC 8058), answered without a page.
  const unsubscribe = token ? link(`/notifications/desabonnement?t=${token}`) : null;
  const oneClick = token ? link(`/api/notifications/unsubscribe?t=${token}`) : null;

  let subject = message.title;
  let lines = [message.title, "", message.body];
  if (input.confidential) {
    const c = confidentialText(kind, payload);
    subject = c.subject;
    // The kind of step ("Invitation à un entretien") but never an outcome, a position or a reference.
    const step = OUTCOME_KINDS.includes(kind) || isTeamMessage(kind) ? "" : `${message.title.split(" : ")[0]}. `;
    lines = [c.line, "", `${step}Le détail est sur le site, dans ton espace.`];
  }
  // Never on a confidential message: an offer is "important", a refusal is not.
  const important = !input.confidential && (input.importance === "important" || input.importance === "critical");
  const hello = name ? `Bonjour ${name.split(" ")[0]},` : "Bonjour,";
  const why = `Tu reçois ce message parce que ${notificationReason(kind)} sur le site du Very Pink Club, le BDE.`;
  const control = input.essential
    ? "Ce message fait partie de ceux qu'on ne peut pas désactiver : il concerne une démarche en cours ou la sécurité de ton compte."
    : "Tu peux choisir ce que tu reçois par e-mail dans ton espace, rubrique Notifications.";
  const category = (APPLICATION_MESSAGE_KINDS as readonly string[]).includes(kind)
    ? CATEGORY_LABEL.recruitment
    : kind.startsWith("event_") ? CATEGORY_LABEL.events
    : kind.startsWith("governance_") ? CATEGORY_LABEL.governance
    : kind.startsWith("content_") ? CATEGORY_LABEL.content
    : kind.startsWith("account_") ? CATEGORY_LABEL.account
    : CATEGORY_LABEL.campus;

  const text = [
    hello,
    "",
    ...lines,
    "",
    ...(main ? [`${notificationAction(kind)} : ${main}`] : []),
    "",
    "—",
    why,
    control,
    ...(settings ? [`Tes réglages : ${settings}`] : []),
    ...(unsubscribe ? [`Ne plus recevoir ces e-mails : ${unsubscribe}`] : []),
  ].join("\n");

  const paragraph = (s: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55">${escapeHtml(s)}</p>`;
  const body = input.confidential
    ? paragraph(lines[0]) + paragraph(lines[2])
    : `<h1 style="margin:0 0 12px;font-size:22px;line-height:1.25">${escapeHtml(message.title)}</h1>` +
      message.body.split(/\n{2,}/).map(paragraph).join("");
  const button = main
    ? `<a href="${escapeHtml(main)}" style="display:inline-block;margin:6px 0 4px;padding:13px 20px;border:2px solid #16101a;border-radius:4px;` +
      `background:#16101a;color:#ffffff;font-weight:700;text-decoration:none">${escapeHtml(notificationAction(kind))}</a>`
    : "";
  const footerLinks = [
    settings ? `<a href="${escapeHtml(settings)}" style="color:#5c5360">Tes réglages de notifications</a>` : "",
    unsubscribe ? `<a href="${escapeHtml(unsubscribe)}" style="color:#5c5360">Ne plus recevoir ces e-mails</a>` : "",
  ].filter(Boolean).join(" · ");

  const html = `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f6efe6;font-family:Arial,Helvetica,sans-serif;color:#16101a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6efe6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:2px solid #16101a">
<tr><td style="background:#16101a;padding:14px 20px">
<span style="color:#ff4fa3;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:14px">Very Pink Club</span>
<span style="color:#cfc4d4;font-size:12px;letter-spacing:.06em;text-transform:uppercase"> · ${escapeHtml(category)}${important ? " · Important" : ""}</span>
</td></tr>
<tr><td style="padding:24px 20px 18px">
<p style="margin:0 0 16px;font-size:15px">${escapeHtml(hello)}</p>
${body}
${button}
</td></tr>
<tr><td style="padding:14px 20px 16px;border-top:1px solid #e5d9cc;font-size:12px;line-height:1.55;color:#5c5360">
${escapeHtml(why)}<br>${escapeHtml(control)}${footerLinks ? `<br>${footerLinks}` : ""}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const headers: Record<string, string> = {};
  if (oneClick) {
    headers["List-Unsubscribe"] = `<${oneClick}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  return { subject, text, html, headers };
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
