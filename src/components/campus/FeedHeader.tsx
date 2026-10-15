import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { weekOf, weekRangeLabel } from "./labels";

/**
 * Masthead of the fil: the title and the week it covers (today's week, a
 * plain dateline — no issue number, the fil has no back catalogue to
 * count). Shared by the page and its loading state so the header doesn't
 * flicker when a filter is clicked; `children` is the rubrique filter (or
 * its skeleton), left out while nothing has been published.
 */
export function FeedHeader({ children }: { children?: ReactNode }) {
  const week = weekOf();
  return (
    <PageHeader
      title="Le fil du campus"
      kicker={<>Semaine {weekRangeLabel(week)}</>}
      intro="Le bureau et les associations publient ici leurs annonces, leurs récaps, leurs interviews et leurs brèves."
    >
      {children}
    </PageHeader>
  );
}
