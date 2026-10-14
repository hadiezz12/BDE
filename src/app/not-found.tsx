import type { Metadata } from "next";
import { SiteChrome } from "@/components/layout/SiteChrome";
import { StatePage } from "@/components/states/StatePage";
import { ButtonLink } from "@/components/ui/Button";
import { routes } from "@/lib/routes";

export const metadata: Metadata = { title: "Page introuvable" };

export default function NotFound() {
  return (
    <SiteChrome>
      <StatePage
        code="404"
        flicker
        kicker="Page introuvable"
        title="Cette adresse ne mène à aucune soirée."
        actions={
          <>
            <ButtonLink href={routes.events} icon="arrow-right">
              Voir l&apos;agenda
            </ButtonLink>
            <ButtonLink href={routes.home} variant="secondary">
              Retour à l&apos;accueil
            </ButtonLink>
          </>
        }
      >
        Le lien est peut-être ancien, ou la page a été retirée par l&apos;association. Essaie la recherche (Ctrl K) ou
        repars de l&apos;agenda.
      </StatePage>
    </SiteChrome>
  );
}
