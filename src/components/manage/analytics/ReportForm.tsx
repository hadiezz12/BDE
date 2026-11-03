import { buttonClass } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Field";
import { ManageSection } from "@/components/manage/ManagePageHeader";
import { ORGANIZATION_SECTION_LABEL, PLATFORM_SECTION_LABEL, type OrganizationSection, type PlatformSection } from "@/lib/analytics/csv";
import { formatRange, type Period } from "@/lib/analytics/period";

/**
 * "Rapport et export": the person picks among the sections they may read,
 * then opens the printable report (GET, a page that checks the right to
 * export and records the report) or downloads the CSV (POST to the export
 * route, which checks and records it too). Nothing is stored: each report
 * is built on demand from the same restricted, suppressed figures, and its
 * URL gives nothing to anyone who lacks the keys.
 */
export function ReportForm({
  reportPath,
  exportPath,
  period,
  sections,
  scope,
  needsMfa,
}: {
  reportPath: string;
  exportPath: string;
  period: Period;
  sections: (OrganizationSection | PlatformSection)[];
  scope: "organization" | "platform";
  /** Platform reports need a session with a second factor: say so before they try. */
  needsMfa?: boolean;
}) {
  const labels: Record<string, string> = scope === "organization" ? ORGANIZATION_SECTION_LABEL : PLATFORM_SECTION_LABEL;
  return (
    <ManageSection
      title="Rapport et export"
      description={`Pour la période affichée (${formatRange(period)}). Chaque rapport et chaque export est noté dans l'historique : qui, quand, quelles sections, quelle période — jamais les chiffres.`}
    >
      <form method="get" action={reportPath} className="flex flex-col gap-4 rounded-md border border-line bg-raised px-4 py-4 sm:px-5">
        {period.preset === "perso" ? (
          <>
            <input type="hidden" name="du" value={period.from} />
            <input type="hidden" name="au" value={period.to} />
          </>
        ) : (
          <input type="hidden" name="periode" value={period.preset} />
        )}
        {!period.compareOn && <input type="hidden" name="comparer" value="non" />}
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 type-label text-[0.7rem] text-subtle">Sections</legend>
          {sections.map((s) => (
            <Checkbox key={s} name="sections" value={s} defaultChecked label={labels[s]} />
          ))}
        </fieldset>
        {needsMfa && (
          <p className="type-small text-warn">
            Les rapports de la plateforme demandent une session avec la double authentification (Sécurité).
          </p>
        )}
        <div className="flex flex-wrap gap-2.5">
          <button type="submit" className={buttonClass({ variant: "secondary", size: "sm" })}>
            Ouvrir le rapport imprimable
          </button>
          <button type="submit" formAction={exportPath} formMethod="post" className={buttonClass({ variant: "secondary", size: "sm" })}>
            Télécharger le CSV
          </button>
        </div>
        <p className="type-small text-muted">
          Le CSV ne contient que des comptes, déjà masqués sous le seuil de confidentialité. Il s&apos;ouvre dans Excel, LibreOffice ou
          Google Sheets ; garde-le dans les outils {scope === "organization" ? "de l'asso" : "du BDE"}.
        </p>
      </form>
    </ManageSection>
  );
}
