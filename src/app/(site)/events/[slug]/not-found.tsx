import { StatePage } from "@/components/states/StatePage";
import { ButtonLink } from "@/components/ui/Button";
import { routes } from "@/lib/routes";

/** Unknown event slug: the shell stays, and the way on is the agenda and its 8 events of the year. */
export default function EventNotFound() {
  return (
    <StatePage
      code="404"
      kicker="Événement introuvable"
      title="Cet événement n'existe pas, ou il a changé d'adresse."
      actions={
        <ButtonLink href={routes.events} icon="arrow-right">
          Voir les 8 événements
        </ButtonLink>
      }
    >
      Le lien est peut-être incomplet, ou la page a été retirée. Les 8 événements de l&apos;année et les dates annoncées
      par le bureau sont dans l&apos;agenda.
    </StatePage>
  );
}
