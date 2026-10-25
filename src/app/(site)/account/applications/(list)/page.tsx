import type { Metadata } from "next";
import type { ApplicationItem, ApplicationStatus } from "@/lib/types";
import { routes } from "@/lib/routes";
import { APPLICATION_STATUS_LABEL, plural } from "@/lib/format";
import { getSession } from "@/lib/session";
import { getMyApplications } from "@/lib/recruitment/me";
import { matchesFilter, type ApplicationFilter } from "@/lib/recruitment/model";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { APPLICATION_TONE } from "@/components/recruitment/campaign-facts";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChips } from "@/components/ui/FilterChips";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApplicationRow } from "@/components/account/ApplicationRow";
import { DoneNotice } from "@/components/manage/governance/Notices";

export const metadata: Metadata = {
  title: "Mes candidatures",
  description: "Tes brouillons, tes candidatures envoyées et celles que tu as retirées.",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

/** The statuses that exist today, explained once, in the margin. */
const PATH: Array<{ status: ApplicationStatus; detail: string }> = [
  { status: "brouillon", detail: "Enregistré chez toi au fur et à mesure, pas encore envoyé. L'association ne le voit pas." },
  { status: "envoyee", detail: "Reçue par le site avant la date limite. Envoyée ne veut pas dire acceptée." },
  { status: "retiree", detail: "Tu l'as retirée. Elle reste lisible ici." },
];

const FILTERS: { value: ApplicationFilter; param: string | null; label: string }[] = [
  { value: "tous", param: null, label: "Toutes" },
  { value: "brouillons", param: "brouillons", label: "Brouillons" },
  { value: "envoyees", param: "envoyees", label: "Envoyées" },
  { value: "retirees", param: "retirees", label: "Retirées" },
  { value: "closes", param: "closes", label: "Recrutements clos" },
];

const DONE: Record<string, string> = {
  "brouillon-supprime": "Brouillon supprimé, avec ses documents.",
};

/**
 * Mes candidatures: the student's own applications only (my_applications),
 * drafts first, then sent, then withdrawn. Nothing here says an application
 * was read, reviewed or answered: those steps come with the review system.
 */
export default async function AccountApplicationsPage({ searchParams }: { searchParams: SearchParams }) {
  const { user } = await getSession();
  if (!user) return null;
  const sp = await searchParams;
  const raw = Array.isArray(sp.filtre) ? sp.filtre[0] : sp.filtre;
  const filter = FILTERS.find((f) => f.param === raw)?.value ?? "tous";
  const done = DONE[(Array.isArray(sp.fait) ? sp.fait[0] : sp.fait) ?? ""] ?? null;

  const now = new Date();
  const applications = await getMyApplications();
  const shown = applications.filter((a) => matchesFilter(a, filter));
  const groups: { key: ApplicationStatus; title: string; list: ApplicationItem[] }[] = [
    { key: "brouillon", title: "Brouillons", list: shown.filter((a) => a.status === "brouillon") },
    { key: "envoyee", title: "Envoyées", list: shown.filter((a) => a.status === "envoyee") },
    { key: "retiree", title: "Retirées", list: shown.filter((a) => a.status === "retiree") },
  ];
  const count = (f: ApplicationFilter) => applications.filter((a) => matchesFilter(a, f)).length;

  return (
    <>
      <PageHeader
        variant="document"
        kicker="Mon espace"
        title="Mes candidatures"
        intro="Tes brouillons, ce que tu as envoyé, et ce que tu as retiré. Les plus récemment modifiés en haut."
        meta={
          applications.length > 0 ? (
            <>
              <span>{plural(count("brouillons"), "brouillon")}</span>
              <span>{plural(count("envoyees"), "envoyée", "envoyées")}</span>
            </>
          ) : undefined
        }
      />

      <div className="wrap grid gap-x-8 gap-y-16 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-10 lg:col-span-8">
          <DoneNotice message={done} />
          {applications.length === 0 ? (
            <EmptyState
              title="Tu n'as encore candidaté nulle part."
              actions={
                <ButtonLink href={routes.recruitment} icon="arrow-right">
                  Voir les recrutements
                </ButtonLink>
              }
            >
              Les assos publient leurs recrutements sur la page Recrutements. Quand tu commences une candidature, tu la retrouves
              ici, brouillon compris.
            </EmptyState>
          ) : (
            <>
              <FilterChips
                label="Filtrer mes candidatures"
                param="filtre"
                basePath={routes.accountApplications}
                current={FILTERS.find((f) => f.value === filter)?.param ?? null}
                options={FILTERS.map((f) => ({ value: f.param, label: f.label, count: count(f.value) }))}
              />
              {shown.length === 0 ? (
                <EmptyState tone="quiet" title="Rien dans cette liste.">
                  Choisis un autre filtre pour voir tes autres candidatures.
                </EmptyState>
              ) : (
                groups
                  .filter((g) => g.list.length > 0)
                  .map((g) => (
                    <section key={g.key} aria-labelledby={`${g.key}-titre`}>
                      <SectionHeader id={`${g.key}-titre`} kicker={plural(g.list.length, "candidature")} title={g.title} />
                      <div className="mt-6 border-b border-line-strong">
                        {g.list.map((a) => (
                          <ApplicationRow key={a.id} application={a} now={now} />
                        ))}
                      </div>
                    </section>
                  ))
              )}
            </>
          )}
        </div>

        <aside aria-labelledby="parcours-titre" className="lg:col-span-4">
          <div className="border-2 border-fg bg-raised p-5 sm:p-6">
            <h2 id="parcours-titre" className="type-label">
              Ce que dit chaque statut
            </h2>
            <ol className="mt-4 flex flex-col">
              {PATH.map((step) => (
                <li key={step.status} className="flex flex-col gap-1 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
                  <StatusBadge tone={APPLICATION_TONE[step.status]}>{APPLICATION_STATUS_LABEL[step.status]}</StatusBadge>
                  <p className="type-small text-muted">{step.detail}</p>
                </li>
              ))}
            </ol>
            <p className="mt-5 border-t border-line pt-4 type-small text-muted">
              Tu peux retirer une candidature envoyée depuis sa page. Un brouillon se supprime, avec ses documents.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
