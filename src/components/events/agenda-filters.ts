import { dateParts } from "@/lib/format";
import { parisDateKey } from "@/lib/time";

/**
 * Month grouping for the agenda and the archive. The filters themselves (the
 * URL params, the periods) live in lib/events/filters.
 */

/** "Novembre" this year, "Février 2027" otherwise. */
export function monthLabel(iso: string, now = new Date()): string {
  const { monthLong } = dateParts(iso);
  const month = monthLong.charAt(0).toUpperCase() + monthLong.slice(1);
  const year = parisDateKey(iso).slice(0, 4);
  return year === parisDateKey(now).slice(0, 4) ? month : `${month} ${year}`;
}

/**
 * Consecutive month groups of an already sorted list (ascending for the
 * agenda, descending for the archive), in Paris time.
 */
export function groupByMonth<T extends { startsAt: string }>(
  list: T[],
  now = new Date(),
): Array<{ key: string; label: string; events: T[] }> {
  const groups: Array<{ key: string; label: string; events: T[] }> = [];
  for (const e of list) {
    const key = parisDateKey(e.startsAt).slice(0, 7);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      group = { key, label: monthLabel(e.startsAt, now), events: [] };
      groups.push(group);
    }
    group.events.push(e);
  }
  return groups;
}
