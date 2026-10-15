import { routes } from "@/lib/routes";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/Button";

/**
 * Unknown (or someone else's) application id. Stays on the paper of the
 * student space, calm: says what happened and offers the way back.
 */
export default function AccountApplicationNotFound() {
  return (
    <PageHeader
      variant="document"
      kicker="Candidature introuvable"
      title="Cette candidature n'est pas dans ton espace."
      intro="Le lien est peut-être incomplet, ou il mène à la candidature de quelqu'un d'autre. Toutes les tiennes sont listées dans Mes candidatures."
    >
      <div className="mt-3 flex flex-wrap gap-3">
        <ButtonLink href={routes.accountApplications} icon="arrow-right">
          Mes candidatures
        </ButtonLink>
        <ButtonLink href={routes.recruitment} variant="secondary">
          Les recrutements
        </ButtonLink>
      </div>
    </PageHeader>
  );
}
