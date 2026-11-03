import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { parisDateKey } from "@/lib/time";
import { formatDateLong, formatTime } from "@/lib/format";
import { getManageContext } from "@/lib/data/manage";
import { getAnalyticsYears, getOrganizationAnalytics, logAnalyticsExport } from "@/lib/data/analytics";
import { formatRange, parsePeriod } from "@/lib/analytics/period";
import { ORGANIZATION_SECTIONS, organizationRows, pickSections } from "@/lib/analytics/csv";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { ButtonLink } from "@/components/ui/Button";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { canOpenSection } from "@/components/manage/sections";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { NotMeasured } from "@/components/manage/analytics/AnalyticsBlocks";
import { ReportTables } from "@/components/manage/analytics/ReportTables";
import { PrintButton } from "@/components/continuity/PrintButton";

type Params = Promise<{ asso: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = { title: "Rapport statistique", robots: { index: false, follow: false } };

/**
 * /manage/[asso]/analytics/rapport — a printable report of the
 * association's statistics (Phase 13), built on demand from the same
 * restricted and suppressed figures as the dashboard. Opening it needs
 * analytics.export now; each opening is recorded (who, sections, period,
 * never the figures) before anything is shown. Nothing is stored, and the
 * URL gives nothing to someone without the keys.
 */
export default async function AnalyticsReportPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { asso } = await params;
  const sp = await searchParams;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!canOpenSection("analytics", ctx.membership.permissions)) return <SectionDenied section="analytics" ctx={ctx} />;
  const back = routes.manageAnalytics(asso);
  const kicker = ctx.organization.shortName ?? ctx.organization.name;
  const fail = (title: string, text: string) => (
    <div className="flex flex-col gap-8">
      <ManagePageHeader kicker={kicker} title="Rapport statistique" />
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
  const read = await getOrganizationAnalytics(ctx.organization.id, period, period.compare);
  if (!read.ok) {
    if (read.code === "insufficient_permission") return <SectionDenied section="analytics" ctx={ctx} code={read.code} />;
    return fail("Le rapport n'a pas pu être préparé", governanceErrorMessage(read.code));
  }
  const d = read.data;
  if (!d.rights.export) {
    return fail(
      "Rapport non disponible",
      "Aucun de tes postes actuels ne permet d'exporter les statistiques de l'asso. La présidence peut te donner ce droit (« Exporter les statistiques »).",
    );
  }
  const sections = pickSections(sp.sections, ORGANIZATION_SECTIONS).filter((s) => d.rights[s]);
  if (sections.length === 0) return fail("Aucune section choisie", "Coche au moins une section que tes postes te permettent de lire.");

  // Recorded before it is shown: a refused record means no report.
  const logged = await logAnalyticsExport({ scope: "organization", organizationId: d.organization.id, kind: "report", sections, period });
  if (!logged.ok) return fail("Le rapport n'a pas pu être préparé", governanceErrorMessage(logged.code));

  const now = new Date();
  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={`Rapport statistique · ${d.organization.name}`}
        title={period.label}
        description={
          <p>
            Du {formatDateLong(`${period.from}T12:00:00Z`)} au {formatDateLong(`${period.to}T12:00:00Z`)} (jours de Paris, inclus)
            {period.compare ? `, comparé à ${period.compare.label}` : ""}. Préparé le {formatDateLong(now.toISOString())} à {formatTime(now.toISOString())}.
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
      <ReportTables rows={organizationRows(d, sections)} />
      <NotMeasured />
      <p className="type-small text-muted">
        Comptes tirés des données du site ({formatRange(period)}). « Masqué » : moins de {d.min_group_size} personnes, ou une case qui
        permettrait de retrouver une personne par soustraction. Une inscription n&apos;est pas une présence ; une candidature n&apos;est pas
        une personne (une personne peut postuler à plusieurs postes). Rapport personnel : ne le transmets qu&apos;aux personnes qui ont à
        le connaître.
      </p>
    </div>
  );
}
