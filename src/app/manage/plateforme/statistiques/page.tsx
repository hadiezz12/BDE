import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { parisDateKey } from "@/lib/time";
import { getAuthContext } from "@/lib/auth/context";
import { getMyAccess, hasPlatform } from "@/lib/governance/access";
import { getAnalyticsYears, getPlatformAnalytics } from "@/lib/data/analytics";
import { parsePeriod } from "@/lib/analytics/period";
import type { PlatformSection } from "@/lib/analytics/csv";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { ButtonLink } from "@/components/ui/Button";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { PlatformDenied } from "@/components/manage/moderation/PlatformDenied";
import { FreshnessLine, PeriodBar, ViewTabs } from "@/components/manage/analytics/AnalyticsBlocks";
import { ReportForm } from "@/components/manage/analytics/ReportForm";
import {
  PlatformContent,
  PlatformEvents,
  PlatformGovernance,
  PlatformMessages,
  PlatformOverview,
  PlatformRecruitment,
  PlatformSettings,
} from "@/components/manage/analytics/PlatformViews";

type Search = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = { title: "Statistiques" };

/**
 * /manage/plateforme/statistiques — the platform's statistics (Phase 13),
 * for the BDE office holders while their mandate runs: campus-wide totals
 * and trends (platform.analytics.view), continuity (platform.governance.view)
 * and e-mail delivery health (platform.communications.monitor), each section
 * filled by the database only for the keys held now. No drill-down to a
 * person or an applicant; recruitment in suppressed totals only. The
 * threshold and recomputes need platform.analytics.configure and the second
 * factor.
 */
export default async function PlatformAnalyticsPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const [access, auth] = await Promise.all([getMyAccess(), getAuthContext()]);
  const keys = ["platform.analytics.view", "platform.governance.view", "platform.communications.monitor"];
  if (!keys.some((k) => hasPlatform(access, k))) return <PlatformDenied title="Statistiques" right="Voir les statistiques de la plateforme" />;

  const today = parisDateKey(new Date());
  const parsed = parsePeriod(sp, today, await getAnalyticsYears());
  const period = parsed.ok ? parsed.period : parsed.fallback;
  const read = await getPlatformAnalytics(period, period.compare);
  const basePath = routes.managePlatformAnalytics;
  if (!read.ok) {
    if (read.code === "insufficient_permission") {
      return <PlatformDenied title="Statistiques" right="Voir les statistiques de la plateforme" code={read.code} />;
    }
    return (
      <div className="flex flex-col gap-8">
        <ManagePageHeader kicker="Centre de contrôle BDE" title="Statistiques" />
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
    { key: "apercu", label: "Vue d'ensemble", show: d.rights.view },
    { key: "articles", label: "Articles", show: d.rights.view },
    { key: "evenements", label: "Événements", show: d.rights.view },
    { key: "recrutement", label: "Recrutement (totaux)", show: d.rights.view },
    { key: "gouvernance", label: "Gouvernance", show: d.rights.governance },
    { key: "messages", label: "Messages", show: d.rights.messages },
    { key: "reglages", label: "Réglages", show: d.rights.configure },
  ].filter((v) => v.show);
  const requested = typeof sp.vue === "string" ? sp.vue : undefined;
  const view = views.find((v) => v.key === requested) ?? views[0];
  const exportable: PlatformSection[] = (
    [
      ["associations", d.rights.view],
      ["content", d.rights.view],
      ["events", d.rights.view],
      ["recruitment", d.rights.view],
      ["governance", d.rights.governance],
      ["messages", d.rights.messages],
    ] as const
  )
    .filter(([, ok]) => ok)
    .map(([key]) => key);

  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader
        kicker="Centre de contrôle BDE"
        title="Statistiques"
        description={
          <p>
            Les grandes tendances du site, toutes assos confondues&nbsp;: des comptes, jamais des personnes. Le détail de chaque asso
            reste à son équipe ; le recrutement n&apos;apparaît qu&apos;en totaux, masqués sous le seuil de confidentialité.
          </p>
        }
      />
      {view.key !== "reglages" && (
        <>
          <PeriodBar period={period} basePath={basePath} view={view.key === views[0].key ? undefined : view.key} message={parsed.ok ? null : parsed.message} />
          <FreshnessLine freshness={d.freshness} />
        </>
      )}
      {views.length > 1 && <ViewTabs label="Vues des statistiques de la plateforme" basePath={basePath} views={views} current={view.key} period={period} />}

      {view.key === "apercu" && <PlatformOverview d={d} />}
      {view.key === "articles" && <PlatformContent d={d} period={period} />}
      {view.key === "evenements" && <PlatformEvents d={d} period={period} />}
      {view.key === "recrutement" && <PlatformRecruitment d={d} />}
      {view.key === "gouvernance" && <PlatformGovernance d={d} />}
      {view.key === "messages" && <PlatformMessages d={d} period={period} />}
      {view.key === "reglages" && <PlatformSettings d={d} aal2={auth.status === "authenticated" && auth.aal === "aal2"} today={today} />}

      {d.rights.export && exportable.length > 0 && view.key !== "reglages" && (
        <ReportForm
          reportPath={routes.managePlatformAnalyticsReport}
          exportPath={routes.managePlatformAnalyticsExport}
          period={period}
          sections={exportable}
          scope="platform"
          needsMfa={!(auth.status === "authenticated" && auth.aal === "aal2")}
        />
      )}
    </div>
  );
}
