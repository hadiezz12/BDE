import { StatePage } from "@/components/states/StatePage";
import { ButtonLink } from "@/components/ui/Button";
import { routes } from "@/lib/routes";

/** Unknown campaign slug: the shell stays, and the way on is the recruitment index. */
export default function CampaignNotFound() {
  return (
    <StatePage
      code="404"
      kicker="Recrutement introuvable"
      title="Cette fiche de poste n'existe pas, ou plus."
      actions={
        <>
          <ButtonLink href={routes.recruitment} icon="arrow-right">
            Voir les recrutements
          </ButtonLink>
          <ButtonLink href={routes.associations} variant="secondary">
            Les associations
          </ButtonLink>
        </>
      }
    >
      L&apos;asso l&apos;a peut-être retirée, ou le lien a changé. Tous les recrutements en cours sont listés sur la page
      Recrutements.
    </StatePage>
  );
}
