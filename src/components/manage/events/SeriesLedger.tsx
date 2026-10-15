import type { EventItem, EventSeries } from "@/lib/types";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { SeriesEmblem } from "@/components/events/SeriesEmblem";
import { PublicationStatusBadge } from "@/components/manage/StatusBadges";
import { DemoActionButton } from "@/components/manage/DemoActions";
import { PublicLink } from "@/components/manage/links/PublicLink";
import { eventDayLabel } from "./EventCells";

/**
 * The association's recurring events (the BDE's "8 événements de l'année")
 * as a ledger: lit emblem, number in the association's order, name and
 * subtitle, when in the year it comes back, where its dates stand, and the
 * two things the bureau does with it: add a date (PHASE 1 demo) and open its
 * public page. Dates are read from the dated events pointing to the series
 * (CampusEvent.seriesId); none is ever made up.
 *
 *   phone : emblem | name, period + dates, actions (stacked)
 *   lg    : emblem | name | period + dates | actions
 */
export function SeriesLedger({
  series,
  upcoming,
  past,
  label,
  notice,
}: {
  series: EventSeries[];
  /** Dated events of the association, drafts included, soonest first. */
  upcoming: EventItem[];
  past: EventItem[];
  /** Accessible name of the list. */
  label: string;
  /** What "Ajouter une date" says it did not do. */
  notice: string;
}) {
  return (
    <ol aria-label={label} className="divide-y divide-line rounded-md border border-line bg-raised">
      {series.map((s, i) => {
        const next = upcoming.find((e) => e.seriesId === s.id);
        const pastCount = past.filter((e) => e.seriesId === s.id).length;
        return (
          <li
            key={s.id}
            data-accent={s.accent}
            className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 gap-y-3 px-4 py-4 sm:grid-cols-[4rem_minmax(0,1fr)] sm:px-5 lg:grid-cols-[4rem_minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,15rem)] lg:items-center lg:gap-x-6"
          >
            <SeriesEmblem series={s} className="row-span-3 size-14 self-start sm:size-16 lg:row-span-1 lg:self-center" />

            <div className="flex min-w-0 flex-col gap-1">
              <p className="flex flex-wrap items-baseline gap-x-2.5 type-label text-[0.68rem]">
                <span className="text-assoc-text">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-subtle">{s.subtitle}</span>
              </p>
              <h3 className="type-card break-words">{s.name}</h3>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <p className="flex items-center gap-2 type-small text-muted">
                <Icon name="clock" size={15} className="shrink-0 text-subtle" />
                {s.period}
              </p>
              {next ? (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 type-small">
                  <span>
                    Prochaine date&nbsp;:{" "}
                    <time dateTime={next.startsAt} className="font-semibold">
                      {eventDayLabel(next)}
                    </time>
                  </span>
                  {next.publication !== "publie" && <PublicationStatusBadge status={next.publication} />}
                </p>
              ) : (
                <p className="type-small text-subtle">
                  Aucune date annoncée
                  {pastCount > 0 && <> · {plural(pastCount, "édition passée", "éditions passées")}</>}
                </p>
              )}
            </div>

            <div className="flex min-w-0 flex-wrap items-start gap-2 lg:justify-end">
              <DemoActionButton
                variant="secondary"
                size="sm"
                icon="plus"
                iconPosition="start"
                notice={notice}
                wrapperClassName="lg:items-end"
              >
                Ajouter une date
              </DemoActionButton>
              <PublicLink href={routes.event(s.slug)} title={s.name} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
