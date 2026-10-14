import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";

/**
 * What this event is to the signed-in student: registered ("Tu es inscrit·e",
 * "Tu y étais" once it's over) and/or saved ("Enregistré"). Plain text with a
 * glyph, so it never competes with the poster's one sticker. Pages decide
 * whether to pass it (only for a student session, never for a visitor).
 */
export interface PersonalState {
  registered?: boolean;
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
  if (!personal?.registered && !personal?.saved) return null;
  return (
    <span className={cx("flex flex-wrap items-center gap-x-4 gap-y-1 type-small font-bold", className)}>
      {personal.registered && (
        <span className={cx("inline-flex items-center gap-1.5", past ? "text-muted" : "text-ok")}>
          <Icon name="check" size={15} strokeWidth={2.25} />
          {past ? "Tu y étais" : "Tu es inscrit·e"}
        </span>
      )}
      {personal.saved && !personal.registered && (
        <span className="inline-flex items-center gap-1.5 text-fg">
          <Icon name="bookmark-filled" size={14} className="text-accent-text" />
          Enregistré
        </span>
      )}
    </span>
  );
}
