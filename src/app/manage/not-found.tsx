import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { ButtonLink } from "@/components/ui/Button";
import { ManageMain } from "@/components/manage/ManageFrame";
import { ManageStatePanel } from "@/components/manage/ManageState";

export const metadata: Metadata = { title: "Association introuvable" };

/** Unknown /manage/[asso] slug: rendered in the workspace chrome, not the public 404. */
export default function ManageNotFound() {
  return (
    <ManageMain>
      <ManageStatePanel
        kicker="Erreur 404"
        icon="search"
        title="Aucune association à cette adresse."
        actions={
          <>
            <ButtonLink href={routes.manage} icon="arrow-right">
              Mes associations
            </ButtonLink>
            <ButtonLink href={routes.associations} variant="secondary">
              Annuaire des associations
            </ButtonLink>
          </>
        }
      >
        <p>
          Le lien est peut-être ancien, ou il y a une faute de frappe dans l&apos;adresse. Repars de tes associations,
          ou retrouve celle que tu cherches dans l&apos;annuaire.
        </p>
      </ManageStatePanel>
    </ManageMain>
  );
}
