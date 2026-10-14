import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { ButtonLink } from "@/components/ui/Button";
import { ManageStatePanel } from "@/components/manage/ManageState";

export const metadata: Metadata = { title: "Page introuvable" };

/** notFound() from a section page: shown inside the workspace, with the section nav still beside it. */
export default function ManageSectionNotFound() {
  return (
    <ManageStatePanel
      kicker="Erreur 404"
      icon="search"
      title="Cette page n'existe pas dans l'espace de gestion."
      actions={
        <ButtonLink href={routes.manage} variant="secondary" icon="arrow-right">
          Retour à mes associations
        </ButtonLink>
      }
    >
      <p>
        L&apos;élément a peut-être été supprimé, ou le lien est incomplet. Les huit sections restent dans le menu&nbsp;:
        Accueil, Contenus, Événements, Équipe, Recrutement, Médias, Statistiques et Réglages.
      </p>
    </ManageStatePanel>
  );
}
