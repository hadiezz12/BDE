import type { EventSeries } from "@/lib/types";
import { routes } from "@/lib/routes";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { SeriesBoard } from "@/components/events/SeriesBoard";

/**
 * "Les 8 événements de l'année" on the night surface, where the emblems
 * glow: the programme board, each cell a way to the event's own page.
 * When in the year, never a date — the bureau announces those.
 */
export function HomeSeries({ series, index }: { series: EventSeries[]; index?: string }) {
  if (series.length === 0) return null;
  return (
    <section aria-labelledby="les-8" className="wrap py-section">
      <SectionHeader
        id="les-8"
        index={index}
        kicker="Toute l'année"
        title={`Les ${series.length} événements de l'année`}
        action={{ href: routes.events, label: "L'agenda" }}
        description="Chaque événement a sa page dédiée. Les dates, les lieux et les tarifs sont annoncés par le bureau avant chaque édition."
      />
      <SeriesBoard series={series} className="mt-10" />
    </section>
  );
}
