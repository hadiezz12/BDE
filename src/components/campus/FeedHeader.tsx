import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { weekOf, weekRangeLabel } from "./labels";

/**
 * Masthead of the fil: the title, this week's issue number ("N° 42") and
 * the week it covers. Shared by the page and its loading state so the
 * header doesn't flicker when a filter is clicked; `children` is the
 * rubrique filter (or its skeleton).
 */
export function FeedHeader({ children }: { children?: ReactNode }) {
  const week = weekOf();
  return (
    <PageHeader
      title="Le fil du campus"
      kicker={
        <>
          N°&nbsp;{week.number} · semaine {weekRangeLabel(week)}
        </>
      }
      intro="Récaps de soirées, interviews, annonces des assos et brèves du local : ce qui se passe à Pantin quand on n'est pas en amphi."
    >
      {children}
    </PageHeader>
  );
}
