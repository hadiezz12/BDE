import { cx } from "@/lib/cx";
import { ordinal } from "@/lib/events/model";
import { Icon } from "@/components/ui/Icon";

/**
 * What this event is to the signed-in student: registered ("Tu es inscrit·e",
 * "Tu y étais" once it's over), on the waiting list ("Liste d'attente ·
 * 3e") and/or saved ("Enregistré"). Plain text with a
 * glyph, so it never competes with the poster's one sticker. Pages decide
 * whether to pass it (only for a student session, never for a visitor).
 */
export interface PersonalState {
  registered?: boolean;
  /** On the waiting list; `position` is the place in it when known. */
  waitlisted?: boolean;
  position?: number | null;
  saved?: boolean;
}

export function PersonalMarks({
  personal,
  past,
  className,
}: {
  personal?: PersonalState;
  past?: boolean;
  className?: string;
}) {
  if (!personal?.registered && !personal?.waitlisted && !personal?.saved) return null;
  return (
    <span className={cx("flex flex-wrap items-center gap-x-4 gap-y-1 type-small font-bold", className)}>
      {personal.registered && (
        <span className={cx("inline-flex items-center gap-1.5", past ? "text-muted" : "text-ok")}>
          <Icon name="check" size={15} strokeWidth={2.25} />
          {past ? "Tu y étais" : "Tu es inscrit·e"}
        </span>
      )}
      {personal.waitlisted && !personal.registered && !past && (
        <span className="inline-flex items-center gap-1.5 text-info">
          <Icon name="clock" size={15} />
          Liste d&apos;attente{personal.position ? ` · ${ordinal(personal.position)}` : ""}
        </span>
      )}
      {personal.saved && !personal.registered && !personal.waitlisted && (
        <span className="inline-flex items-center gap-1.5 text-fg">
          <Icon name="bookmark-filled" size={14} className="text-accent-text" />
          Enregistré
        </span>
      )}
    </span>
  );
}
