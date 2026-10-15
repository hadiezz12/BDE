import { routes } from "@/lib/routes";
import { ButtonLink } from "@/components/ui/Button";
import { ManageStatePanel } from "./ManageState";

/**
 * Production state of /manage until Phase 4: the workspace exists, but no
 * account has management rights yet. Shown to everyone, signed in or not,
 * so it never suggests that signing in would open it.
 */
export function ManageUnavailable() {
  return (
    <ManageStatePanel
      kicker="Bientôt"
      icon="lock"
      title="L'espace des bureaux ouvre bientôt."
      actions={
        <>
          <ButtonLink href={routes.associations} icon="arrow-right">
            Voir les associations
          </ButtonLink>
          <ButtonLink href={routes.account} variant="secondary">
            Mon espace
          </ButtonLink>
        </>
      }
    >
      <p>
        C&apos;est ici que les bureaux publieront leurs événements, tiendront leur page à jour et suivront leurs
        recrutements. Les droits de chaque bureau sont en cours de mise en place : en attendant, aucun compte ne peut
        gérer une association, même connecté.
      </p>
    </ManageStatePanel>
  );
}
