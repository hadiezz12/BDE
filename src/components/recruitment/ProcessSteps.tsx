import type { RecruitmentStep } from "@/lib/types";
import { cx } from "@/lib/cx";
import { dateParts, formatDayFull } from "@/lib/format";
import { parisDateKey } from "@/lib/time";
import { StatusBadge } from "@/components/ui/StatusBadge";

/**
 * "Comment ça se passe": the steps of a campaign as an agenda, dates first
 * (condensed numerals, mono month) so a student can block the day before
 * applying. A step's date is a day ("2026-11-20", no hour). Undated steps
 * keep their running number; past steps fade and say so in words.
 */
export function ProcessSteps({ steps, now = new Date() }: { steps: RecruitmentStep[]; now?: Date }) {
  const today = parisDateKey(now);
  return (
    <ol className="flex flex-col">
      {steps.map((step, i) => {
        const past = step.date ? step.date < today : false;
        // Noon in Paris: the day itself, whatever the time zone of the server.
        const noon = step.date ? `${step.date}T12:00:00+01:00` : null;
        const d = noon ? dateParts(noon) : null;
        return (
          <li
            key={step.label}
            className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-5 border-t border-line py-6 first:border-t-0 first:pt-1 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:gap-x-8"
          >
            <div className={cx("flex flex-col gap-1", past ? "text-subtle" : "text-fg")}>
              {noon && d ? (
                <>
                  <span aria-hidden className="type-label">
                    {d.weekday}
                  </span>
                  <span aria-hidden className="type-numeral text-[2.75rem] sm:text-[3.25rem]">
                    {d.day}
                  </span>
                  <span aria-hidden className="type-label">
                    {d.month}
                  </span>
                  <span className="sr-only">{formatDayFull(noon)}</span>
                </>
              ) : (
                <span className="type-numeral text-[2.75rem] text-subtle sm:text-[3.25rem]">
                  <span className="sr-only">Étape </span>
                  {String(i + 1).padStart(2, "0")}
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className={cx("type-card", past && "text-muted")}>{step.label}</span>
                {past && <StatusBadge tone="neutral">Passé</StatusBadge>}
              </p>
              {step.detail && <p className="max-w-2xl text-muted">{step.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
