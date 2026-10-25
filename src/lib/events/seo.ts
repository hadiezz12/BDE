/**
 * What an event page tells the outside world: its place as one line (for
 * calendars), its calendar entry, and its schema.org Event (JSON-LD). Only
 * the public fields: never the private joining details, never anyone who
 * registered, and no `offers` (the site sells nothing and knows no price).
 * Pure module (relative imports with extensions only).
 */

import type { EventItem, Venue } from "../types";
import type { CalendarEventInput } from "./ics.ts";

/** "Salle, 12 rue X, Paris" · "Sur le campus" · "En ligne" — only what the organizer typed. */
export function placeLine(v: Venue): string {
  if (v.type === "online") return "En ligne";
  const parts = [v.name, v.address, v.city].filter((p): p is string => Boolean(p));
  if (parts.length === 0) return v.onCampus ? "Sur le campus" : "";
  return v.onCampus && !parts.some((p) => /campus/i.test(p)) ? `${parts.join(", ")} (campus)` : parts.join(", ");
}

export function calendarInput(e: EventItem, url: string, updatedAt?: string): CalendarEventInput {
  return {
    id: e.id,
    title: e.status === "cancelled" ? `Annulé : ${e.title}` : e.title,
    summary: e.summary ?? "",
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    location: placeLine(e.venue),
    url,
    cancelled: e.status === "cancelled",
    updatedAt,
  };
}

/** schema.org Event for one public event page (no offers, no attendee, no private detail). */
export function eventJsonLd(
  e: EventItem,
  { url, absolute, organizerUrl }: { url: string; absolute: (path: string) => string; organizerUrl: string },
): Record<string, unknown> {
  const v = e.venue;
  const location =
    v.type === "online"
      ? { "@type": "VirtualLocation", url: v.onlineUrl ?? url }
      : {
          "@type": "Place",
          ...(v.name || v.onCampus ? { name: v.name ?? "Campus" } : {}),
          ...(v.address || v.city
            ? {
                address: {
                  "@type": "PostalAddress",
                  ...(v.address ? { streetAddress: v.address } : {}),
                  ...(v.city ? { addressLocality: v.city } : {}),
                },
              }
            : {}),
          ...(v.latitude !== undefined && v.longitude !== undefined
            ? { geo: { "@type": "GeoCoordinates", latitude: v.latitude, longitude: v.longitude } }
            : {}),
        };
  const image = e.cover ? absolute(e.cover.src) : e.emblem ? absolute(e.emblem) : null;
  const description = e.summary || e.description[0] || undefined;
  return {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    ...(description ? { description } : {}),
    startDate: e.startsAt,
    endDate: e.endsAt,
    eventStatus: e.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode:
      v.type === "online" ? "https://schema.org/OnlineEventAttendanceMode" : "https://schema.org/OfflineEventAttendanceMode",
    location,
    ...(image ? { image: [image] } : {}),
    organizer: { "@type": "Organization", name: e.association.name, url: organizerUrl },
    url,
  };
}

/** JSON for a <script type="application/ld+json">, with "<" escaped so it can never close the tag. */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
