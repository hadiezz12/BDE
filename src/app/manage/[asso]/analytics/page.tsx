import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { parisDateKey } from "@/lib/time";
import { getManageContext } from "@/lib/data/manage";
import { getAnalyticsYears, getOrganizationAnalytics } from "@/lib/data/analytics";
import { parsePeriod } from "@/lib/analytics/period";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { ButtonLink } from "@/components/ui/Button";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { canOpenSection } from "@/components/manage/sections";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { FreshnessLine, PeriodBar, ViewTabs } from "@/components/manage/analytics/AnalyticsBlocks";
import { ReportForm } from "@/components/manage/analytics/ReportForm";
import { ContentView, EventsView, OverviewView, RecruitmentView, TeamView } from "@/components/manage/analytics/OrganizationViews";
import type { OrganizationSection } from "@/lib/analytics/csv";

type Params = Promise<{ asso: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = { title: "Statistiques" };

/**
 * /manage/[asso]/analytics — the association's statistics (Phase 13):
 * counts from the platform's own records, for a period of Paris days, each
 * view behind its own key (checked by the database at every load), small
 * groups hidden before anything leaves it. Nothing about a person, nothing
 * the platform does not measure (attendance, views, opens) shown as a number.
 */
export default async function ManageAnalyticsPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { asso } = await params;
  const sp = await searchParams;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!canOpenSection("analytics", ctx.membership.permissions)) return <SectionDenied section="analytics" ctx={ctx} />;

  const years = await getAnalyticsYears();
  const parsed = parsePeriod(sp, parisDateKey(new Date()), years);
  const period = parsed.ok ? parsed.period : parsed.fallback;
  const read = await getOrganizationAnalytics(ctx.organization.id, period, period.compare);
  const basePath = routes.manageAnalytics(asso);
  const kicker = ctx.organization.shortName ?? ctx.organization.name;

  if (!read.ok) {
    if (read.code === "insufficient_permission" || read.code === "not_authenticated") {
      return <SectionDenied section="analytics" ctx={ctx} code={read.code} />;
    }
    return (
      <div className="flex flex-col gap-8">
        <ManagePageHeader kicker={kicker} title="Statistiques" />
        <ManageEmpty
          as="h2"
          icon="alert"
          title="Les statistiques n'ont pas pu être chargées"
          actions={
            <ButtonLink href={basePath} variant="secondary" icon="arrow-right">
              Réessayer
            </ButtonLink>
          }
        >
          <p>{governanceErrorMessage(read.code)}</p>
          <p>Aucun chiffre n&apos;est affiché plutôt qu&apos;un chiffre faux.</p>
        </ManageEmpty>
      </div>
    );
  }

  const d = read.data;
  const views = [
    { key: "apercu", label: "Vue d'ensemble", show: d.rights.overview },
    { key: "articles", label: "Articles", show: d.rights.content },
    { key: "evenements", label: "Événements", show: d.rights.events },
    { key: "recrutement", label: "Recrutement", show: d.rights.recruitment || d.rights.workflow },
    { key: "equipe", label: "Équipe", show: d.rights.team },
  ].filter((v) => v.show);
  const requested = typeof sp.vue === "string" ? sp.vue : undefined;
  const view = views.find((v) => v.key === requested) ?? views[0];
  const exportable: OrganizationSection[] = (
    [
      ["overview", d.rights.overview],
      ["content", d.rights.content],
      ["events", d.rights.events],
      ["recruitment", d.rights.recruitment],
      ["workflow", d.rights.workflow],
      ["team", d.rights.team],
    ] as const
  )
    .filter(([, ok]) => ok)
    .map(([key]) => key);

  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader
        kicker={kicker}
        title="Statistiques"
        description={
          <p>
            Des comptes tirés des données du site&nbsp;: publications, inscriptions, candidatures. Jamais qui, seulement combien, et
            rien de ce que la plateforme ne mesure pas.
          </p>
        }
      />
      <PeriodBar period={period} basePath={basePath} view={view.key === views[0].key ? undefined : view.key} message={parsed.ok ? null : parsed.message} />
      <FreshnessLine freshness={d.freshness} />
      {views.length > 1 && <ViewTabs label="Vues des statistiques" basePath={basePath} views={views} current={view.key} period={period} />}

      {view.key === "apercu" && <OverviewView d={d} asso={asso} />}
      {view.key === "articles" && <ContentView d={d} period={period} />}
      {view.key === "evenements" && <EventsView d={d} period={period} asso={asso} />}
      {view.key === "recrutement" && <RecruitmentView d={d} period={period} asso={asso} />}
      {view.key === "equipe" && <TeamView d={d} asso={asso} />}

      {d.rights.export && exportable.length > 0 && (
        <ReportForm
          reportPath={routes.manageAnalyticsReport(asso)}
          exportPath={routes.manageAnalyticsExport(asso)}
          period={period}
          sections={exportable}
          scope="organization"
        />
      )}
    </div>
  );
}
