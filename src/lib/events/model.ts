/**
 * Shapes of the event functions' payloads (supabase/migrations/2026102312*),
 * their mapping to the UI's EventItem, and the plain-language registration
 * facts. Pure module (relative imports with extensions only): the unit tests
 * load it with plain Node.
 */

import type {
  AccentKey,
  AssociationRef,
  EventCategory,
  EventItem,
  EventLocationType,
  EventStatus,
  RegistrationMode,
  RegistrationState,
} from "../types";
import { toPhoto, type MediaPayload } from "../associations/model.ts";
import { organizationRef, type OrganizationCardPayload } from "../posts/model.ts";

/** private.event_card: an event as visitors may see it. */
export interface EventCardPayload {
  id: string;
  slug: string;
  series_key: string | null;
  title: string;
  summary: string | null;
  category: { slug: EventCategory; label: string } | null;
  cover: MediaPayload | null;
  organization: OrganizationCardPayload;
  coorganizers: OrganizationCardPayload[];
  starts_at: string;
  ends_at: string;
  timezone: string;
  location: {
    type: EventLocationType;
    venue: string | null;
    address: string | null;
    city: string | null;
    latitude: number | null;
    longitude: number | null;
    online_url: string | null;
    has_private_details: boolean;
  };
  status: EventStatus;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  registration: {
    mode: RegistrationMode;
    state: RegistrationState;
    external_url: string | null;
    opens_at: string | null;
    closes_at: string | null;
    capacity: number | null;
    confirmed: number;
    waitlist_enabled: boolean;
    waitlist: number;
    cancellation_cutoff_minutes: number;
  };
  prominence: "normal" | "featured";
  pinned: boolean;
  first_published_at: string | null;
  published_at: string | null;
  /** public_event / event_preview only. */
  description?: string | null;
}

export type PublicEventState =
  | { state: "ok"; event: EventCardPayload }
  | { state: "moved"; slug: string }
  | { state: "not_found" };

export interface EventFacets {
  total: number;
  categories: { slug: string; label: string; count: number }[];
  organizations: { slug: string; name: string; short_name: string | null; accent: AccentKey; count: number }[];
  location_types: Partial<Record<EventLocationType, number>>;
  categories_all: { slug: string; label: string }[];
}

/** The BDE's events of the year carry their neon emblem (public/brand/events/<key>.png). */
export function emblemFor(seriesKey: string | null | undefined): string | undefined {
  return seriesKey ? `/brand/events/${seriesKey}.png` : undefined;
}

/** Plain text → paragraphs (blank lines separate them; single line breaks are kept as spaces). */
export function paragraphs(text: string | null | undefined): string[] {
  return (text ?? "")
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

export function toEventItem(p: EventCardPayload, { preview = false }: { preview?: boolean } = {}): EventItem {
  const l = p.location;
  const r = p.registration;
  const association: AssociationRef = organizationRef(p.organization, preview);
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    summary: p.summary ?? "",
    description: paragraphs(p.description),
    associationId: p.organization.id,
    association,
    coorganizers: (p.coorganizers ?? []).map((o) => organizationRef(o, preview)),
    seriesKey: p.series_key ?? undefined,
    category: p.category ?? undefined,
    startsAt: p.starts_at,
    endsAt: p.ends_at,
    timezone: p.timezone,
    venue: {
      type: l.type,
      name: l.venue ?? undefined,
      address: l.address ?? undefined,
      city: l.city ?? undefined,
      onCampus: l.type === "campus",
      latitude: l.latitude ?? undefined,
      longitude: l.longitude ?? undefined,
      onlineUrl: l.online_url ?? undefined,
      hasPrivateDetails: Boolean(l.has_private_details),
    },
    cover: toPhoto(p.cover, p.title, null, preview),
    emblem: emblemFor(p.series_key),
    status: p.status,
    cancelledAt: p.cancelled_at ?? undefined,
    cancellationReason: p.cancellation_reason ?? undefined,
    registration: {
      mode: r.mode,
      state: r.state,
      externalUrl: r.external_url ?? undefined,
      opensAt: r.opens_at ?? undefined,
      closesAt: r.closes_at ?? undefined,
      capacity: r.capacity ?? undefined,
      taken: r.confirmed,
      waitlistEnabled: r.waitlist_enabled,
      waiting: r.waitlist,
      cancellationCutoffMinutes: r.cancellation_cutoff_minutes,
    },
    featured: p.prominence === "featured",
    pinned: p.pinned,
  };
}

// ---- Availability -----------------------------------------------------------------------

/**
 * "Dernières places": 10 % of the capacity or less is left (at least one
 * seat, so a 4-seat workshop with one seat left qualifies). The only
 * threshold the site uses; documented in docs/backend/events.md.
 */
export function lastSeats(r: Pick<EventItem["registration"], "capacity" | "taken">): number | null {
  if (r.capacity === undefined) return null;
  const left = r.capacity - r.taken;
  return left > 0 && left <= Math.max(1, Math.ceil(r.capacity * 0.1)) ? left : null;
}

export function seatsLeft(r: Pick<EventItem["registration"], "capacity" | "taken">): number | null {
  return r.capacity === undefined ? null : Math.max(0, r.capacity - r.taken);
}

/** The label of a registration state, in words (always printed: colour only repeats it). */
export const REGISTRATION_STATE_LABEL: Record<RegistrationState, string> = {
  none: "Entrée libre",
  external: "Inscription chez l'organisateur",
  upcoming: "Inscriptions bientôt",
  open: "Inscriptions ouvertes",
  waitlist: "Complet · liste d'attente",
  full: "Complet",
  closed: "Inscriptions closes",
  cancelled: "Annulé",
  past: "Terminé",
};

// ---- A student's own registration --------------------------------------------------------

export type MyRegistrationStatus = "confirmed" | "waitlisted" | "cancelled";

export interface MyRegistrationPayload {
  registration_id: string;
  status: MyRegistrationStatus;
  reference: string;
  already: boolean;
  /** Place in the waiting list (1 = next), waitlisted only. */
  position: number | null;
  created_at?: string;
  confirmed_at?: string | null;
  promoted_at?: string | null;
  cancelled_at?: string | null;
  cancel_source?: "self" | "organizer" | null;
  /** Given by the team when it removed the registration. */
  cancel_reason?: string | null;
  can_cancel?: boolean;
  /** Private instructions, confirmed seats only. */
  access_details?: string | null;
}

export interface MyEventStatusPayload {
  bookmarked: boolean;
  profile_complete: boolean;
  registration: MyRegistrationPayload | null;
}

export interface MyEventsPayload {
  registrations: {
    registration: MyRegistrationPayload;
    /** The public card, or (event hidden / taken off the site) its title and dates with `unavailable`. */
    event: EventCardPayload | (Pick<EventCardPayload, "id" | "title" | "starts_at" | "ends_at" | "timezone" | "organization" | "status"> & {
      slug: null;
      cancellation_reason: string | null;
      unavailable: true;
    });
  }[];
  bookmarks: EventCardPayload[];
}

/** One plain sentence about a student's registration ("Tu es inscrit·e", "Liste d'attente · 4ᵉ"). */
export function myRegistrationWords(r: Pick<MyRegistrationPayload, "status" | "position" | "cancel_source">): string {
  if (r.status === "confirmed") return "Tu es inscrit·e";
  if (r.status === "waitlisted") return r.position ? `Liste d'attente · ${ordinal(r.position)}` : "Liste d'attente";
  return r.cancel_source === "organizer" ? "Inscription retirée par l'asso" : "Inscription annulée";
}

/** What each event is to the student, for the marks on lists: registered, waiting (with the place), saved. */
export function personalStates(
  my: MyEventsPayload,
): Map<string, { registered?: boolean; waitlisted?: boolean; position?: number | null; saved?: boolean }> {
  const map = new Map<string, { registered?: boolean; waitlisted?: boolean; position?: number | null; saved?: boolean }>();
  for (const b of my.bookmarks) map.set(b.id, { saved: true });
  for (const { registration: r, event } of my.registrations) {
    if (r.status === "cancelled") continue;
    const prev = map.get(event.id) ?? {};
    map.set(event.id, r.status === "confirmed" ? { ...prev, registered: true } : { ...prev, waitlisted: true, position: r.position });
  }
  return map;
}

/** 1 → "1re", 4 → "4e" (French ordinals as written on tickets). */
export function ordinal(n: number): string {
  return n === 1 ? "1re" : `${n}e`;
}

// ---- The event team ---------------------------------------------------------------------------

export type EventPublication = "draft" | "published" | "unpublished";

/** private.event_summary: an event on its association's desk (counts only, no person). */
export interface EventSummary {
  id: string;
  slug: string | null;
  title: string;
  series_key: string | null;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  location: { type: EventLocationType; venue: string | null; city: string | null };
  cover: MediaPayload | null;
  category: string | null;
  publication: EventPublication;
  status: "scheduled" | "cancelled";
  first_published_at: string | null;
  cancelled_at: string | null;
  hidden: { at: string; reason: string } | null;
  registration: {
    mode: RegistrationMode;
    state: RegistrationState;
    opens_at: string | null;
    closes_at: string | null;
    capacity: number | null;
    confirmed: number;
    waitlist_enabled: boolean;
    waitlist: number;
  };
  pinned: boolean;
  prominence: "normal" | "featured";
  created_by_name: string;
  created_by_you: boolean;
  updated_at: string;
  updated_by_name: string | null;
  emails: { pending: number; failed: number };
  is_public: boolean;
  /** What publishing would refuse, or null. */
  blocker: string | null;
}

/** Where an event stands for its team, most urgent first. */
export type EventStage = "hidden" | "cancelled" | "past" | "live" | "offline" | "draft";

export function eventStage(s: Pick<EventSummary, "hidden" | "status" | "publication" | "ends_at">, now = new Date()): EventStage {
  if (s.hidden) return "hidden";
  if (s.status === "cancelled") return "cancelled";
  if (s.publication === "draft") return "draft";
  if (s.ends_at && Date.parse(s.ends_at) <= now.getTime()) return "past";
  return s.publication === "published" ? "live" : "offline";
}

export const EVENT_STAGE_LABEL: Record<EventStage, string> = {
  hidden: "Masqué par la modération",
  cancelled: "Annulé",
  past: "Terminé",
  live: "En ligne",
  offline: "Retiré du site",
  draft: "Brouillon",
};

export const EVENT_STAGE_TONE: Record<EventStage, "ok" | "warn" | "danger" | "info" | "accent" | "neutral"> = {
  hidden: "danger",
  cancelled: "danger",
  past: "neutral",
  live: "ok",
  offline: "neutral",
  draft: "neutral",
};

/** The desk's tabs (brief §20). */
export const EVENT_DESK_VIEWS = [
  { key: "a-venir", label: "À venir" },
  { key: "brouillons", label: "Brouillons" },
  { key: "passes", label: "Passés" },
  { key: "annules", label: "Annulés" },
] as const;

export type EventDeskView = (typeof EVENT_DESK_VIEWS)[number]["key"];

export function inEventView(s: EventSummary, view: EventDeskView, now = new Date()): boolean {
  const stage = eventStage(s, now);
  switch (view) {
    case "brouillons":
      return stage === "draft";
    case "passes":
      return stage === "past";
    case "annules":
      return stage === "cancelled";
    default:
      return stage === "live" || stage === "offline" || stage === "hidden";
  }
}

/** Why publishing is refused, in the team's words. */
export const EVENT_BLOCKER_LABEL: Record<string, string> = {
  event_hidden: "le BDE l'a masqué (modération)",
  event_cancelled: "il est annulé",
  organization_inactive: "l'asso n'est pas active",
  page_not_public: "la page publique de l'asso n'est pas en ligne",
  event_incomplete: "il manque le titre, le résumé, les dates ou le lieu",
  event_past: "il est déjà terminé",
  media_not_found: "l'image de couverture n'est plus dans la médiathèque",
};

export interface AttendeeRow {
  id: string;
  name: string;
  status: MyRegistrationStatus;
  reference: string;
  position: number | null;
  created_at: string;
  confirmed_at: string | null;
  promoted_at: string | null;
  cancelled_at: string | null;
  cancel_source: "self" | "organizer" | null;
  cancel_reason: string | null;
}

// ---- Feed and calendar pages ---------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})$/;

/** The "later events" link carries the last item seen: its start and id, joined by "~". */
export function encodeEventCursor(c: { at: string; id: string }): string {
  return `${c.at}~${c.id}`;
}

export function parseEventCursor(raw: string | string[] | undefined): { at: string; id: string } | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || v.length > 80) return null;
  const [at, id, extra] = v.split("~");
  if (extra !== undefined || !at || !id || !AT.test(at) || !UUID.test(id)) return null;
  const [y, mo, d, h, mi, s] = at.slice(0, 19).split(/[-T:]/).map(Number);
  const day = new Date(Date.UTC(y, mo - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) {
    return null;
  }
  return { at, id };
}

export const LOCATION_LABEL: Record<EventLocationType, string> = {
  campus: "Sur le campus",
  external: "Hors campus",
  online: "En ligne",
};

// ---- The wizard's checklist -----------------------------------------------------------------------

export type WizardStep = "infos" | "lieu" | "visuels" | "inscriptions" | "apercu" | "publication";

export const WIZARD_STEPS: { key: WizardStep; label: string }[] = [
  { key: "infos", label: "Infos" },
  { key: "lieu", label: "Date et lieu" },
  { key: "visuels", label: "Visuel" },
  { key: "inscriptions", label: "Inscriptions" },
  { key: "apercu", label: "Aperçu" },
  { key: "publication", label: "Publication" },
];

export interface ChecklistItem {
  step: WizardStep;
  label: string;
  ok: boolean;
  /** Publishing refuses without it (same rule as private.event_blocker). */
  required: boolean;
}

/** What publishing needs, step by step (the database checks the same and more). */
export function eventChecklist(
  e: {
    title: string;
    summary: string | null;
    starts_at: string | null;
    ends_at: string | null;
    location_type: EventLocationType;
    venue_name: string | null;
    registration_mode: RegistrationMode;
    external_url: string | null;
    cover_media_id: string | null;
  },
  now = new Date(),
): ChecklistItem[] {
  const items: ChecklistItem[] = [
    { step: "infos", label: "Un titre", ok: e.title.trim().length >= 3, required: true },
    { step: "infos", label: "La phrase qui le présente", ok: Boolean(e.summary?.trim()), required: true },
    { step: "lieu", label: "Le début et la fin", ok: Boolean(e.starts_at && e.ends_at), required: true },
  ];
  if (e.ends_at) items.push({ step: "lieu", label: "Une fin à venir", ok: Date.parse(e.ends_at) > now.getTime(), required: true });
  if (e.location_type !== "online") items.push({ step: "lieu", label: "Le nom du lieu", ok: Boolean(e.venue_name), required: true });
  items.push({ step: "visuels", label: "Une image (conseillé)", ok: Boolean(e.cover_media_id), required: false });
  if (e.registration_mode === "external") {
    items.push({ step: "inscriptions", label: "La page d'inscription", ok: Boolean(e.external_url), required: true });
  }
  return items;
}

/** The confirmation the publication step shows after publishing, taking offline or cancelling (?fait=). */
export function publicationDoneMessage(fait: string | undefined): string | null {
  if (fait === "publie") return "Publié : l'événement est dans l'agenda, le calendrier et sur la page de l'asso.";
  if (fait === "retire") return "Retiré du site. Il revient à la prochaine publication.";
  const cancelled = fait?.match(/^annule-(\d{1,6})$/);
  if (cancelled) {
    const told = Number(cancelled[1]);
    return `Événement annulé. Sa page l'indique, avec ta raison.${
      told > 0 ? ` ${told === 1 ? "La personne inscrite ou en attente est prévenue" : `Les ${told} personnes inscrites ou en attente sont prévenues`}.` : ""
    }`;
  }
  return null;
}
