import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { getAuthContext } from "@/lib/auth/context";
import { getMyAccess } from "@/lib/governance/access";
import { canHandlePrivacy } from "@/lib/governance/workspace";
import { ButtonLink } from "@/components/ui/Button";
import { ManageMain } from "@/components/manage/ManageFrame";
import { ManageGateState, ManageStatePanel } from "@/components/manage/ManageState";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { MfaNotice, Notice } from "@/components/manage/governance/Notices";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Field, Input } from "@/components/ui/Field";
import { lookupResponsibilities } from "@/app/actions/continuity";
import { PrivacyDesk } from "@/components/manage/review/PrivacyDesk";

export const metadata: Metadata = { title: "Données des candidat·es" };

/**
 * /manage/donnees — the privacy officer's page (platform role
 * privacy_officer, platform.privacy.requests). Provisioned outside the site
 * by the project owner (private.provision_privacy_officer); neither the BDE
 * offices nor the guardian hold it. Everything here needs a second factor
 * and a written reason, and is in the audit.
 */
export default async function PrivacyPage() {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") {
    return (
      <ManageMain>
        <ManageGateState reason="login" />
      </ManageMain>
    );
  }
  const access = await getMyAccess();
  if (!canHandlePrivacy(access)) {
    return (
      <ManageMain>
        <ManageStatePanel
          kicker="Réservé"
          title="Cette page est réservée à la personne chargée des demandes sur les données."
          actions={
            <ButtonLink href={routes.manage} icon="arrow-right">
              Mes espaces
            </ButtonLink>
          }
        >
          <p>Ce rôle est attribué hors du site, par la personne responsable du projet.</p>
        </ManageStatePanel>
      </ManageMain>
    );
  }
  return (
    <ManageMain>
      <div className="flex flex-col gap-8">
        <ManagePageHeader
          kicker="Plateforme"
          title="Données des candidat·es"
          description={
            <p>
              Répondre aux demandes d&apos;accès et d&apos;effacement concernant les candidatures. À utiliser seulement sur une demande
              écrite de la personne concernée (ou une obligation légale) : chaque rapport et chaque effacement est noté, avec la raison.
            </p>
          }
        />
        {ctx.aal !== "aal2" && <MfaNotice what="Compiler un rapport ou effacer une candidature" />}
        <Notice tone="info" icon="lock" title="Ce que cette page ne fait pas">
          <p>
            Elle ne donne aucun accès aux recrutements des assos en dehors d&apos;une demande. Un rapport ne s&apos;envoie pas tout seul
            : tu décides de ce qui est communiqué, et par quel moyen.
          </p>
        </Notice>
        <PrivacyDesk />
        <ManageSection
          title="Avant de supprimer un compte"
          description="Ce que la personne tient encore (postes, passations, comités, points de passation), pour faire passer ces responsabilités par les passations prévues avant de traiter la demande. Organisations et dates seulement ; la consultation est notée."
        >
          <div className="max-w-xl">
            <ActionForm action={lookupResponsibilities} submitLabel="Voir ses responsabilités en cours">
              <Field label="Adresse e-mail du compte">
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="email" name="email" required autoComplete="off" spellCheck={false} />}
              </Field>
            </ActionForm>
          </div>
        </ManageSection>
      </div>
    </ManageMain>
  );
}
