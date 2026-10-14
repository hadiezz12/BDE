import { CAMPUS_TZ } from "@/lib/time";
import { Avatar } from "@/components/ui/Avatar";

/**
 * Cells of the workspace team tables (/manage/[asso]/team).
 */

/** Face (or initials in the association tint), name, and "toi" on the viewer's own line. */
export function PersonCell({ name, isYou }: { name: string; isYou?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {/* The visible name follows; the avatar's own label would repeat it. */}
      <span aria-hidden className="flex">
        <Avatar name={name} size={32} />
      </span>
      <span className="min-w-0 break-words font-bold">
        {name}
        {isYou && <span className="ml-2 type-label text-[0.65rem] text-assoc-text">toi</span>}
      </span>
    </div>
  );
}

const monthYear = new Intl.DateTimeFormat("fr-FR", { timeZone: CAMPUS_TZ, month: "short", year: "numeric" });

/** "oct. 2025" — how long someone has been around. */
export function SinceCell({ iso }: { iso: string }) {
  return (
    <time dateTime={iso} className="type-meta whitespace-nowrap">
      {monthYear.format(new Date(iso))}
    </time>
  );
}
