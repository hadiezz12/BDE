import { StatePage } from "@/components/states/StatePage";
import { ButtonLink } from "@/components/ui/Button";
import { routes } from "@/lib/routes";
import { agendaHref } from "@/components/events/agenda-filters";

/** Unknown event slug: the shell stays, and the way on is the agenda (or its archive). */
export default function EventNotFound() {
  return (
    <StatePage
      code="404"
      kicker="Événement introuvable"
      title="Cette soirée n'existe pas, ou elle a changé d'adresse."
      actions={
        <>
          <ButtonLink href={routes.events} icon="arrow-right">
            Voir l&apos;agenda
          </ButtonLink>
          <ButtonLink href={agendaHref({ when: "past" })} variant="secondary">
            Les événements passés
          </ButtonLink>
        </>
      }
    >
      L&apos;asso a peut-être retiré l&apos;événement, ou le lien a été coupé en route. Tout ce qui est programmé est dans
      l&apos;agenda, et ce qui est passé dans ses archives.
    </StatePage>
  );
}
