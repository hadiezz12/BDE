import { StatePage } from "@/components/states/StatePage";
import { ButtonLink } from "@/components/ui/Button";
import { routes } from "@/lib/routes";

/** Unknown association slug: the shell stays, and the way on is the index. */
export default function AssociationNotFound() {
  return (
    <StatePage
      code="404"
      kicker="Association introuvable"
      title="Cette asso n'a pas (ou plus) de page ici."
      actions={
        <>
          <ButtonLink href={routes.associations} icon="arrow-right">
            Toutes les assos
          </ButtonLink>
          <ButtonLink href={routes.search} variant="secondary">
            Chercher
          </ButtonLink>
        </>
      }
    >
      Le lien a peut-être changé, ou l&apos;asso a pris un autre nom. Celles qui ont déjà leur page sont sur la page
      Associations.
    </StatePage>
  );
}
