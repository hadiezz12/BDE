/**
 * The notification catalog as the site and the worker read it: the words of
 * any kind (one dispatcher over the event, application and platform words),
 * where a notification leads, and the labels of its categories. The database
 * holds the authoritative catalog (notification_types / notification_topics:
 * topic, importance, essential or optional); the unit tests check that every
 * kind it lists has words here. Pure module.
 *
 * A destination is a path built from validated ids and slugs only — never a
 * URL taken from a payload — and opening it proves nothing: every page checks
 * the person's access again.
 */

import { eventMessage, type EventMessageKind, type EventMessagePayload } from "./events.ts";
import {
  APPLICATION_MESSAGE_KINDS,
  applicationMessage,
  isTeamMessage,
  teamLink,
  type ApplicationMessageKind,
  type ApplicationMessagePayload,
} from "./recruitment.ts";
import { PLATFORM_KINDS, isPlatformMessage, platformMessage, type PlatformMessagePayload } from "./platform.ts";

export type NotificationCategory = "account" | "governance" | "content" | "events" | "recruitment" | "campus";

export const CATEGORIES: readonly NotificationCategory[] = ["recruitment", "events", "governance", "content", "campus", "account"];

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  account: "Compte",
  governance: "Équipes",
  content: "Articles",
  events: "Événements",
  recruitment: "Recrutement",
  campus: "Campus",
};

export const EVENT_KINDS: readonly EventMessageKind[] = [
  "event_registration_confirmed",
  "event_waitlisted",
  "event_promoted",
  "event_registration_cancelled",
  "event_registration_removed",
  "event_changed",
  "event_cancelled",
  "event_reminder",
];

/** Every kind the site has words for (must equal the database catalog). */
export const ALL_KINDS: readonly string[] = [...EVENT_KINDS, ...APPLICATION_MESSAGE_KINDS, ...PLATFORM_KINDS];

export type Payload = EventMessagePayload & ApplicationMessagePayload & PlatformMessagePayload & Record<string, unknown>;

/** What a notification says: a title (also the e-mail subject when not confidential) and one or two sentences. */
export function notificationText(kind: string, payload: Payload): { title: string; body: string } {
  if ((EVENT_KINDS as readonly string[]).includes(kind)) return eventMessage(kind as EventMessageKind, payload);
  if ((APPLICATION_MESSAGE_KINDS as readonly string[]).includes(kind)) return applicationMessage(kind as ApplicationMessageKind, payload);
  if (isPlatformMessage(kind)) return platformMessage(kind, payload);
  return { title: "Notification", body: "" };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PUBLIC_PATH = /^\/(events|campus|associations|recruitment)\/[a-z0-9]+(-[a-z0-9]+)*$/;

export interface NotificationRef {
  kind: string;
  payload: Payload;
  event_id?: string | null;
  application_id?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  organization?: { slug: string } | null;
}

const slugOf = (value: unknown): string | null => (typeof value === "string" && SLUG.test(value) ? value : null);

/**
 * Where a notification leads (a path of this site). Unknown or unsafe
 * values fall back to a page that always exists for the person.
 */
export function notificationPath(n: NotificationRef): string {
  const p = n.payload ?? {};
  const org = slugOf(n.organization?.slug) ?? slugOf(p.organization_slug);
  const kind = n.kind;

  if ((EVENT_KINDS as readonly string[]).includes(kind)) {
    const slug = slugOf(p.slug);
    return slug && kind !== "event_registration_removed" ? `/events/${slug}` : "/account/events";
  }
  if ((APPLICATION_MESSAGE_KINDS as readonly string[]).includes(kind)) {
    if (isTeamMessage(kind)) return teamLink(p) ?? "/manage/evaluations";
    return n.application_id && UUID.test(n.application_id) ? `/account/applications/${n.application_id}` : "/account/applications";
  }
  switch (kind) {
    case "account_mfa_enabled":
    case "account_mfa_disabled":
      return "/account/security";
    case "account_privilege_changed":
      return org ? `/manage/${org}` : "/manage";
    case "account_platform_role_changed":
      return p.role === "guardian" ? "/manage/continuite" : p.role === "privacy_officer" ? "/manage/donnees" : "/manage";
    case "governance_invitation_received":
    case "governance_candidacy_received":
    case "governance_approval_required":
      return "/account/invitations";
    case "governance_bde_vacancy":
      return "/manage/continuite";
    case "governance_invitation_answered":
      return org ? `/manage/${org}/team` : "/manage";
    case "governance_transition_completed":
    case "governance_transition_closed":
    case "governance_mandate_expiring":
      return org ? `/manage/${org}/governance` : "/manage";
    // Phase 11: the page depends on who reads the alert, set by the database.
    case "governance_issue_alert":
      switch (p.target) {
        case "association":
          return org ? `/manage/${org}/continuite` : "/manage";
        case "guardian":
          return "/manage/continuite";
        case "self":
          return "/account/security";
        case "operations":
          return "/manage/plateforme/continuite/operations";
        default:
          return "/manage/plateforme/continuite";
      }
    case "platform_health_report":
      return "/manage/plateforme/continuite";
    case "content_approval_requested":
    case "content_approval_pending":
    case "content_review_done":
    case "content_schedule_failed":
    case "content_moderated": {
      const post = typeof p.post_id === "string" && UUID.test(p.post_id) ? p.post_id : null;
      return org ? (post ? `/manage/${org}/content/${post}` : `/manage/${org}/content`) : "/manage";
    }
    case "campus_announcement":
    case "association_message":
    case "followed_announcement":
    case "followed_post_published":
    case "followed_event_published":
    case "followed_recruitment_opened":
      return typeof p.link === "string" && PUBLIC_PATH.test(p.link) ? p.link : "/account/notifications";
    default:
      return "/account/notifications";
  }
}

/** The label of the main link of a notification (e-mail button, list action). */
export function notificationAction(kind: string): string {
  if ((EVENT_KINDS as readonly string[]).includes(kind)) return "Voir l'événement";
  if ((APPLICATION_MESSAGE_KINDS as readonly string[]).includes(kind)) {
    if (isTeamMessage(kind)) return "Ouvrir dans l'espace de gestion";
    return kind === "application_deadline_reminder" ? "Reprendre mon brouillon" : "Ma candidature";
  }
  if (kind.startsWith("account_")) return kind.includes("mfa") ? "Sécurité du compte" : "Ouvrir";
  if (kind.startsWith("governance_")) return kind.endsWith("received") || kind === "governance_approval_required" ? "Mes invitations" : "Ouvrir";
  if (kind.startsWith("content_")) return "Ouvrir l'article";
  return "Ouvrir";
}

/** The person a message is for, for the e-mail footer ("why you get this"). */
export function notificationReason(kind: string): string {
  if ((EVENT_KINDS as readonly string[]).includes(kind)) return "tu as une inscription à un événement";
  if ((APPLICATION_MESSAGE_KINDS as readonly string[]).includes(kind)) {
    return isTeamMessage(kind) ? "tu participes à un recrutement" : "tu as une candidature";
  }
  if (kind.startsWith("account_")) return "il s'agit de la sécurité de ton compte";
  if (kind === "platform_health_report") return "tu fais partie du bureau du BDE";
  if (kind.startsWith("governance_")) return "il s'agit de ton rôle dans une équipe";
  if (kind.startsWith("content_")) return "tu fais partie de l'équipe éditoriale d'une asso";
  if (kind === "campus_announcement") return "tu as choisi de recevoir les annonces du BDE";
  if (kind === "association_message") return "tu es membre de l'équipe d'une asso";
  return "tu suis une asso";
}
