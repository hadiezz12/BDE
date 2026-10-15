import type { Metadata } from "next";
import type { Applicant, CampaignItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { deadlineLabel, formatWhen, plural } from "@/lib/format";
import { dayDiff } from "@/lib/time";
import { getManageContext } from "@/lib/data/manage";
import { getCampaigns } from "@/lib/data/recruitment";
import { getApplicants } from "@/lib/data/users";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { DataTable, type DataColumn } from "@/components/manage/DataTable";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { DemoActionButton } from "@/components/manage/DemoActions";
import { PublicLink } from "@/components/manage/links/PublicLink";
import {
  CampaignPositionsCell,
  CampaignStatusCell,
  CampaignTitleCell,
  CampaignTotalCell,
  isCampaignOpen,
} from "@/components/manage/recruitment/CampaignCells";
import { ApplicantPipeline, type PipelineRow } from "@/components/manage/recruitment/ApplicantPipeline";

type Params = Promise<{ asso: string }>;

export const metadata: Metadata = { title: "Recrutement" };

const CREATE_NOTICE = "la création de campagne n'est pas encore branchée, rien n'est créé.";

/**
 * /manage/[asso]/recruitment — the association's campaigns (open, coming,
 * closed) and every application received, grouped by where it stands.
 * Drafts never reach the bureau: a student's unsent application stays theirs.
 * Moving an application to another status is demo-only in Phase 1.
 */
export default async function ManageRecruitmentPage({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;

  const { association } = ctx;
  const now = new Date();
  const short = association.shortName ?? association.name;

  const campaigns = await getCampaigns({ associationId: association.id, scope: "all" });
  const applicants = campaigns.length
    ? (await getApplicants({ campaignIds: campaigns.map((c) => c.id) })).filter((a) => a.status !== "brouillon")
    : [];

  const byCampaign = (c: CampaignItem): Applicant[] => applicants.filter((a) => a.campaignId === c.id);
  const open = campaigns.filter(isCampaignOpen);
  const live = campaigns.filter((c) => c.status !== "cloturee");
  const seatsToFill = live.reduce((n, c) => n + c.seats, 0);
  const recent = applicants.filter((a) => dayDiff(a.submittedAt, now) <= 1).length;
  const nextDeadline = [...open].sort((a, b) => Date.parse(a.closesAt) - Date.parse(b.closesAt))[0];

  const rows: PipelineRow[] = applicants.map((a) => {
    const campaign = campaigns.find((c) => c.id === a.campaignId);
    return {
      id: a.id,
      name: a.name,
      programme: a.programme,
      position: campaign?.positions.find((p) => p.id === a.positionId)?.title ?? "Poste supprimé",
      campaign: campaign?.title ?? "",
      submittedAt: a.submittedAt,
      submittedLabel: formatWhen(a.submittedAt, now),
      status: a.status,
    };
  });

  const campaignColumns: DataColumn<CampaignItem>[] = [
    {
      key: "title",
      header: "Campagne",
      primary: true,
      cell: (c) => <CampaignTitleCell campaign={c} />,
      className: "min-w-[12rem]",
    },
    { key: "status", header: "Statut", cell: (c) => <CampaignStatusCell campaign={c} now={now} /> },
    {
      key: "positions",
      header: "Postes",
      cell: (c) => <CampaignPositionsCell campaign={c} applicants={byCampaign(c)} now={now} />,
    },
    {
      key: "received",
      header: "Candidatures",
      align: "end",
      cell: (c) => <CampaignTotalCell received={byCampaign(c).length} seats={c.seats} />,
    },
  ];

  const createButton = (label: string) => (
    <DemoActionButton icon="plus" iconPosition="start" notice={CREATE_NOTICE}>
      {label}
    </DemoActionButton>
  );

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={short}
        title="Recrutement"
        description={
          <p>
            Les campagnes de {association.name} et les candidatures reçues. Une candidature que la personne n&apos;a
            pas envoyée reste chez elle&nbsp;: tu ne vois que ce qui est parti.
          </p>
        }
        actions={createButton("Nouvelle campagne")}
      />

      {campaigns.length > 0 && (
        <StatGroup label={`Recrutement de ${association.name} en chiffres`} columns={3}>
          <StatTile
            label="Campagnes ouvertes"
            value={open.length}
            tone={nextDeadline?.status === "derniere-chance" ? "accent" : "neutral"}
            comparison={
              nextDeadline
                ? `${nextDeadline.title} : ${deadlineLabel(nextDeadline.closesAt, now).toLowerCase()}`
                : "Aucune campagne ne reçoit de candidatures"
            }
          />
          <StatTile
            label="Candidatures reçues"
            value={applicants.length}
            comparison={recent > 0 ? `Dont ${recent} depuis hier` : "Aucune depuis hier"}
          />
          <StatTile
            label="Places proposées"
            value={seatsToFill}
            comparison={
              live.length > 0
                ? `Sur ${plural(live.reduce((n, c) => n + c.positions.length, 0), "poste")}${
                    live.some((c) => c.status === "a-venir") ? ", campagnes à venir comprises" : ""
                  }`
                : "Toutes les campagnes sont closes"
            }
          />
        </StatGroup>
      )}

      <ManageSection
        title="Campagnes"
        count={campaigns.length}
        description="Une campagne regroupe plusieurs postes avec une même date de clôture. Un poste peut fermer plus tôt que les autres."
      >
        <DataTable
          caption={`Campagnes de recrutement de ${association.name}`}
          columns={campaignColumns}
          rows={campaigns}
          rowKey={(c) => c.id}
          actions={(c) => <PublicLink href={routes.campaign(c.slug)} title={c.title} />}
          actionsLabel="Page publique"
          empty={
            <ManageEmpty
              icon="megaphone"
              title={`Pas de campagne pour ${short}`}
              actions={createButton("Lancer une campagne")}
              demo={CREATE_NOTICE}
            >
              <p>
                Staff de soirée, nouveau bureau, coups de main pour un week-end&nbsp;: une campagne, c&apos;est une fiche
                de poste par rôle et une date de clôture. Les campagnes que le bureau ouvre s&apos;affichent ici, et les
                candidatures reçues juste en dessous, rangées par étape.
              </p>
            </ManageEmpty>
          }
        />
      </ManageSection>

      {/* Without a campaign there is nothing to apply to: the empty state above already says where they will land. */}
      {campaigns.length > 0 && (
        <ManageSection
          title="Candidatures"
          count={applicants.length}
          description="Par étape, les plus anciennes d'abord. Le statut que tu choisis, c'est le mot que la personne lit dans son espace candidat."
        >
          {applicants.length > 0 ? (
            <ApplicantPipeline rows={rows} showCampaign={campaigns.length > 1} associationName={association.name} />
          ) : (
            <ManageEmpty icon="users" title="Aucune candidature pour l'instant">
              <p>
                {open.length > 0
                  ? "Les candidatures arrivent ici dès qu'elles sont envoyées, rangées par étape."
                  : "Ouvre une campagne : les candidatures arriveront ici dès qu'elles sont envoyées, rangées par étape."}
              </p>
            </ManageEmpty>
          )}
        </ManageSection>
      )}
    </div>
  );
}
