/**
 * Daily registrations of the events whose ticketing is open, for the
 * management statistics (/manage/[asso]/analytics). In Phase 2 these come
 * from the registrations table (one row per ticket, grouped by day). No
 * ticketing is open yet, so there is nothing to count.
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

export const ticketSales: TicketSalesSeries[] = [];
