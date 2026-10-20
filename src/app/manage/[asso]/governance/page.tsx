import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { getManageContext } from "@/lib/data/manage";
import { getGovernanceHistory, getOrganizationGovernance } from "@/lib/governance/queries";
import { defaultMandateEnd, doneMessage, toDateInput } from "@/lib/governance/labels";
import { proposeAssociationSuccession, proposeBdeSuccession } from "@/app/actions/governance";
import { Field, Input } from "@/components/ui/Field";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { DoneNotice, MfaNotice, ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import {
  AuditList,
  GuardianLine,
  OfficeCard,
  TransitionHistory,
  TransitionPanel,
} from "@/components/manage/governance/GovernanceBlocks";

type Params = Promise<{ asso: string }>;
type Search = Promise<{ fait?: string }>;

export const metadata: Metadata = { title: "Gouvernance" };

/**
 * /manage/[asso]/governance — who leads the association (or the BDE), until
 * when, the passation in progress step by step, past passations and the
 * governance history. Only the steps that belong to the viewer get a button;
 * the database decides who may do what (organization_governance's `can`).
 */
export default async function ManageGovernancePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { asso } = await params;
  const { fait } = await searchParams;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  const { organization, can } = ctx;
  if (!(can("governance.view") || can("audit.view"))) return <SectionDenied section="governance" ctx={ctx} />;

  const [governance, history] = await Promise.all([
    can("governance.view") ? getOrganizationGovernance(organization.id) : null,
    can("audit.view") ? getGovernanceHistory(organization.id, 60) : null,
  ]);
  if (governance && !governance.ok) return <SectionDenied section="governance" ctx={ctx} code={governance.code} />;
  const g = governance?.ok ? governance.data : null;
  const writable = !ctx.workspace.readOnly;
  const isBde = organization.kind === "bde";
  const canStart = writable && g && !g.transition && (g.can.propose_succession || g.can.propose_bde_succession);

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={organization.shortName ?? organization.name}
        title="Gouvernance"
        description={
          <p>
            {isBde
              ? "La présidence et la vice-présidence du BDE sont deux personnes différentes. Leur passation demande l'approbation des deux, puis l'accord des personnes choisies."
              : "La présidence change par une passation : la présidence en place propose, la personne choisie accepte. En cas d'urgence, le BDE peut intervenir."}
          </p>
        }
      />
      <DoneNotice message={doneMessage(fait)} />
      {!writable && <ReadOnlyNotice reason={organization.status === "archived" ? "organization_archived" : "organization_suspended"} />}
      {writable && ctx.aal !== "aal2" && g && (g.can.propose_succession || g.can.propose_bde_succession || g.transition?.can_approve) && (
        <MfaNotice what="Proposer ou approuver une passation" />
      )}

      {g && (
        <ManageSection title={isBde ? "Direction du BDE" : "Présidence"}>
          <div className={isBde ? "grid gap-4 md:grid-cols-2" : "grid gap-4 md:max-w-xl"}>
            {g.offices.map((o) => (
              <OfficeCard key={o.office} office={o} />
            ))}
          </div>
          {isBde && <GuardianLine guardian={g.guardian} />}
        </ManageSection>
      )}

      {g && (
        <ManageSection title="Passation en cours">
          {g.transition ? (
            <TransitionPanel transition={g.transition} readOnly={!writable} back={routes.manageGovernance(asso)} />
          ) : (
            <ManageEmpty icon="check" title="Aucune passation en cours">
              <p>
                {isBde
                  ? "La présidence ou la vice-présidence du BDE peut proposer la direction suivante."
                  : g.can.propose_succession
                    ? "Quand ton mandat touche à sa fin, propose la personne qui prendra la suite : elle devra accepter, avec la double authentification."
                    : "La présidence en place proposera la personne qui prendra la suite."}
              </p>
            </ManageEmpty>
          )}

          {canStart && g.can.propose_succession && (
            <Disclosure summary="Proposer ma succession" icon="arrow-right" tone="primary">
              <ActionForm action={proposeAssociationSuccession} hidden={{ organization_id: organization.id }} submitLabel="Proposer" resetOnDone>
                <p className="type-small text-muted">
                  La personne doit avoir un compte sur le site. Elle trouvera la proposition dans son espace (Invitations)&nbsp;;
                  prévenez-vous de vive voix, aucun mail n&apos;est envoyé. Ton mandat s&apos;arrête à la date d&apos;effet.
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  <Field label="Adresse e-mail de la personne">
                    {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="email" name="candidate_email" required autoComplete="off" spellCheck={false} />}
                  </Field>
                  <Field label="Date d'effet" optional hint="Vide : dès son accord. 6 mois au plus.">
                    {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="effective_on" />}
                  </Field>
                  <Field label="Fin du nouveau mandat" hint="13 mois au plus.">
                    {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="ends_on" required defaultValue={toDateInput(defaultMandateEnd())} />}
                  </Field>
                </div>
              </ActionForm>
            </Disclosure>
          )}

          {canStart && g.can.propose_bde_succession && (
            <Disclosure summary="Proposer la direction suivante du BDE" icon="arrow-right" tone="primary">
              <ActionForm action={proposeBdeSuccession} submitLabel="Proposer" resetOnDone>
                <p className="type-small text-muted">
                  Ensuite, chaque membre de la direction approuve (toi compris, avec le bouton qui apparaîtra ici), et les
                  deux personnes choisies acceptent, chacune avec la double authentification. Aucun mail n&apos;est envoyé.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Présidence : adresse e-mail">
                    {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="email" name="president_email" required autoComplete="off" spellCheck={false} />}
                  </Field>
                  <Field label="Vice-présidence : adresse e-mail">
                    {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="email" name="vice_president_email" required autoComplete="off" spellCheck={false} />}
                  </Field>
                  <Field label="Date d'effet" optional hint="Vide : dès la dernière étape. 6 mois au plus.">
                    {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="effective_on" />}
                  </Field>
                  <Field label="Fin des nouveaux mandats" hint="13 mois au plus.">
                    {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="ends_on" required defaultValue={toDateInput(defaultMandateEnd())} />}
                  </Field>
                </div>
              </ActionForm>
            </Disclosure>
          )}
        </ManageSection>
      )}

      {g && (
        <ManageSection title="Passations précédentes" count={g.history.length}>
          <TransitionHistory history={g.history} />
        </ManageSection>
      )}

      {history && (
        <ManageSection
          title="Historique"
          description="Toutes les actions de gestion de l'asso, dans l'ordre. Ces lignes ne peuvent être ni modifiées ni effacées depuis le site."
        >
          {history.ok ? <AuditList events={history.data} /> : <p className="type-small text-danger">L&apos;historique n&apos;a pas pu être chargé.</p>}
        </ManageSection>
      )}
    </div>
  );
}
