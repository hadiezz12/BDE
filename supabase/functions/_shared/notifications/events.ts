/**
 * The words of each event message, from the outbox row the database wrote
 * (notification_outbox: kind + payload frozen at the time of the event).
 * One source for the in-app list and the e-mail worker, so both always say
 * the same thing. Public facts only: the payload never holds the private
 * joining details, and nothing here adds any. Pure module (Intl only).
 */

export type EventMessageKind =
  | "event_registration_confirmed"
  | "event_waitlisted"
  | "event_promoted"
  | "event_registration_cancelled"
  | "event_registration_removed"
  | "event_changed"
  | "event_cancelled"
  | "event_reminder";

export interface EventMessagePayload {
  title?: string;
  slug?: string | null;
  organization?: string;
  starts_at?: string;
  ends_at?: string;
  venue?: string | null;
  city?: string | null;
  location_type?: string;
  reason?: string;
  was?: string;
  registration_status?: string;
  dates_changed?: boolean;
  place_changed?: boolean;
  previous_starts_at?: string;
  previous_venue?: string | null;
  previous_city?: string | null;
}

export interface EventMessage {
  /** E-mail subject and the in-app title. */
  title: string;
  /** One or two plain sentences. */
  body: string;
}

const TZ = "Europe/Paris";
const dayFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const timeFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "jeudi 22 octobre à 19h30" in Paris time. */
export function messageWhen(iso: string): string {
  const d = new Date(iso);
  const [h, m] = timeFormat.format(d).split(":");
  return `${dayFormat.format(d)} à ${Number(h)}h${m === "00" ? "" : m}`;
}

/** "Salle X, Paris" · "en ligne" · "" */
export function messageWhere(p: Pick<EventMessagePayload, "location_type" | "venue" | "city">): string {
  if (p.location_type === "online") return "en ligne";
  return [p.venue, p.city].filter(Boolean).join(", ");
}

export function eventMessage(kind: EventMessageKind, p: EventMessagePayload): EventMessage {
  const title = p.title ?? "Un événement";
  const when = p.starts_at ? messageWhen(p.starts_at) : null;
  const where = messageWhere(p);
  const whenWhere = [when ? cap(when) : null, where ? cap(where) : null].filter(Boolean).join(" · ");
  const org = p.organization ?? "L'association";

  switch (kind) {
    case "event_registration_confirmed":
      return {
        title: `Inscription confirmée : ${title}`,
        body: `${whenWhere ? `${whenWhere}. ` : ""}Ta référence et les infos pratiques sont dans Mes événements.`,
      };
    case "event_waitlisted":
      return {
        title: `Liste d'attente : ${title}`,
        body: "C'est complet pour l'instant. Si une place se libère avant la clôture des inscriptions, elle t'est attribuée automatiquement, dans l'ordre, et tu seras prévenu·e.",
      };
    case "event_promoted":
      return {
        title: `Une place s'est libérée : ${title}`,
        body: `Tu passes de la liste d'attente aux inscrit·es${when ? `, pour ${when}` : ""}. Si tu ne peux plus venir, annule depuis Mes événements pour laisser la place.`,
      };
    case "event_registration_cancelled":
      return {
        title: `${p.was === "waitlisted" ? "Tu as quitté la liste d'attente" : "Inscription annulée"} : ${title}`,
        body: "C'est enregistré. Tu peux te réinscrire depuis la page de l'événement tant qu'il reste de la place.",
      };
    case "event_registration_removed":
      return {
        title: `Inscription retirée : ${title}`,
        body: `${org} a retiré ton inscription.${p.reason ? ` Raison donnée : ${p.reason}` : ""}`,
      };
    case "event_changed": {
      const parts: string[] = [];
      if (p.dates_changed && when) {
        parts.push(`Nouvelle date : ${when}${p.previous_starts_at ? ` (au lieu du ${messageWhen(p.previous_starts_at)})` : ""}.`);
      }
      if (p.place_changed) parts.push(`Nouveau lieu : ${where || "à préciser"}.`);
      return {
        title: `Changement : ${title}`,
        body: `${parts.join(" ") || "Les informations pratiques ont changé."} Ton inscription reste valable ; si tu ne peux plus venir, annule depuis Mes événements.`,
      };
    }
    case "event_cancelled":
      return {
        title: `Annulé : ${title}`,
        body: `${org} a annulé l'événement.${p.reason ? ` Raison donnée : ${p.reason}` : ""}`,
      };
    case "event_reminder":
      return {
        title: `Rappel : ${title}`,
        body: `${whenWhere ? `${whenWhere}. ` : ""}Les infos pour y aller sont dans Mes événements.`,
      };
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
