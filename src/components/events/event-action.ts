import type { CampusEvent } from "@/lib/types";
import { formatDayFull, formatTime } from "@/lib/format";
import { eventPhase, isMultiDay } from "./event-facts";

/**
 * What the event page offers the student, in one place so the side panel
 * and the phone action bar always agree:
 *  - confirmed  : their seat (ticket, private details, cancel while allowed)
 *  - waitlisted : their place in the waiting list (leave it)
 *  - register   : "S'inscrire"
 *  - waitlist   : "Rejoindre la liste d'attente"
 *  - external   : the organizer's own registration page (never presented as done here)
 *  - none       : nothing to do here, with a sentence saying why
 * The page passes the student's registration as the database returns it
 * (my_event_status); the button's result always comes from the database too.
 */
export type EventActionKind = "confirmed" | "waitlisted" | "register" | "waitlist" | "external" | "none";

/** The student's own registration, as far as the page needs it. */
export interface PersonalRegistration {
  status: "confirmed" | "waitlisted" | "cancelled";
  position: number | null;
  canCancel: boolean;
  cancelSource: "self" | "organizer" | null;
  cancelReason: string | null;
}

export interface EventAction {
  kind: EventActionKind;
  /** The event is over. */
  past: boolean;
  /** One plain sentence about what you can do, or why you can't. */
  note: string | null;
}

export const ACTION_LABEL = {
  register: "S'inscrire",
  waitlist: "Rejoindre la liste d'attente",
  external: "S'inscrire chez l'organisateur",
} as const;

/** Narrow phone bar. */
export const ACTION_SHORT_LABEL = {
  register: "S'inscrire",
  waitlist: "Liste d'attente",
  external: "S'inscrire",
} as const;

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function eventAction(
  e: Pick<CampusEvent, "registration" | "startsAt" | "endsAt" | "status">,
  personal: PersonalRegistration | null,
  now = new Date(),
): EventAction {
  const phase = eventPhase(e, now);
  const r = e.registration;
  const holds = personal && personal.status !== "cancelled" ? personal.status : null;

  if (e.status === "cancelled") {
    return {
      kind: "none",
      past: phase === "past",
      note: holds ? "Tu étais inscrit·e : l'événement est annulé, tu n'as rien à faire." : "Cet événement est annulé.",
    };
  }
  if (phase === "past") {
    return { kind: "none", past: true, note: holds === "confirmed" ? "Tu étais inscrit·e : merci d'être venu·e." : null };
  }
  if (holds === "confirmed") return { kind: "confirmed", past: false, note: null };
  if (holds === "waitlisted") {
    return {
      kind: "waitlisted",
      past: false,
      note: "Si une place se libère, elle te revient automatiquement, dans l'ordre de la liste : tu seras prévenu·e.",
    };
  }

  // A single night already under way: no online registration any more.
  if (phase === "live" && !isMultiDay(e)) {
    return {
      kind: "none",
      past: false,
      note:
        r.mode === "none"
          ? "C'est en ce moment, en entrée libre : tu peux encore passer."
          : "C'est en ce moment : les inscriptions en ligne sont closes.",
    };
  }

  switch (r.state) {
    case "none":
      return { kind: "none", past: false, note: "Pas besoin de t'inscrire : viens directement." };
    case "external":
      return {
        kind: "external",
        past: false,
        note: "L'inscription se fait sur le site de l'organisateur : le site du BDE ne la gère pas et ne la confirme pas.",
      };
    case "upcoming":
      return {
        kind: "none",
        past: false,
        note: r.opensAt
          ? `Les inscriptions ouvrent ${lower(formatDayFull(r.opensAt))} à ${formatTime(r.opensAt)}.`
          : "Les inscriptions ouvrent bientôt.",
      };
    case "open":
      return { kind: "register", past: false, note: null };
    case "waitlist":
      return {
        kind: "waitlist",
        past: false,
        note: "Toutes les places sont prises. Inscris-toi sur la liste d'attente : si quelqu'un se désiste, sa place revient automatiquement à la première personne de la liste.",
      };
    case "full":
      return { kind: "none", past: false, note: "Toutes les places sont prises, et il n'y a pas de liste d'attente pour celui-ci." };
    case "closed":
      return { kind: "none", past: false, note: "Les inscriptions sont closes." };
    default:
      return { kind: "none", past: false, note: null };
  }
}
