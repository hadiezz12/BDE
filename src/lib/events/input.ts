/**
 * The event wizard's fields → the patch save_event receives, with a sentence
 * per wrong field. The database checks everything again; this only gives
 * clear messages early and turns Paris dates and times into exact instants.
 * Pure module (relative imports with extensions only): unit-tested with Node.
 */

import type { EventLocationType, RegistrationMode } from "../types";
import { parisLocalToInstant } from "../posts/schedule.ts";

export type EventStep = "infos" | "lieu" | "visuels" | "inscriptions";

export const EVENT_LIMITS = {
  title: 120,
  summary: 300,
  description: 8000,
  venue: 120,
  address: 200,
  city: 80,
  url: 500,
  access: 1000,
  capacity: 100000,
  coorganizers: 3,
} as const;

/** Self-service cancellation stops this long before the start (minutes). */
export const CANCELLATION_CUTOFFS = [0, 60, 120, 360, 720, 1440, 2880] as const;

export type Fields = Record<string, string | string[] | undefined>;
export type FieldErrors = Record<string, string>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const one = (f: Fields, name: string): string => {
  const v = f[name];
  return (Array.isArray(v) ? v[0] : v ?? "").toString();
};

/** One line: control characters out, spaces collapsed. */
function line(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

/** Free text with paragraphs: control characters out (line breaks kept), blank-line runs collapsed. */
function text(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** A web address an organizer gives: https only, a real host, no spaces. Null when it is not one. */
export function safeExternalUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  if (!/^https:\/\//i.test(candidate) || /\s/.test(candidate) || candidate.length > EVENT_LIMITS.url) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || !url.hostname.includes(".") || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export interface ParsedStep {
  patch: Record<string, unknown>;
  errors: FieldErrors;
  /** Things worth saying that are not errors (an ambiguous autumn hour). */
  notes: string[];
}

/** A Paris date + time pair → instant (null when both are empty). */
function parisInstant(
  f: Fields,
  prefix: string,
  label: string,
  errors: FieldErrors,
  notes: string[],
  required: boolean,
): string | null {
  const date = one(f, `${prefix}_date`).trim();
  const time = one(f, `${prefix}_time`).trim();
  if (!date && !time) {
    if (required) errors[prefix] = `Indique ${label} (jour et heure).`;
    return null;
  }
  if (!date || !time) {
    errors[prefix] = `Indique le jour et l'heure (${label}).`;
    return null;
  }
  const at = parisLocalToInstant(date, time);
  if (!at.ok) {
    errors[prefix] =
      at.reason === "nonexistent"
        ? "Cette heure n'existe pas ce jour-là à Paris (passage à l'heure d'été : de 2 h à 3 h, les horloges sautent). Choisis 3 h ou plus tard."
        : `Ce jour ou cette heure n'est pas valide (${label}).`;
    return null;
  }
  if (at.ambiguous) {
    notes.push(`${label.charAt(0).toUpperCase()}${label.slice(1)} : cette heure revient deux fois cette nuit-là (changement d'heure) ; c'est la première, en heure d'été.`);
  }
  return at.iso;
}

export function parseEventStep(
  step: EventStep,
  f: Fields,
  ctx: { seriesKeys?: string[]; isBde?: boolean } = {},
): ParsedStep {
  const errors: FieldErrors = {};
  const notes: string[] = [];
  const patch: Record<string, unknown> = {};

  if (step === "infos") {
    const title = line(one(f, "title"));
    if (title.length > EVENT_LIMITS.title) errors.title = `Le titre fait ${EVENT_LIMITS.title} caractères au plus.`;
    patch.title = title;
    const summary = line(one(f, "summary"));
    if (summary.length > EVENT_LIMITS.summary) errors.summary = `Le résumé fait ${EVENT_LIMITS.summary} caractères au plus.`;
    patch.summary = summary || null;
    const description = text(one(f, "description"));
    if (description.length > EVENT_LIMITS.description) {
      errors.description = `La présentation fait ${EVENT_LIMITS.description} caractères au plus.`;
    }
    patch.description = description || null;
    const category = one(f, "category_id").trim();
    if (category && !UUID.test(category)) errors.category_id = "Choisis une catégorie de la liste.";
    patch.category_id = category || null;
    if (ctx.isBde) {
      const series = one(f, "series_key").trim();
      if (series && !(ctx.seriesKeys ?? []).includes(series)) errors.series_key = "Choisis un événement de l'année de la liste.";
      patch.series_key = series || null;
    }
    const coorganizers = (Array.isArray(f.coorganizer_ids) ? f.coorganizer_ids : f.coorganizer_ids ? [f.coorganizer_ids] : [])
      .map((x) => x.trim())
      .filter(Boolean);
    if (coorganizers.some((x) => !UUID.test(x))) errors.coorganizer_ids = "Choisis les assos dans la liste.";
    else if (new Set(coorganizers).size > EVENT_LIMITS.coorganizers) {
      errors.coorganizer_ids = `${EVENT_LIMITS.coorganizers} assos co-organisatrices au plus.`;
    }
    if (f.coorganizers_present !== undefined) patch.coorganizer_ids = [...new Set(coorganizers)];
  }

  if (step === "lieu") {
    const starts = parisInstant(f, "starts", "le début", errors, notes, false);
    const ends = parisInstant(f, "ends", "la fin", errors, notes, false);
    if (starts && ends) {
      const length = Date.parse(ends) - Date.parse(starts);
      if (length <= 0) errors.ends = "La fin doit venir après le début.";
      else if (length > 14 * 86_400_000) errors.ends = "Un événement dure 14 jours au plus : au-delà, crée-en plusieurs.";
    } else if (starts && !ends && !errors.ends) {
      errors.ends = "Indique aussi la fin (jour et heure).";
    }
    patch.starts_at = starts;
    patch.ends_at = ends;

    const type = one(f, "location_type") as EventLocationType;
    if (!["campus", "external", "online"].includes(type)) errors.location_type = "Choisis où ça se passe.";
    patch.location_type = type;
    const venue = line(one(f, "venue_name"));
    const address = line(one(f, "address_line"));
    const city = line(one(f, "city"));
    if (venue.length > EVENT_LIMITS.venue) errors.venue_name = `Le nom du lieu fait ${EVENT_LIMITS.venue} caractères au plus.`;
    if (address.length > EVENT_LIMITS.address) errors.address_line = `L'adresse fait ${EVENT_LIMITS.address} caractères au plus.`;
    if (city.length > EVENT_LIMITS.city) errors.city = `La ville fait ${EVENT_LIMITS.city} caractères au plus.`;
    const online = type === "online";
    patch.venue_name = online ? null : venue || null;
    patch.address_line = online ? null : address || null;
    patch.city = online ? null : city || null;

    const latRaw = one(f, "latitude").trim().replace(",", ".");
    const lngRaw = one(f, "longitude").trim().replace(",", ".");
    if (!online && (latRaw || lngRaw)) {
      const lat = Number(latRaw);
      const lng = Number(lngRaw);
      if (!latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        errors.latitude = "Coordonnées non valides : deux nombres (ex : 48.8566 et 2.3522), ou laisse les deux vides.";
      } else {
        patch.latitude = Math.round(lat * 1e6) / 1e6;
        patch.longitude = Math.round(lng * 1e6) / 1e6;
      }
    } else {
      patch.latitude = null;
      patch.longitude = null;
    }

    const onlineRaw = one(f, "online_url").trim();
    if (online && onlineRaw) {
      const url = safeExternalUrl(onlineRaw);
      if (!url) errors.online_url = "Le lien doit être une adresse web sécurisée (https://…).";
      patch.online_url = url;
    } else {
      patch.online_url = null;
    }
  }

  if (step === "visuels") {
    const cover = one(f, "cover_media_id").trim();
    if (cover && !UUID.test(cover)) errors.cover_media_id = "Choisis une image de la médiathèque.";
    patch.cover_media_id = cover || null;
  }

  if (step === "inscriptions") {
    const mode = one(f, "registration_mode") as RegistrationMode;
    if (!["none", "internal", "external"].includes(mode)) errors.registration_mode = "Choisis comment on s'inscrit.";
    patch.registration_mode = mode;
    patch.external_url = null;
    patch.capacity = null;
    patch.waitlist_enabled = false;
    patch.registration_opens_at = null;
    patch.registration_closes_at = null;
    patch.cancellation_cutoff_minutes = 0;
    patch.access_details = null;

    if (mode === "external") {
      const url = safeExternalUrl(one(f, "external_url"));
      if (!url) errors.external_url = "Indique l'adresse de la page d'inscription (https://…).";
      patch.external_url = url;
    }
    if (mode === "internal") {
      const capRaw = one(f, "capacity").trim();
      if (one(f, "capacity_kind") === "limited") {
        const cap = Number(capRaw);
        if (!/^\d+$/.test(capRaw) || cap < 1 || cap > EVENT_LIMITS.capacity) {
          errors.capacity = `Indique un nombre de places entre 1 et ${EVENT_LIMITS.capacity.toLocaleString("fr-FR")}.`;
        } else {
          patch.capacity = cap;
        }
        patch.waitlist_enabled = one(f, "waitlist_enabled") === "on";
      }
      const opens = parisInstant(f, "opens", "l'ouverture des inscriptions", errors, notes, false);
      const closes = parisInstant(f, "closes", "la clôture des inscriptions", errors, notes, false);
      if (opens && closes && Date.parse(closes) <= Date.parse(opens)) {
        errors.closes = "La clôture doit venir après l'ouverture.";
      }
      patch.registration_opens_at = opens;
      patch.registration_closes_at = closes;
      const cutoff = Number(one(f, "cancellation_cutoff_minutes") || "0");
      if (!(CANCELLATION_CUTOFFS as readonly number[]).includes(cutoff)) {
        errors.cancellation_cutoff_minutes = "Choisis un délai d'annulation de la liste.";
      }
      patch.cancellation_cutoff_minutes = cutoff;
      const access = text(one(f, "access_details"));
      if (access.length > EVENT_LIMITS.access) {
        errors.access_details = `Les infos privées font ${EVENT_LIMITS.access} caractères au plus.`;
      }
      patch.access_details = access || null;
    }
  }

  return { patch, errors, notes };
}

/** "2 h avant", "La veille (24 h avant)"… */
export function cutoffLabel(minutes: number): string {
  if (minutes === 0) return "Jusqu'au début";
  if (minutes < 60) return `${minutes} min avant`;
  const h = minutes / 60;
  if (h === 24) return "La veille (24 h avant)";
  if (h === 48) return "Deux jours avant";
  return `${h} h avant`;
}
