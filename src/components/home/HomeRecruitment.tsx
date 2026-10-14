import type { ApplicationItem, CampaignItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { APPLICATION_STATUS_LABEL, plural } from "@/lib/format";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CampaignRow } from "@/components/recruitment/CampaignRow";
import { findApplication } from "@/components/recruitment/campaign-facts";

/**
 * Open recruitment, most urgent first, as the index's big rows (countdown,
 * roles, seats) — three at most, the rest is one link away. A signed-in
 * student sees where their own application stands on the matching row.
 */
export function HomeRecruitment({
  campaigns,
  applications,
  index,
  max = 3,
}: {
  /** Open campaigns, already sorted by urgency (getCampaigns({ scope: "open" })). */
  campaigns: CampaignItem[];
  /** The student's applications; empty for a visitor. */
  applications: ApplicationItem[];
  index?: string;
  max?: number;
}) {
  const seats = campaigns.reduce((n, c) => n + c.seats, 0);
  const shown = campaigns.slice(0, max);
  const more = campaigns.length - shown.length;

  const noteFor = (c: CampaignItem) => {
    const mine = findApplication(applications, c.id);
    if (!mine) return undefined;
    return mine.status === "brouillon"
      ? "Ton brouillon t'attend"
      : `Ta candidature : ${APPLICATION_STATUS_LABEL[mine.status].toLowerCase()}`;
  };

  return (
    <section aria-labelledby="ca-recrute" className="wrap py-section">
      <SectionHeader
        id="ca-recrute"
        index={index}
        kicker={
          campaigns.length > 0
            ? `${plural(campaigns.length, "recrutement ouvert", "recrutements ouverts")} · ${plural(seats, "place")}`
            : "Recrutements"
        }
        title="Ça recrute"
        action={{
          href: campaigns.length > 0 ? `${routes.recruitment}?scope=open` : routes.recruitment,
          label: more > 0 ? `Les ${campaigns.length} recrutements` : "Tous les recrutements",
        }}
        description="Bureau, staff de soirée, antenne radio : sur chaque fiche, les missions, les heures par semaine et la date limite. Pas de surprise après."
      />
      {shown.length > 0 ? (
        <div className="mt-6 border-b border-line-strong">
          {shown.map((c) => (
            <CampaignRow key={c.id} campaign={c} note={noteFor(c)} />
          ))}
        </div>
      ) : (
        <EmptyState
          className="mt-8"
          title="Aucun recrutement ouvert aujourd'hui"
          actions={
            <ButtonLink href={routes.recruitment} variant="secondary" icon="arrow-right">
              Voir les prochains
            </ButtonLink>
          }
        >
          Les fiches à venir sont déjà lisibles : tu sauras ce que chaque poste demande avant l&apos;ouverture.
        </EmptyState>
      )}
    </section>
  );
}
