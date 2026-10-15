import type { EventItem, UserProfile } from "@/lib/types";
import type { PersonalState } from "@/components/events/PersonalMarks";
import { eventPhase, isLit, isMultiDay, isTonight } from "@/components/events/event-facts";
import { dayDiff } from "@/lib/time";

/**
 * What the home page decides from the agenda: what goes on tonight's board,
 * which event the opening visual shows, which one gets the featured spread,
 * and what this week's rail still has to say once those are on screen.
 * Pure functions of the lists and one `now`; no data access.
 */

export interface TonightBoard {
  /** "Ce soir" · "Aujourd'hui" · "Relâche ce soir". */
  title: string;
  /** One line under the title when nothing happens tonight. */
  note: string | null;
  events: EventItem[];
}

/**
 * Tonight's board. Single-night events of the day first (in start order),
 * then whatever runs over several days (a campaign "en cours"). With nothing
 * on tonight, the board says so and shows what comes next instead.
 */
export function tonightBoard(today: EventItem[], upcoming: EventItem[], now: Date, max = 4): TonightBoard {
  const nights = today.filter((e) => !isMultiDay(e));
  const running = today.filter((e) => isMultiDay(e));

  if (nights.length > 0) {
    // A night that started yesterday and is still going (1h, barathon) is still "ce soir".
    const evening = nights.some((e) => isTonight(e, now) || (isLit(e, now) && dayDiff(now, e.startsAt) < 0));
    return { title: evening ? "Ce soir" : "Aujourd'hui", note: null, events: [...nights, ...running].slice(0, max) };
  }

  const todayIds = new Set(today.map((e) => e.id));
  const next = upcoming.filter((e) => !todayIds.has(e.id) && !isMultiDay(e)).slice(0, Math.max(1, max - running.length));
  return {
    title: "Relâche ce soir",
    note: next.length > 0 ? "Rien au programme ce soir. Voilà la suite :" : null,
    events: [...next, ...running].slice(0, max),
  };
}

/**
 * The event the opening visual stands for: tonight's signature event (its
 * neon emblem lights the slot), else tonight's first event, else the next
 * featured BDE night.
 */
export function heroEvent(board: EventItem[], upcoming: EventItem[]): EventItem | null {
  const singles = board.filter((e) => !isMultiDay(e));
  return (
    singles.find((e) => e.emblem) ??
    singles[0] ??
    upcoming.find((e) => e.featured && e.emblem) ??
    upcoming.find((e) => !isMultiDay(e)) ??
    board[0] ??
    null
  );
}

/**
 * The featured spread: the next event flagged `featured` that is not already
 * on screen, else the next BDE event with an emblem. Never something under way.
 */
export function featuredEvent(upcoming: EventItem[], shown: Set<string>, now: Date): EventItem | null {
  const candidates = upcoming.filter((e) => !shown.has(e.id) && eventPhase(e, now) === "upcoming");
  return (
    candidates.find((e) => e.featured) ??
    candidates.find((e) => e.emblem && e.association.category === "bde") ??
    null
  );
}

/** Registered / saved marks for a signed-in student; nothing for a visitor. */
export function personalFor(user: UserProfile | null) {
  return (e: Pick<EventItem, "id">): PersonalState | undefined =>
    user
      ? { registered: user.registeredEventIds.includes(e.id), saved: user.savedEventIds.includes(e.id) }
      : undefined;
}

/** The member card counts until its validity date. */
export function hasActiveMemberCard(user: UserProfile | null, now: Date): boolean {
  return Boolean(user?.memberCard && Date.parse(user.memberCard.validUntil) > now.getTime());
}

/**
 * Where the BDE's carte cotisante is presented (its page, #carte), its
 * price and the discount it gives on events, as the BDE wrote them. Price and
 * discount are null when no card is on sale.
 */
export interface MemberCardLink {
  href: string;
  price: number | null;
  /** "-20 % à -40 %", from the card's summary table. */
  discount: string | null;
}

export { euros } from "@/components/events/series-facts";
