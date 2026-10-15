import type { EventSeries, MemberCardOffer } from "@/lib/types";
import { routes } from "@/lib/routes";

/**
 * Small derivations around the BDE's events of the year and its carte
 * cotisante. Pure functions; no data access, nothing invented: every value
 * comes from the series list or the card offer as the BDE wrote them.
 */

/** "01" … "08": a series' place in the BDE's order. */
export function seriesNumbers(list: Pick<EventSeries, "id">[]): Map<string, string> {
  return new Map(list.map((s, i) => [s.id, String(i + 1).padStart(2, "0")]));
}

/** Where the carte cotisante is presented and sold: the BDE's page, at #carte. */
export function memberCardHref(bdeSlug: string): string {
  return `${routes.association(bdeSlug)}#carte`;
}

/**
 * The card's discount on events, from the BDE's own summary table
 * ("Réductions sur les 8 événements" → "-20 % à -40 %"). Null when the
 * table has no such row.
 */
export function memberDiscount(offer: Pick<MemberCardOffer, "summary">): { label: string; value: string } | null {
  return offer.summary.find((row) => /r[ée]duction/i.test(row.label)) ?? null;
}

/** "30 €", with a non-breaking space so the sign never wraps alone. */
export function euros(n: number): string {
  return `${n.toLocaleString("fr-FR")} €`;
}
