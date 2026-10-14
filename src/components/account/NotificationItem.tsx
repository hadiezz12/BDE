import Link from "next/link";
import type { Notification } from "@/lib/types";
import { cx } from "@/lib/cx";
import { formatTime } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { NOTIFICATION_KIND_ICON, NOTIFICATION_KIND_LABEL, sinceWords } from "./account-facts";

/**
 * One notification as a ruled line: kind and time in a mono running head,
 * the title, one sentence. Unread ones sit on a lighter slip with a pink
 * edge and a bold title, and say "Non lu" to screen readers. When a page
 * wraps the list in [data-read-all] (NotificationsBoard), unread ones fall
 * back to the read look. With an href, the whole line is one link.
 */
export function NotificationItem({
  notification,
  headingLevel = 3,
  when = "time",
  now = new Date(),
  className,
}: {
  notification: Notification;
  headingLevel?: 3 | 4;
  /** "time" under a day heading ("10h"); "relative" in ungrouped lists ("hier à 17h46"). */
  when?: "time" | "relative";
  now?: Date;
  className?: string;
}) {
  const H = headingLevel === 3 ? "h3" : "h4";
  const { kind, title, body, href, read, createdAt } = notification;
  const unread = !read;

  return (
    <article
      className={cx(
        "group/note focus-ring-within relative grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 border-t border-line py-4 pl-4 pr-3 transition-colors sm:pl-5",
        unread ? "bg-raised in-data-[read-all]:bg-transparent" : "",
        href && "hover:bg-raised",
        className,
      )}
    >
      {unread && (
        <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-accent in-data-[read-all]:hidden" />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <p className={cx("flex flex-wrap items-center gap-x-2 gap-y-1 type-label", unread ? "text-accent-text in-data-[read-all]:text-muted" : "text-muted")}>
          <Icon name={NOTIFICATION_KIND_ICON[kind]} size={14} />
          {NOTIFICATION_KIND_LABEL[kind]}
          <span aria-hidden className="text-subtle">
            ·
          </span>
          <time dateTime={createdAt} className="font-normal tracking-normal normal-case">
            {when === "time" ? formatTime(createdAt) : sinceWords(createdAt, now)}
          </time>
          {unread && <span className="sr-only in-data-[read-all]:hidden">, non lue</span>}
        </p>
        <H
          className={cx(
            "leading-snug break-words",
            unread ? "text-[1.0625rem] font-extrabold in-data-[read-all]:font-semibold" : "text-[1.0625rem] font-semibold",
          )}
        >
          {href ? (
            <Link
              href={href}
              className="outline-none after:absolute after:inset-0 after:content-[''] group-hover/note:underline group-hover/note:decoration-1 group-hover/note:underline-offset-4"
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </H>
        <p className={cx("type-small", unread ? "text-fg in-data-[read-all]:text-muted" : "text-muted")}>{body}</p>
      </div>
      {href && (
        <Icon
          name="arrow-right"
          size={18}
          className="mt-6 shrink-0 text-subtle transition-transform group-hover/note:translate-x-0.5 group-hover/note:text-fg"
        />
      )}
    </article>
  );
}
