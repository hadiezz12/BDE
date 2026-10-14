import Link from "next/link";
import type { ManageTask } from "@/lib/types";
import { cx } from "@/lib/cx";
import { dateParts, formatWhen } from "@/lib/format";
import { dayDiff } from "@/lib/time";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MANAGE_SECTIONS, activeSection } from "@/components/manage/sections";

/**
 * The bureau's to-do list on the workspace home: urgent first, then by due
 * date (getTasks order). Each line is one link to the section where the job
 * gets done. The left stub reads like a countdown ("J-2"); the plain due date
 * is always written out next to it.
 */
export function TaskList({ tasks, asso, now = new Date() }: { tasks: ManageTask[]; asso: string; now?: Date }) {
  return (
    <ol className="border-b border-line">
      {tasks.map((t) => {
        const urgent = t.priority === "haute";
        const overdue = t.due ? Date.parse(t.due) < now.getTime() : false;
        const days = t.due ? dayDiff(now, t.due) : null;
        const sectionKey = activeSection(t.href, asso);
        const section = MANAGE_SECTIONS.find((s) => s.key === sectionKey);
        const day = t.due ? dateParts(t.due) : null;

        const stub = overdue ? "!" : days === null ? "—" : days <= 0 ? "J" : `J-${days}`;
        const stubLabel = overdue ? "retard" : day ? `${day.weekday}. ${day.day}` : "sans date";

        return (
          <li
            key={t.id}
            className="group relative grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-4 border-t border-line py-4 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]"
          >
            <div aria-hidden className="flex flex-col items-start gap-1 pt-0.5">
              <span
                className={cx(
                  "type-numeral text-[2.1rem]",
                  overdue ? "text-danger" : urgent ? "text-assoc-text" : "text-fg",
                )}
              >
                {stub}
              </span>
              <span className={cx("type-label text-[0.62rem]", overdue ? "text-danger" : "text-subtle")}>
                {stubLabel}
              </span>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              {(urgent || section) && (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {urgent && <StatusBadge tone="accent">Urgent</StatusBadge>}
                  {section && <span className="type-label text-[0.68rem] text-subtle">{section.label}</span>}
                </p>
              )}
              <Link
                href={t.href}
                className="font-bold leading-snug after:absolute after:inset-0 after:content-[''] group-hover:text-assoc-text"
              >
                {t.label}
              </Link>
              {t.detail && <p className="type-small text-muted">{t.detail}</p>}
              <p className={cx("type-meta", overdue ? "font-bold text-danger" : "text-subtle")}>
                {t.due ? (
                  <>
                    {overdue ? "En retard, prévu " : "Échéance : "}
                    <time dateTime={t.due}>{formatWhen(t.due, now).toLowerCase()}</time>
                  </>
                ) : (
                  "Sans échéance"
                )}
              </p>
            </div>

            <Icon
              name="arrow-right"
              size={18}
              className="hidden self-center text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg sm:block"
            />
          </li>
        );
      })}
    </ol>
  );
}
