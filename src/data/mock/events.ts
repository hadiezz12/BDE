import type { CampusEvent } from "@/lib/types";

/**
 * Dated editions of events (a given night, a given weekend). None is known
 * yet: no date, venue, price or capacity has been announced for this year.
 * The BDE's recurring events live in ./event-series; when the bureau dates an
 * edition, it lands here with `seriesId` pointing back to its series.
 */
export const events: CampusEvent[] = [];
