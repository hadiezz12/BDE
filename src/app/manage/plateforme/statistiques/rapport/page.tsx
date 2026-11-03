import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { parisDateKey } from "@/lib/time";
import { formatDateLong, formatTime } from "@/lib/format";
import { getMyAccess, hasPlatform } from "@/lib/governance/access";
import { getAnalyticsYears, getPlatformAnalytics, logAnalyticsExport } from "@/lib/data/analytics";
import { formatRange, parsePeriod } from "@/lib/analytics/period";
import { PLATFORM_SECTIONS, pickSections, platformRows } from "@/lib/analytics/csv";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { ButtonLink } from "@/components/ui/Button";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { PlatformDenied } from "@/components/manage/moderation/PlatformDenied";
import { NotMeasured } from "@/components/manage/analytics/AnalyticsBlocks";
import { ReportTables } from "@/components/manage/analytics/ReportTables";
import { PrintButton } from "@/components/continuity/PrintButton";

type Search = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = { title: "Rapport statistique de la plateforme", robots: { index: false, follow: false } };

/**
 * /manage/plateforme/statistiques/rapport — the printable platform report
 * (Phase 13): the same figures as the dashboard, for the sections chosen
 * among those the person may read. Needs platform.analytics.view and the
 * second factor now (checked by log_analytics_export, which records the
 * report before anything is shown). Nothing is stored.
 */
export default async function PlatformAnalyticsReportPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const access = await getMyAccess();
  if (!hasPlatform(access, "platform.analytics.view")) {
    return <PlatformDenied title="Rapport statistique" right="Voir les statistiques de la plateforme" />;
  }
  const back = routes.managePlatformAnalytics;
  const fail = (title: string, text: string) => (
    <div className="flex flex-col gap-8">
      <ManagePageHeader kicker="Centre de contrôle BDE" title="Rapport statistique" />
      <ManageEmpty
        as="h2"
        icon="alert"
        title={title}
        actions={
          <ButtonLink href={back} variant="secondary" icon="arrow-left" iconPosition="start">
            Statistiques
          </ButtonLink>
        }
      >
        <p>{text}</p>
      </ManageEmpty>
    </div>
  );

  const parsed = parsePeriod(sp, parisDateKey(new Date()), await getAnalyticsYears());
  if (!parsed.ok) return fail("Période non valide", parsed.message.replace(/ : les 30 derniers jours sont affichés\.$/, "."));
  const period = parsed.period;
  const read = await getPlatformAnalytics(period, period.compare);
  if (!read.ok) return fail("Le rapport n'a pas pu être préparé", governanceErrorMessage(read.code));
  const d = read.data;
  const allowed = { associations: d.rights.view, content: d.rights.view, events: d.rights.view, recruitment: d.rights.view, governance: d.rights.governance, messages: d.rights.messages };
  const sections = pickSections(sp.sections, PLATFORM_SECTIONS).filter((s) => allowed[s]);
  if (sections.length === 0) return fail("Aucune section choisie", "Coche au moins une section que ton poste te permet de lire.");

  const logged = await logAnalyticsExport({ scope: "platform", organizationId: null, kind: "report", sections, period });
  if (!logged.ok) return fail("Le rapport n'a pas pu être préparé", governanceErrorMessage(logged.code));

  const now = new Date().toISOString();
  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker="Rapport statistique · Plateforme"
        title={period.label}
        description={
          <p>
            Du {formatDateLong(`${period.from}T12:00:00Z`)} au {formatDateLong(`${period.to}T12:00:00Z`)} (jours de Paris, inclus)
            {period.compare ? `, comparé à ${period.compare.label}` : ""}. Préparé le {formatDateLong(now)} à {formatTime(now)}.
          </p>
        }
        meta={
          <>
            <span>Seuil de confidentialité : {d.min_group_size}</span>
            <span>
              Comptes par période calculés{" "}
              {d.freshness?.data_through ? `le ${formatDateLong(d.freshness.data_through)} à ${formatTime(d.freshness.data_through)}` : ": pas encore"}
            </span>
            {d.freshness?.stale && <span className="text-warn">Calcul horaire en retard</span>}
          </>
        }
        actions={
          <>
            <PrintButton />
            <ButtonLink href={back} variant="ghost" size="sm" icon="arrow-left" iconPosition="start" className="print:hidden">
              Statistiques
            </ButtonLink>
          </>
        }
      />
      <ReportTables rows={platformRows(d, sections)} />
      <NotMeasured />
      <p className="type-small text-muted">
        Comptes de toutes les assos ({formatRange(period)}), jamais une personne. Recrutement en totaux seulement, masqués sous{" "}
        {d.min_group_size}. Rapport du BDE : ne le transmets qu&apos;aux personnes qui ont à le connaître.
      </p>
    </div>
  );
}
