import { StatePage } from "@/components/states/StatePage";
import { ButtonLink } from "@/components/ui/Button";
import { routes } from "@/lib/routes";

/** Unknown or unpublished article — rendered inside the site chrome. */
export default function CampusPostNotFound() {
  return (
    <StatePage
      code="404"
      flicker
      kicker="Article introuvable"
      title="Ce papier n'est jamais sorti de l'imprimerie."
      actions={
        <>
          <ButtonLink href={routes.campus} icon="arrow-right">
            Le fil du campus
          </ButtonLink>
          <ButtonLink href={routes.events} variant="secondary">
            Voir l&apos;agenda
          </ButtonLink>
        </>
      }
    >
      Le lien a peut-être une coquille, ou l&apos;article a été retiré. Tout ce qui est paru se trouve sur le fil du
      campus.
    </StatePage>
  );
}
