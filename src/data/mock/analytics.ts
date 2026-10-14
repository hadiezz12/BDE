import { ago } from "./clock";
import { events } from "./events";

/**
 * Daily registrations of the events whose ticketing is open, for the
 * management statistics (/manage/[asso]/analytics). In Phase 2 these come
 * from the registrations table (one row per ticket, grouped by day); here the
 * daily shape is mock, but it always adds up to the event's `taken` count, so
 * the statistics never disagree with the events page.
 */
export interface DailySales {
  /** Noon, Paris time, of the day counted. */
  day: string;
  count: number;
}

export interface TicketSalesSeries {
  eventId: string;
  days: DailySales[];
}

/**
 * Spreads the event's registrations over the days since ticketing opened,
 * following `weights` (one per day, from `openedDaysAgo` up to today).
 * Rounding leftovers go to the opening day, which is always the peak.
 */
function series(eventId: string, openedDaysAgo: number, weights: number[]): TicketSalesSeries {
  const total = events.find((e) => e.id === eventId)?.registration.taken ?? 0;
  const sum = weights.reduce((n, w) => n + w, 0) || 1;
  const counts = weights.map((w) => Math.floor((w * total) / sum));
  counts[0] += total - counts.reduce((n, c) => n + c, 0);
  return {
    eventId,
    days: counts.map((count, i) => ({ day: ago(openedDaysAgo - i, "12:00"), count })),
  };
}

export const ticketSales: TicketSalesSeries[] = [
  // BOO Party: cotisant pre-sale rush on day one, a long tail, then a jump
  // the day "La billetterie en cinq questions" went out (3 days ago).
  series("e-boo-party", 16, [176, 71, 40, 29, 22, 18, 24, 15, 13, 12, 17, 14, 11, 49, 33, 19, 8]),
  // Barathon #2 (tonight): opened nine days ago, last-minute bump this week.
  series("e-barathon-princesse-mouffetard", 9, [34, 19, 12, 8, 7, 9, 13, 11, 16, 12]),
];
