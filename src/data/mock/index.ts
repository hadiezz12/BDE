/**
 * Phase 1 mock content. Only src/lib/data should import from here; pages go
 * through the data layer so the switch to Supabase is invisible to them.
 *
 * Real content only (the client's maquette): the BDE, its eight recurring
 * events, its carte cotisante and its VSS / VDH commitments. Every other
 * collection is empty until the associations fill it in.
 */
export { associations } from "./associations";
export { eventSeries } from "./event-series";
export { events } from "./events";
export { users } from "./users";
export { tasks } from "./manage";
export { ticketSales } from "./analytics";
export type { DailySales, TicketSalesSeries } from "./analytics";
