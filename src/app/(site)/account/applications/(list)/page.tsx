import type { Metadata } from "next";
import type { ApplicationStatus } from "@/lib/types";
import { routes } from "@/lib/routes";
import { APPLICATION_STATUS_LABEL, plural } from "@/lib/format";
import { getSession } from "@/lib/demo-session";
import { getApplications } from "@/lib/data/users";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { APPLICATION_TONE } from "@/components/recruitment/campaign-facts";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApplicationRow } from "@/components/account/ApplicationRow";
import { isOngoing } from "@/components/account/account-facts";

export const metadata: Metadata = {
  title: "Mes candidatures",
  description: "Où en sont tes candidatures aux assos, et la prochaine étape de chacune.",
};

/** The path an application usually takes, explained once, in the margin. */
const PATH: Array<{ status: ApplicationStatus; detail: string }> = [
  { status: "brouillon", detail: "Enregistrée chez toi, pas encore envoyée." },
  { status: "envoyee", detail: "Le bureau de l'asso l'a reçue." },
  { status: "en-revue", detail: "Le bureau lit les candidatures. Pas de nouvelles, pas de mauvaises nouvelles." },
  { status: "entretien", detail: "La date et le lieu sont dans ta candidature, et dans tes notifications." },
  { status: "acceptee", detail: "Bienvenue dans l'équipe. Le bureau te dit la suite." },
  { status: "refusee", detail: "Pas pour cette fois. Si le bureau a laissé un mot, il est dans ta candidature." },
];

/**
 * Mes candidatures: the ones still moving first, each with its status in
 * words and the next step (date, place) when there is one; finished ones
 * below. A short legend of the statuses sits in the margin.
 */
export default async function AccountApplicationsPage() {
  const { user } = await getSession();
  if (!user) return null;

  const now = new Date();
  const applications = await getApplications(user.id);
  const ongoing = applications.filter(isOngoing);
  const done = applications.filter((a) => !isOngoing(a));

  return (
    <>
      <PageHeader
        variant="document"
        kicker="Mon espace"
        title="Mes candidatures"
        intro="Où en est chacune, et ce qui vient ensuite. Les plus récemment mises à jour en haut."
        meta={
          applications.length > 0 ? (
            <>
              <span>{plural(ongoing.length, "en cours", "en cours")}</span>
              <span>{plural(done.length, "terminée", "terminées")}</span>
            </>
          ) : undefined
        }
      />

      <div className="wrap grid gap-x-8 gap-y-16 lg:grid-cols-12">
        <div className="flex flex-col gap-16 lg:col-span-8">
          {applications.length === 0 ? (
            <EmptyState
              title="Tu n'as encore candidaté nulle part."
              actions={
                <ButtonLink href={routes.recruitment} icon="arrow-right">
                  Voir les recrutements
                </ButtonLink>
              }
            >
              Les assos publieront leurs recrutements sur la page Recrutements. Quand tu envoies une candidature, tu la
              suis ici, étape par étape.
            </EmptyState>
          ) : (
            <>
              <section aria-labelledby="en-cours-titre">
                <SectionHeader id="en-cours-titre" kicker={plural(ongoing.length, "candidature", "candidatures")} title="En cours" />
                {ongoing.length > 0 ? (
                  <div className="mt-6 border-b border-line-strong">
                    {ongoing.map((a) => (
                      <ApplicationRow key={a.id} application={a} now={now} />
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    className="mt-6"
                    tone="quiet"
                    title="Plus rien en cours."
                    actions={
                      <ButtonLink href={routes.recruitment} variant="secondary" icon="arrow-right">
                        Voir les recrutements
                      </ButtonLink>
                    }
                  >
                    Toutes tes candidatures ont reçu une réponse. Les nouveaux recrutements s&apos;affichent sur la page
                    Recrutements.
                  </EmptyState>
                )}
              </section>

              {done.length > 0 && (
                <section aria-labelledby="terminees-titre">
                  <SectionHeader id="terminees-titre" kicker={plural(done.length, "candidature", "candidatures")} title="Terminées" />
                  <div className="mt-6 border-b border-line-strong">
                    {done.map((a) => (
                      <ApplicationRow key={a.id} application={a} now={now} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <aside aria-labelledby="parcours-titre" className="lg:col-span-4">
          <div className="border-2 border-fg bg-raised p-5 sm:p-6">
            <h2 id="parcours-titre" className="type-label">
              Le parcours d&apos;une candidature
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
              Tu peux retirer une candidature tant que le bureau n&apos;a pas répondu, depuis sa page.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
