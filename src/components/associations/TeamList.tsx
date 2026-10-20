import type { AccentKey, TeamMember } from "@/lib/types";
import { cx } from "@/lib/cx";
import { Avatar } from "@/components/ui/Avatar";

/**
 * The bureau, read like a programme's cast list: ruled lines, face (or
 * initials in the association's tint), name, role, and the promo as a code
 * on the right. One column in a side column, two once the container is wide
 * enough (container query, so it adapts to wherever it is placed).
 * Order is the association's own — the first line is usually the président·e.
 * A member's photo and line (bio) appear only if that member chose to show
 * them (Phase 5: membership_public_profiles); otherwise initials.
 */
export function TeamList({
  team,
  accent,
  label,
  className,
}: {
  team: TeamMember[];
  /** Tints the initials; otherwise inherited from a data-accent ancestor. */
  accent?: AccentKey;
  /** Accessible name of the list when no heading introduces it. */
  label?: string;
  className?: string;
}) {
  if (!team.length) return null;
  return (
    <div className={cx("@container", className)}>
      <ul aria-label={label} data-accent={accent} className="grid border-b border-line @xl:grid-cols-2 @xl:gap-x-8">
        {team.map((m) => (
          <li
            key={m.id}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3.5 border-t border-line py-3.5"
          >
            {/* The visible name follows; hide the avatar's own label from assistive tech. */}
            <span aria-hidden className="flex">
              <Avatar name={m.name} photo={m.avatar} size={44} />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="font-bold leading-tight break-words">{m.name}</span>
              {m.role && <span className="type-small text-muted">{m.role}</span>}
              {m.bio && <span className="type-small text-fg/85">{m.bio}</span>}
            </span>
            {m.promo ? (
              <span className="max-w-[7.5rem] text-right type-meta text-subtle">{m.promo}</span>
            ) : (
              <span aria-hidden />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
