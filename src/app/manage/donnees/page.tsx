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
import { getPrivacyQueue, getPublishedNotice } from "@/lib/privacy/data";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { HoldsSection, IncidentsSection, NoticeApproval, ReconcileSection, RequestQueue } from "@/components/manage/privacy/PrivacyOffice";

export const metadata: Metadata = { title: "Données personnelles" };

/**
 * /manage/donnees — the privacy officer's page (platform role
 * privacy_officer, platform.privacy.requests): data-subject requests and
 * their deadlines (Phase 14), personal-data incidents, retention holds, the
 * notice approval, the reconciliation after a restore, and the Phase 9
 * candidate report. Provisioned outside the site
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
  const aal2 = ctx.aal === "aal2";
  const [queue, notice] = aal2 ? await Promise.all([getPrivacyQueue(), getPublishedNotice()]) : [null, null];
  return (
    <ManageMain>
      <div className="flex flex-col gap-10">
        <ManagePageHeader
          kicker="Plateforme"
          title="Données personnelles"
          description={
            <p>
              Les demandes des personnes sur leurs données (accès, correction, effacement…), les incidents de données, les
              conservations exceptionnelles et la notice. Rien n&apos;est ouvert hors d&apos;une demande ou d&apos;un incident : chaque
              action demande la double authentification et est notée.
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
        {queue && !queue.ok && <Notice tone="danger" icon="alert" title={governanceErrorMessage(queue.code)} />}
        {queue?.ok && (
          <>
            <RequestQueue queue={queue.data} />
            <IncidentsSection queue={queue.data} />
            <HoldsSection queue={queue.data} />
            <NoticeApproval current={notice?.current ?? null} />
            <ReconcileSection />
          </>
        )}
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
