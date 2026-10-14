import type { CampusEvent } from "@/lib/types";
import { formatDayFull, formatTime } from "@/lib/format";
import { eventPhase, isMultiDay, seatsLeft } from "./event-facts";

/**
 * What the event page offers the student, in one place so the side panel
 * and the phone action bar always agree:
 *  - registered : already on the list → their ticket, no CTA
 *  - register   : "S'inscrire"
 *  - waitlist   : "Rejoindre la liste d'attente"
 *  - none       : nothing to do here, with a sentence saying why
 *
 * PHASE 1: register and waitlist only show a demo notice (nothing is sent).
 */
export type EventActionKind = "registered" | "register" | "waitlist" | "none";

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
} as const;

/** Narrow phone bar. */
export const ACTION_SHORT_LABEL = {
  register: "S'inscrire",
  waitlist: "Liste d'attente",
} as const;

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function eventAction(
  e: Pick<CampusEvent, "registration" | "startsAt" | "endsAt">,
  { registered = false }: { registered?: boolean } = {},
  now = new Date(),
): EventAction {
  const phase = eventPhase(e, now);
  const r = e.registration;

  if (phase === "past") {
    return { kind: "none", past: true, note: registered ? "Tu y étais : merci d'être venu·e." : null };
  }
  if (registered) return { kind: "registered", past: false, note: null };

  // A single night already under way: no online registration any more.
  if (phase === "live" && !isMultiDay(e)) {
    return {
      kind: "none",
      past: false,
      note:
        r.status === "libre"
          ? "C'est en ce moment, en entrée libre : tu peux encore passer."
          : "C'est en ce moment : les inscriptions en ligne sont closes.",
    };
  }

  switch (r.status) {
    case "libre":
      return { kind: "none", past: false, note: "Pas besoin de t'inscrire : viens directement." };
    case "bientot":
      return {
        kind: "none",
        past: false,
        note:
          r.opensAt && Date.parse(r.opensAt) > now.getTime()
            ? `Les inscriptions ouvrent ${lower(formatDayFull(r.opensAt))} à ${formatTime(r.opensAt)}.`
            : "Les inscriptions ouvrent bientôt : la date sera annoncée ici.",
      };
    case "ouverte":
    case "derniere-chance": {
      if (r.closesAt && Date.parse(r.closesAt) <= now.getTime()) {
        return { kind: "none", past: false, note: "Les inscriptions sont closes." };
      }
      if (seatsLeft(r) === 0) return { kind: "none", past: false, note: "Toutes les places sont prises." };
      return { kind: "register", past: false, note: null };
    }
    case "liste-attente":
      return {
        kind: "waitlist",
        past: false,
        note: "Toutes les places sont prises. Si quelqu'un se désiste, sa place revient à la première personne de la liste d'attente.",
      };
    case "complet":
      return {
        kind: "none",
        past: false,
        note: "Toutes les places sont prises, et il n'y a pas de liste d'attente pour celui-ci.",
      };
    case "fermee":
      return { kind: "none", past: false, note: "Les inscriptions sont closes." };
  }
}
