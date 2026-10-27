/**
 * The words of each application message, from the outbox row the database
 * wrote (notification_outbox: kind + payload frozen when it happened). One
 * source for the in-app list and the e-mail worker. Public facts only: the
 * payload never holds an answer, a file, a score, a note or another
 * candidate, and nothing here adds any. "Envoyée" never means read or
 * accepted. Pure module (Intl only).
 *
 * Two audiences since Phase 9: the candidate (their own application: an
 * interview, a question, an offer, an outcome) and the team (a review to do,
 * a mention, an answer received). A team message names the application by
 * its reference only and links to the workspace, where access is checked
 * again.
 */

import { renderMessageEmail, SLUG, type RenderedEmail } from "../events/email.ts";
import { messageWhen } from "../events/messages.ts";

export type CandidateMessageKind =
  | "application_submitted"
  | "application_withdrawn"
  | "application_deadline_reminder"
  | "application_form_updated"
  | "recruitment_cancelled"
  | "recruitment_interview_invited"
  | "recruitment_interview_scheduled"
  | "recruitment_interview_rescheduled"
  | "recruitment_interview_cancelled"
  | "recruitment_clarification_requested"
  | "recruitment_clarification_extended"
  | "recruitment_clarification_reminder"
  | "recruitment_offer"
  | "recruitment_offer_reminder"
  | "recruitment_offer_expired"
  | "recruitment_offer_withdrawn"
  | "recruitment_rejected"
  | "recruitment_waitlisted";

export type TeamMessageKind =
  | "recruitment_review_assigned"
  | "recruitment_mention"
  | "recruitment_clarification_answered"
  | "recruitment_interview_booked"
  | "recruitment_decision_to_approve"
  | "recruitment_offer_accepted"
  | "recruitment_offer_declined"
  | "recruitment_candidate_withdrew";

export type ApplicationMessageKind = CandidateMessageKind | TeamMessageKind;

const CANDIDATE_KINDS: readonly string[] = [
  "application_submitted",
  "application_withdrawn",
  "application_deadline_reminder",
  "application_form_updated",
  "recruitment_cancelled",
  "recruitment_interview_invited",
  "recruitment_interview_scheduled",
  "recruitment_interview_rescheduled",
  "recruitment_interview_cancelled",
  "recruitment_clarification_requested",
  "recruitment_clarification_extended",
  "recruitment_clarification_reminder",
  "recruitment_offer",
  "recruitment_offer_reminder",
  "recruitment_offer_expired",
  "recruitment_offer_withdrawn",
  "recruitment_rejected",
  "recruitment_waitlisted",
];

const TEAM_KINDS: readonly string[] = [
  "recruitment_review_assigned",
  "recruitment_mention",
  "recruitment_clarification_answered",
  "recruitment_interview_booked",
  "recruitment_decision_to_approve",
  "recruitment_offer_accepted",
  "recruitment_offer_declined",
  "recruitment_candidate_withdrew",
];

export const APPLICATION_MESSAGE_KINDS: readonly string[] = [...CANDIDATE_KINDS, ...TEAM_KINDS];

export const isApplicationMessage = (kind: string): kind is ApplicationMessageKind => APPLICATION_MESSAGE_KINDS.includes(kind);
export const isTeamMessage = (kind: string): kind is TeamMessageKind => TEAM_KINDS.includes(kind);

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
  /** The association's own words (a campaign template or a message written for this person). */
  message?: string | null;
  respond_by?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  previous_starts_at?: string | null;
  mode?: "in_person" | "online" | "phone";
  location?: string | null;
  choose_again?: boolean;
  details_changed?: boolean;
  due_at?: string | null;
  expires_at?: string | null;
  /** Team messages: where to look in the workspace. */
  link?: string;
  by_name?: string;
  committee?: boolean;
  expired?: boolean;
}

/** A workspace path a team message may link to (anything else is dropped). */
const TEAM_LINK = /^\/manage\/(evaluations|[a-z0-9]+(-[a-z0-9]+)*\/recruitment\/[0-9a-f-]{36}\/candidatures\/[0-9a-f-]{36})$/;

export function teamLink(p: ApplicationMessagePayload): string | null {
  return p.link && TEAM_LINK.test(p.link) ? p.link : null;
}

const MODE_WORDS = { in_person: "sur place", online: "en visio", phone: "par téléphone" } as const;

function theirWords(message: string | null | undefined): string {
  const m = (message ?? "").trim();
  return m ? ` Le mot de l'association : « ${m} »` : "";
}

export function applicationMessage(kind: ApplicationMessageKind, p: ApplicationMessagePayload): { title: string; body: string } {
  const what = [p.position, p.organization].filter(Boolean).join(" · ") || "ta candidature";
  const campaign = p.title ? `« ${p.title} »` : "ce recrutement";
  const ref = p.reference ? `la candidature ${p.reference}` : "une candidature";
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
    case "recruitment_interview_invited":
      return {
        title: `Invitation à un entretien : ${what}`,
        body:
          `L'association t'invite à un entretien pour ta candidature au recrutement ${campaign}. ` +
          `Choisis un créneau depuis ton espace${p.respond_by ? `, si possible avant le ${messageWhen(p.respond_by)}` : ""}.` +
          theirWords(p.message),
      };
    case "recruitment_interview_scheduled":
      return {
        title: `Entretien confirmé : ${what}`,
        body:
          `Ton entretien est réservé${p.starts_at ? ` le ${messageWhen(p.starts_at)}` : ""}` +
          `${p.mode ? `, ${MODE_WORDS[p.mode]}` : ""}${p.location ? ` (${p.location})` : ""}. ` +
          "Les détails (lieu ou lien, consignes) sont dans ton espace.",
      };
    case "recruitment_interview_rescheduled":
      if (p.choose_again) {
        return {
          title: `Ton créneau d'entretien est annulé : ${what}`,
          body:
            `L'association a dû annuler le créneau${p.previous_starts_at ? ` du ${messageWhen(p.previous_starts_at)}` : ""}. ` +
            "Choisis-en un autre depuis ton espace.",
        };
      }
      if (p.details_changed) {
        return {
          title: `Ton entretien a changé : ${what}`,
          body: "L'association a modifié le lieu, le lien ou les consignes de ton entretien. Relis-les dans ton espace.",
        };
      }
      return {
        title: `Ton entretien est déplacé : ${what}`,
        body:
          `Ton entretien a été déplacé${p.starts_at ? ` au ${messageWhen(p.starts_at)}` : ""}` +
          `${p.previous_starts_at ? ` (il était prévu le ${messageWhen(p.previous_starts_at)})` : ""}. Les détails sont dans ton espace.`,
      };
    case "recruitment_interview_cancelled":
      return {
        title: `Entretien annulé : ${what}`,
        body: "L'association a annulé ton entretien. Ta candidature reste en cours ; écris-lui si tu as une question.",
      };
    case "recruitment_clarification_requested":
      return {
        title: `Une question sur ta candidature : ${what}`,
        body:
          "L'association te pose une question complémentaire. Lis-la et réponds depuis ton espace" +
          `${p.due_at ? `, avant le ${messageWhen(p.due_at)}` : ""}.` +
          theirWords(p.message),
      };
    case "recruitment_clarification_extended":
      return {
        title: `Plus de temps pour répondre : ${what}`,
        body: `L'association a prolongé le délai de sa question${p.due_at ? ` jusqu'au ${messageWhen(p.due_at)}` : ""}.`,
      };
    case "recruitment_clarification_reminder":
      return {
        title: `Une question attend ta réponse : ${what}`,
        body: `La question de l'association attend toujours ta réponse${p.due_at ? `, jusqu'au ${messageWhen(p.due_at)}` : ""}.`,
      };
    case "recruitment_offer":
      return {
        title: `Une proposition pour toi : ${what}`,
        body:
          `L'association te propose le poste ${p.position ? `« ${p.position} »` : ""} à la suite de ta candidature. ` +
          `Accepte ou décline depuis ton espace${p.expires_at ? `, avant le ${messageWhen(p.expires_at)}` : ""}. ` +
          "Accepter ne te donne encore aucun rôle : l'association t'invitera ensuite dans son équipe." +
          theirWords(p.message),
      };
    case "recruitment_offer_reminder":
      return {
        title: `Ta réponse est attendue : ${what}`,
        body: `La proposition de l'association attend ta réponse${p.expires_at ? ` jusqu'au ${messageWhen(p.expires_at)}` : ""}.`,
      };
    case "recruitment_offer_expired":
      return {
        title: `Proposition expirée : ${what}`,
        body: "Le délai pour répondre à la proposition de l'association est passé. Écris-lui si besoin.",
      };
    case "recruitment_offer_withdrawn":
      return {
        title: `Proposition retirée : ${what}`,
        body: "L'association a retiré sa proposition. Écris-lui si tu as une question.",
      };
    case "recruitment_rejected":
      return {
        title: `Réponse à ta candidature : ${what}`,
        body: `L'association a terminé l'examen de ta candidature au recrutement ${campaign} et ne la retient pas.` + theirWords(p.message),
      };
    case "recruitment_waitlisted":
      return {
        title: `Liste d'attente : ${what}`,
        body:
          `L'association a placé ta candidature au recrutement ${campaign} sur sa liste d'attente : ` +
          "elle reviendra vers toi si une place se libère." +
          theirWords(p.message),
      };
    case "recruitment_review_assigned":
      return p.committee
        ? {
            title: `Tu es au comité : ${p.title ?? "un recrutement"}`,
            body: `${p.organization ?? "Une asso"} t'a nommé·e au comité du recrutement ${campaign}. Ton travail est dans « Mes évaluations ».`,
          }
        : {
            title: `Des candidatures à évaluer : ${p.title ?? "un recrutement"}`,
            body: `${p.organization ?? "Une asso"} t'a confié des candidatures du recrutement ${campaign}. Elles t'attendent dans « Mes évaluations ».`,
          };
    case "recruitment_mention":
      return {
        title: `${p.by_name ?? "Quelqu'un"} t'a mentionné·e : ${ref}`,
        body: `Dans la discussion interne de ${ref} (${what}), recrutement ${campaign}.`,
      };
    case "recruitment_clarification_answered":
      return {
        title: `Réponse reçue : ${ref}`,
        body: `La personne a répondu à ta question sur ${ref} (${what}).`,
      };
    case "recruitment_interview_booked":
      return {
        title: `Entretien réservé : ${ref}`,
        body: `Un entretien que tu fais passer est réservé${p.starts_at ? ` le ${messageWhen(p.starts_at)}` : ""} (${what}).`,
      };
    case "recruitment_decision_to_approve":
      return {
        title: `Une décision à valider : ${ref}`,
        body: `Une décision est proposée pour ${ref} (${what}). Elle attend ta validation (ou ton renvoi).`,
      };
    case "recruitment_offer_accepted":
      return {
        title: `Proposition acceptée : ${ref}`,
        body: `La personne a accepté la proposition (${what}). Tu peux l'inviter dans l'équipe depuis sa candidature.`,
      };
    case "recruitment_offer_declined":
      return p.expired
        ? { title: `Proposition expirée : ${ref}`, body: `La proposition (${what}) n'a pas eu de réponse dans le délai.` }
        : { title: `Proposition déclinée : ${ref}`, body: `La personne a décliné la proposition (${what}).` };
    case "recruitment_candidate_withdrew":
      return {
        title: `Candidature retirée : ${ref}`,
        body: `La personne a retiré sa candidature (${what}). Ses entretiens, questions et décisions en cours s'arrêtent.`,
      };
  }
}

/** The application page is the student's own; the campaign page only while it can be linked; team messages go to the workspace. */
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
  if (isTeamMessage(kind)) {
    const target = teamLink(payload);
    const href = target ? link(target) : null;
    return renderMessageEmail({
      title: message.title,
      body: message.body,
      name,
      links: href ? [{ href, label: target === "/manage/evaluations" ? "Mes évaluations" : "Ouvrir la candidature", text: "Dans l'espace de gestion" }] : [],
      footer:
        "Tu reçois ce message parce que tu participes à un recrutement sur le site du Very Pink Club, le BDE. " +
        "Rien de la candidature n'est dans ce message : elle se lit sur le site, selon tes droits.",
    });
  }
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const mine = applicationId && UUID.test(applicationId) ? link(`/account/applications/${applicationId}`) : link("/account/applications");
  const campaign =
    payload.slug && SLUG.test(payload.slug) && kind !== "recruitment_cancelled" && kind.startsWith("application_")
      ? link(`/recruitment/${payload.slug}`)
      : null;
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
