import type { Metadata } from "next";
import { formatDateLong } from "@/lib/format";
import { getMyAccess, hasPlatform } from "@/lib/governance/access";
import { TRANSITION_KIND_LABEL } from "@/lib/governance/labels";
import { getHandoverReport } from "@/lib/continuity/data";
import { BACKUP_KIND, BACKUP_STATUS, JOB_WORDS, NOTIFICATION_MODE, OFFICE_WORDS, SUCCESSION_STATE } from "@/lib/continuity/labels";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { Notice } from "@/components/manage/governance/Notices";
import { PlatformDenied } from "@/components/manage/moderation/PlatformDenied";
import { IssueList, when } from "@/components/continuity/ContinuityBlocks";
import { PrintButton } from "@/components/continuity/PrintButton";

export const metadata: Metadata = { title: "Rapport de passation", robots: { index: false, follow: false } };

/**
 * /manage/plateforme/continuite/passation — the BDE's handover report, as a
 * page to read, print or save as PDF: who leads now and next, which
 * associations are ready, the work in progress, the platform's health and
 * the open points. A governance summary: no CV, no note, no participant,
 * no secret.
 */
export default async function HandoverReportPage() {
  const access = await getMyAccess();
  if (!hasPlatform(access, "platform.organizations.manage")) return <PlatformDenied title="Rapport de passation" right="Gérer les assos" />;
  const report = await getHandoverReport();
  if (!report) return <Notice tone="danger" icon="alert" title="Le rapport n'a pas pu être préparé." />;
  const title = report.next_year ? `Passation ${report.current_year?.label ?? ""} → ${report.next_year.label}` : `Passation ${report.current_year?.label ?? ""}`;

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker="Rapport de passation du BDE"
        title={title}
        description={
          <p>
            Préparé le {when(report.generated_at)}, à partir des données du site. La nouvelle équipe est comptée à la date du{" "}
            {formatDateLong(report.from)}.
          </p>
        }
        actions={<PrintButton />}
      />

      <ManageSection title="Direction du BDE">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-left type-small">
            <thead>
              <tr className="border-b-2 border-fg">
                <th scope="col" className="py-2 pr-4 type-label">Poste</th>
                <th scope="col" className="py-2 pr-4 type-label">Aujourd&apos;hui</th>
                <th scope="col" className="py-2 type-label">Au {formatDateLong(report.from)}</th>
              </tr>
            </thead>
            <tbody>
              {report.bde.map((o) => (
                <tr key={o.office} className="border-b border-line">
                  <td className="py-2.5 pr-4 font-semibold">{OFFICE_WORDS[o.office] ?? o.office}</td>
                  <td className="py-2.5 pr-4">{o.current ?? "Vacant"}</td>
                  <td className="py-2.5">{o.incoming ?? <span className="text-warn">Personne encore</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report.bde_transition && (
          <p className="type-small">
            {TRANSITION_KIND_LABEL[report.bde_transition.kind as keyof typeof TRANSITION_KIND_LABEL] ?? report.bde_transition.kind} en cours,
            effet le {formatDateLong(report.bde_transition.effective_at)}&nbsp;:{" "}
            {report.bde_transition.candidates
              .map((c) => `${c.name} (${c.accepted === true ? "a accepté" : c.accepted === false ? "a refusé" : "réponse attendue"})`)
              .join(", ")}
            {report.bde_transition.approvals.length > 0 && ` · ${report.bde_transition.approvals.length} approbation(s) donnée(s)`}.
          </p>
        )}
      </ManageSection>

      <ManageSection title="Assos">
        <StatGroup label="Assos">
          <StatTile label="Assos actives" value={report.associations.total} />
          <StatTile label="Prêtes" value={report.associations.ready} tone="ok" comparison="présidence en place à cette date" />
          <StatTile label="À traiter" value={report.associations.action.length} tone={report.associations.action.length ? "danger" : "neutral"} />
        </StatGroup>
        {report.associations.action.length > 0 && (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
            {report.associations.action.map((a) => {
              const state = SUCCESSION_STATE[a.state] ?? SUCCESSION_STATE.none;
              return (
                <li key={a.slug} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                  <span className="font-semibold">{a.name}</span>
                  <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                </li>
              );
            })}
          </ul>
        )}
      </ManageSection>

      <ManageSection title="Travail en cours">
        <StatGroup label="Travail en cours">
          <StatTile label="Événements à venir" value={report.work.upcoming_events} />
          <StatTile label="Publications programmées" value={report.work.scheduled_posts} />
          <StatTile label="Recrutements ouverts" value={report.work.open_campaigns} />
        </StatGroup>
        <p className="type-small text-muted">
          Ils continuent sans la nouvelle équipe&nbsp;: une publication approuvée part à son heure, les inscriptions restent, les
          recrutements gardent leur comité. Les accès aux candidatures ne passent pas d&apos;une équipe à l&apos;autre sans nomination.
        </p>
      </ManageSection>

      <ManageSection title="Santé du site">
        <ul className="flex flex-col gap-1.5 type-small">
          <li>
            Tâches automatiques&nbsp;:{" "}
            {report.platform.jobs_not_ok.length === 0
              ? "toutes à l'heure (ou impossibles à vérifier sur cette base)."
              : `à vérifier : ${report.platform.jobs_not_ok.map((k) => JOB_WORDS[k] ?? k).join(", ")}.`}
          </li>
          <li>
            E-mails&nbsp;: {NOTIFICATION_MODE[report.platform.notification_mode] ?? report.platform.notification_mode} ·{" "}
            {report.platform.failed_deliveries_7d} non remis en 7 jours.
          </li>
          {report.platform.backups.map((b) => (
            <li key={b.kind}>
              {BACKUP_KIND[b.kind]?.label ?? b.kind}&nbsp;: {(BACKUP_STATUS[b.status] ?? BACKUP_STATUS.never).label.toLowerCase()}
              {b.checked_on ? ` (le ${formatDateLong(b.checked_on)})` : ""}.
            </li>
          ))}
          <li>Registre des comptes techniques&nbsp;: {report.platform.register_not_verified} ligne(s) non vérifiée(s).</li>
          <li>Règles de conservation non décidées&nbsp;: {report.platform.retention_unconfigured}.</li>
        </ul>
      </ManageSection>

      <ManageSection title="Points ouverts" count={report.issues.length}>
        <IssueList issues={report.issues} target="platform" empty="Aucun point ouvert au moment du rapport." />
      </ManageSection>
    </div>
  );
}
