/**
 * Phase 1 mock content. Only src/lib/data should import from here; pages go
 * through the data layer so the switch to Supabase is invisible to them.
 */
export { photos, pick } from "./photos";
export type { PhotoKey } from "./photos";
export { associations } from "./associations";
export { events } from "./events";
export { posts } from "./posts";
export { campaigns } from "./recruitment";
export { users } from "./users";
export { applications, applicants } from "./applications";
export { notifications } from "./notifications";
export { tasks, mediaAssets } from "./manage";
export { ticketSales } from "./analytics";
export type { DailySales, TicketSalesSeries } from "./analytics";
