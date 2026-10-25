/**
 * The words of each application message, from the outbox row the database
 * wrote (notification_outbox: kind + payload frozen when it happened). One
 * source for the in-app list and the e-mail worker. Public facts only: the
 * payload never holds an answer or a file, and nothing here adds any.
 * "Envoyée" never means read or accepted. Pure module (Intl only).
 */

import { renderMessageEmail, SLUG, type RenderedEmail } from "../events/email.ts";
import { messageWhen } from "../events/messages.ts";

export type ApplicationMessageKind =
  | "application_submitted"
  | "application_withdrawn"
  | "application_deadline_reminder"
  | "application_form_updated"
  | "recruitment_cancelled";

export const APPLICATION_MESSAGE_KINDS: readonly string[] = [
  "application_submitted",
  "application_withdrawn",
  "application_deadline_reminder",
  "application_form_updated",
  "recruitment_cancelled",
];

export const isApplicationMessage = (kind: string): kind is ApplicationMessageKind => APPLICATION_MESSAGE_KINDS.includes(kind);

export interface ApplicationMessagePayload {
  title?: string;
  slug?: string | null;
  position?: string;
  position_slug?: string;
  organization?: string;
  reference?: string | null;
  closes_at?: string | null;
  reason?: string;
  /** recruitment_cancelled: what the application was (draft or submitted). */
  was?: string;
}

export function applicationMessage(kind: ApplicationMessageKind, p: ApplicationMessagePayload): { title: string; body: string } {
  const what = [p.position, p.organization].filter(Boolean).join(" · ") || "ta candidature";
  const campaign = p.title ? `« ${p.title} »` : "ce recrutement";
  switch (kind) {
    case "application_submitted":
      return {
        title: `Candidature envoyée : ${what}`,
        body:
          `Ta candidature au recrutement ${campaign} est bien enregistrée${p.reference ? ` (référence ${p.reference})` : ""}. ` +
          "Envoyée ne veut pas dire acceptée. Tu peux la relire, ou la retirer, depuis ton espace.",
      };
    case "application_withdrawn":
      return {
        title: `Candidature retirée : ${what}`,
        body: `Tu as retiré ta candidature au recrutement ${campaign}. Elle reste lisible dans ton espace.`,
      };
    case "application_deadline_reminder":
      return {
        title: `Ton brouillon n'est pas envoyé : ${what}`,
        body:
          `Les candidatures ferment ${p.closes_at ? messageWhen(p.closes_at) : "bientôt"}. ` +
          "Ton brouillon est enregistré, mais l'association ne reçoit que les candidatures envoyées.",
      };
    case "application_form_updated":
      return {
        title: `Le formulaire a changé : ${what}`,
        body:
          `L'association a publié une nouvelle version du formulaire de ${campaign}. ` +
          "Ouvre ton brouillon pour passer à la nouvelle version : tes réponses qui comptent encore sont gardées.",
      };
    case "recruitment_cancelled":
      return {
        title: `Recrutement annulé : ${p.organization ?? campaign}`,
        body:
          `L'association a annulé le recrutement ${campaign}.` +
          (p.reason ? ` Raison donnée : ${p.reason}` : "") +
          (p.was === "submitted" ? " Ta candidature reste lisible dans ton espace." : ""),
      };
  }
}

/** The application page is the student's own; the campaign page only while it can be linked. */
export function renderApplicationEmail({
  kind,
  payload,
  applicationId,
  name,
  site,
}: {
  kind: ApplicationMessageKind;
  payload: ApplicationMessagePayload;
  applicationId: string | null;
  name: string | null;
  site: URL | null;
}): RenderedEmail {
  const message = applicationMessage(kind, payload);
  const link = (path: string) => (site ? new URL(path, site).toString() : null);
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const mine = applicationId && UUID.test(applicationId) ? link(`/account/applications/${applicationId}`) : link("/account/applications");
  const campaign = payload.slug && SLUG.test(payload.slug) && kind !== "recruitment_cancelled" ? link(`/recruitment/${payload.slug}`) : null;
  return renderMessageEmail({
    title: message.title,
    body: message.body,
    name,
    links: [
      ...(mine ? [{ href: mine, label: kind === "application_deadline_reminder" ? "Reprendre mon brouillon" : "Ma candidature", text: "Ta candidature" }] : []),
      ...(campaign ? [{ href: campaign, label: "Le recrutement", text: "Le recrutement" }] : []),
    ],
    footer:
      "Tu reçois ce message parce que tu as une candidature sur le site du Very Pink Club, le BDE. " +
      "Tes messages sont aussi dans ton espace, rubrique Notifications.",
  });
}
