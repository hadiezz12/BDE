import { cx } from "@/lib/cx";
import { formatTime } from "@/lib/format";
import { CATEGORY_ICON, type NotificationView } from "@/lib/notifications/view";
import { Icon } from "@/components/ui/Icon";
import { NotificationActions } from "@/components/notifications/NotificationActions";
import { sinceWords } from "./account-facts";

/**
 * One notification as a ruled line: category and time in a mono running
 * head, the title, one or two sentences. Unread ones sit on a lighter slip
 * with a pink edge and a bold title, and say "non lue" to screen readers.
 * When a page wraps the list in [data-read-all] (NotificationsBoard), unread
 * ones fall back to the read look. The title is a plain link to the open
 * route (marks it read, then goes where it leads; no prefetch, so hovering
 * marks nothing). With `actions`, the line also offers read / archive.
 */
export function NotificationItem({
  notification,
  headingLevel = 3,
  when = "time",
  now = new Date(),
  actions = false,
  className,
}: {
  notification: NotificationView;
  headingLevel?: 3 | 4;
  /** "time" under a day heading ("10h"); "relative" in ungrouped lists ("hier à 17h46"). */
  when?: "time" | "relative";
  now?: Date;
  actions?: boolean;
  className?: string;
}) {
  const H = headingLevel === 3 ? "h3" : "h4";
  const n = notification;
  const unread = !n.read;
  const important = n.importance !== "normal";

  return (
    <article
      className={cx(
        "group/note focus-ring-within relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-t border-line py-4 pl-4 pr-3 transition-colors hover:bg-raised sm:pl-5",
        unread ? "bg-raised in-data-[read-all]:bg-transparent" : "",
        className,
      )}
    >
      {unread && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-accent in-data-[read-all]:hidden" />}
      <div className="flex min-w-0 flex-col gap-1">
        <p
          className={cx(
            "flex flex-wrap items-center gap-x-2 gap-y-1 type-label",
            unread ? "text-accent-text in-data-[read-all]:text-muted" : "text-muted",
          )}
        >
          <Icon name={CATEGORY_ICON[n.category]} size={14} />
          {n.categoryLabel}
          {n.organization && (
            <>
              <span aria-hidden className="text-subtle">
                ·
              </span>
              <span className="normal-case tracking-normal">{n.organization}</span>
            </>
          )}
          <span aria-hidden className="text-subtle">
            ·
          </span>
          <time dateTime={n.createdAt} className="font-normal normal-case tracking-normal">
            {when === "time" ? formatTime(n.createdAt) : sinceWords(n.createdAt, now)}
          </time>
          {important && (
            <span className="rounded-xs border border-current px-1 py-px text-[0.68rem] leading-none">
              {n.importance === "critical" ? "Urgent" : "Important"}
            </span>
          )}
          {unread && <span className="sr-only in-data-[read-all]:hidden">, non lue</span>}
        </p>
        <H
          className={cx(
            "text-[1.0625rem] leading-snug break-words",
            unread ? "font-extrabold in-data-[read-all]:font-semibold" : "font-semibold",
          )}
        >
          <a
            href={n.href}
            className="outline-none after:absolute after:inset-0 after:content-[''] group-hover/note:underline group-hover/note:decoration-1 group-hover/note:underline-offset-4"
          >
            {n.title}
          </a>
        </H>
        {n.body && (
          <p className={cx("type-small whitespace-pre-line", unread ? "text-fg in-data-[read-all]:text-muted" : "text-muted")}>{n.body}</p>
        )}
        {actions && <NotificationActions id={n.id} read={n.read} archived={n.archived} title={n.title} />}
      </div>
      <Icon
        name="arrow-right"
        size={18}
        className="mt-6 shrink-0 text-subtle transition-transform group-hover/note:translate-x-0.5 group-hover/note:text-fg"
      />
    </article>
  );
}
