import "server-only";
import { eventSeries } from "@/data/mock";
import type { EventSeries } from "@/lib/types";

/**
 * The BDE's recurring events ("Les 8 événements de l'année"), in the BDE's
 * order. Each one has its page at routes.event(slug). Mock-backed in Phase 1;
 * same signatures once they live in Supabase.
 */

export async function getEventSeries(query: { associationId?: string } = {}): Promise<EventSeries[]> {
  return eventSeries.filter((s) => !query.associationId || s.associationId === query.associationId);
}

export async function getEventSeriesBySlug(slug: string): Promise<EventSeries | null> {
  return eventSeries.find((s) => s.slug === slug) ?? null;
}

/** For a dated edition (CampusEvent.seriesId) → its series. */
export async function getEventSeriesById(id: string): Promise<EventSeries | null> {
  return eventSeries.find((s) => s.id === id) ?? null;
}
