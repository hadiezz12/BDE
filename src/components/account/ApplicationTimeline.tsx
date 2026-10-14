import type { ApplicationItem } from "@/lib/types";
import { cx } from "@/lib/cx";
import { APPLICATION_STATUS_LABEL, formatDayShort, formatTime, formatWhen } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";

/**
 * Where an application has been, oldest first: each status with its date
 * and the bureau's note, the current one marked (in words and with a filled
 * disc in the association's colour). When a next step is planned it closes
 * the line as a dashed "à venir" stop. Colour from the nearest data-accent.
 */
export function ApplicationTimeline({
  application,
  now = new Date(),
  className,
}: {
  application: Pick<ApplicationItem, "timeline" | "nextStep" | "status">;
  now?: Date;
  className?: string;
}) {
  const steps = application.timeline;
  const next = application.nextStep;
  const upcoming = next && (!next.date || Date.parse(next.date) > now.getTime()) ? next : null;

  return (
    <ol className={cx("flex flex-col", className)}>
      {steps.map((step, i) => {
        const current = i === steps.length - 1;
        const line = !current || upcoming;
        return (
          <li key={`${step.status}-${step.at}`} className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-4 pb-7 last:pb-0">
            {line && <span aria-hidden className="absolute bottom-0 left-[0.8125rem] top-7 w-0.5 bg-line-strong" />}
            <span
              aria-hidden
              className={cx(
                "relative mt-0.5 grid size-7 place-items-center rounded-full border-2 border-fg",
                current ? "bg-assoc text-assoc-fg" : "bg-raised text-fg",
              )}
            >
              {!current && <Icon name="check" size={14} strokeWidth={2.5} />}
            </span>
            <div className="flex min-w-0 flex-col gap-1 pt-0.5">
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className={cx("font-bold", current ? "text-[1.0625rem]" : "text-fg")}>
                  {APPLICATION_STATUS_LABEL[step.status]}
                </span>
                {current && <span className="type-label text-assoc-text">Statut actuel</span>}
              </p>
              <p className="type-meta text-muted">
                <time dateTime={step.at}>
                  {formatDayShort(step.at)} · {formatTime(step.at)}
                </time>
              </p>
              {step.note && (
                <p className={cx("mt-1.5 max-w-2xl border-l-2 pl-3.5", current ? "border-assoc text-fg" : "border-line text-muted")}>
                  {step.note}
                </p>
              )}
            </div>
          </li>
        );
      })}

      {upcoming && (
        <li className="relative grid grid-cols-[1.75rem_minmax(0,1fr)] gap-x-4">
          <span aria-hidden className="mt-0.5 size-7 rounded-full border-2 border-dashed border-fg bg-raised" />
          <div className="flex min-w-0 flex-col gap-1 pt-0.5">
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-bold">{upcoming.label}</span>
              <span className="type-label text-muted">À venir</span>
            </p>
            {(upcoming.date || upcoming.location) && (
              <p className="type-meta text-muted">
                {upcoming.date && <time dateTime={upcoming.date}>{formatWhen(upcoming.date, now)}</time>}
                {upcoming.date && upcoming.location && " · "}
                {upcoming.location}
              </p>
            )}
          </div>
        </li>
      )}
    </ol>
  );
}
