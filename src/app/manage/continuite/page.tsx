import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { getAuthContext } from "@/lib/auth/context";
import { getMyMfaStatus } from "@/lib/auth/mfa";
import { getMyAccess } from "@/lib/governance/access";
import { getGovernanceHistory, getGovernanceOverview, getOrganizationGovernance } from "@/lib/governance/queries";
import { defaultMandateEnd, doneMessage, OFFICE_LABEL, toDateInput } from "@/lib/governance/labels";
import { canUseContinuity } from "@/lib/governance/workspace";
import { endOfficeMandate, proposeBdeRecovery } from "@/app/actions/governance";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { ButtonLink } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManageMain } from "@/components/manage/ManageFrame";
import { ManageGateState, ManageStatePanel } from "@/components/manage/ManageState";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { AuditList, OfficeCard, TransitionPanel } from "@/components/manage/governance/GovernanceBlocks";
import { DoneNotice, Notice } from "@/components/manage/governance/Notices";

export const metadata: Metadata = { title: "Continuité" };

/**
 * /manage/continuite — the continuity guardian (the brief's "School
 * Responsible"). Deliberately simple: is the BDE led, are associations led,
 * what is in progress; and the one power this role has, restoring a vacant
 * BDE presidency or vice-presidency (or ending a compromised one). No access
 * to associations' content, teams or applications.
 */
export default async function ContinuityPage({ searchParams }: { searchParams: Promise<{ fait?: string }> }) {
  const { fait } = await searchParams;
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") {
    return (
      <ManageMain>
        <ManageGateState reason="login" />
      </ManageMain>
    );
  }
  const access = await getMyAccess();
  if (!canUseContinuity(access)) {
    return (
      <ManageMain>
        <ManageStatePanel
          kicker="Réservé au garant·e de continuité"
          title="Cette page est réservée au ou à la garant·e de continuité du BDE."
          actions={
            <ButtonLink href={routes.manage} icon="arrow-right">
              Mes espaces
            </ButtonLink>
          }
        >
          <p>Ce rôle est attribué hors du site, par la procédure décrite dans la documentation du projet.</p>
        </ManageStatePanel>
      </ManageMain>
    );
  }

  const [overview, mfa, history] = await Promise.all([getGovernanceOverview(), getMyMfaStatus(), getGovernanceHistory(null, 40)]);
  if (!overview.ok) {
    return (
      <ManageMain>
        <Notice tone="danger" icon="alert" title="La situation n'a pas pu être chargée." />
      </ManageMain>
    );
  }
  const o = overview.data;
  const bde = await getOrganizationGovernance(o.bde.organization_id);
  const g = bde.ok ? bde.data : null;
  const vacant = o.bde.offices.filter((office) => !office.holder);

  return (
    <ManageMain>
      <div data-accent="bleu" className="flex flex-col gap-10">
        <ManagePageHeader
          kicker="Continuité"
          title="Continuité du BDE"
          description={
            <p>
              Ton rôle&nbsp;: que le BDE ne reste jamais sans direction. Tu ne gères ni les assos, ni leurs contenus, ni leurs
              candidatures&nbsp;; tu peux seulement rétablir une présidence ou une vice-présidence du BDE vacante.
            </p>
          }
        />

        <DoneNotice message={doneMessage(fait)} />
        <StatGroup label="Situation de la plateforme">
          <StatTile label="Présidence du BDE" value={o.bde.offices[0]?.holder ? "Active" : "Vacante"} tone={o.bde.offices[0]?.holder ? "ok" : "danger"} />
          <StatTile label="Vice-présidence du BDE" value={o.bde.offices[1]?.holder ? "Active" : "Vacante"} tone={o.bde.offices[1]?.holder ? "ok" : "danger"} />
          <StatTile label="Assos actives" value={o.counts.active} comparison={o.without_president.length ? `${o.without_president.length} sans présidence` : "Toutes ont une présidence"} tone={o.without_president.length ? "danger" : "neutral"} />
          <StatTile label="Passations en cours" value={o.open_transitions.length} />
        </StatGroup>

        <Notice
          tone={mfa.enabled ? "info" : "danger"}
          icon={mfa.enabled ? "check" : "alert"}
          title={mfa.enabled ? "Ton compte est protégé par la double authentification" : "Ton compte n'a pas de double authentification"}
          action={
            mfa.enabled ? undefined : (
              <ButtonLink href={routes.accountSecurity} size="sm" icon="arrow-right">
                L&apos;activer
              </ButtonLink>
            )
          }
        >
          <p>Le compte de reprise est le dernier recours du BDE&nbsp;: il doit rester le mieux protégé de la plateforme.</p>
        </Notice>

        <ManageSection title="Direction du BDE">
          <div className="grid gap-4 md:grid-cols-2">
            {o.bde.offices.map((office) => (
              <OfficeCard key={office.office} office={office}>
                {office.holder && g?.can.end_bde_office && (
                  <Disclosure summary="Mettre fin à ce mandat (compte compromis)" icon="alert" tone="danger">
                    <ActionForm action={endOfficeMandate} hidden={{ assignment_id: office.holder.assignment_id }} submitLabel="Mettre fin au mandat" variant="danger">
                      <p className="type-small text-muted">
                        Seulement en cas de compte compromis ou d&apos;abandon de poste. Le poste devient vacant tout de suite&nbsp;;
                        propose ensuite une reprise.
                      </p>
                      <Field label="Raison" hint="Obligatoire, gardée dans l'historique.">
                        {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="reason" required minLength={3} maxLength={500} className="min-h-20" />}
                      </Field>
                    </ActionForm>
                  </Disclosure>
                )}
              </OfficeCard>
            ))}
          </div>
        </ManageSection>

        <ManageSection title="Reprise d'urgence">
          {g?.transition ? (
            <TransitionPanel transition={g.transition} back={routes.manageContinuity} />
          ) : vacant.length === 0 ? (
            <ManageEmpty icon="check" title="Rien à reprendre">
              <p>Les deux postes de direction du BDE sont occupés. Une reprise n&apos;est possible que pour un poste vacant.</p>
            </ManageEmpty>
          ) : vacant.length === 2 ? (
            <ManageEmpty icon="alert" title="Les deux postes sont vacants">
              <p>
                Une reprise depuis le site suppose qu&apos;un des deux postes reste occupé. Quand les deux sont vacants, la reprise passe par la
                procédure hors ligne de la documentation (docs/backend/governance.md), avec la personne qui administre le projet.
              </p>
            </ManageEmpty>
          ) : (
            g?.can.recover_bde && (
              <Disclosure summary={`Proposer une personne pour ${OFFICE_LABEL[vacant[0].office].toLowerCase()}`} icon="user" tone="primary" open>
                <ActionForm action={proposeBdeRecovery} submitLabel="Proposer" resetOnDone>
                  <p className="type-small text-muted">
                    La personne doit avoir un compte. Elle accepte depuis son espace (Invitations), avec la double authentification&nbsp;; la
                    reprise est alors immédiate. Aucun mail n&apos;est envoyé&nbsp;: préviens-la.
                  </p>
                  <div className="grid gap-4 md:grid-cols-3">
                    <Field label="Poste">
                      {({ id, describedBy }) => (
                        <Select id={id} aria-describedby={describedBy} name="office" defaultValue={vacant[0].office}>
                          {vacant.map((v) => (
                            <option key={v.office} value={v.office}>
                              {OFFICE_LABEL[v.office]}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Field label="Adresse e-mail">
                      {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="email" name="candidate_email" required autoComplete="off" spellCheck={false} />}
                    </Field>
                    <Field label="Fin du mandat" hint="13 mois au plus.">
                      {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="ends_on" required defaultValue={toDateInput(defaultMandateEnd())} />}
                    </Field>
                  </div>
                  <Field label="Raison" hint="Obligatoire, gardée dans l'historique.">
                    {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="reason" required minLength={3} maxLength={500} className="min-h-20" />}
                  </Field>
                </ActionForm>
              </Disclosure>
            )
          )}
        </ManageSection>

        {o.without_president.length > 0 && (
          <ManageSection title="Assos sans présidence" count={o.without_president.length} description="C'est à la direction du BDE de nommer leur présidence ; tu n'as rien à faire ici, sauf l'alerter.">
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
              {o.without_president.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="font-semibold">{a.name}</span>
                  <StatusBadge tone="warn">Sans présidence</StatusBadge>
                </li>
              ))}
            </ul>
          </ManageSection>
        )}

        <ManageSection title="Historique" description="Les décisions de direction, de reprise et de mise en place, de toute la plateforme.">
          {history.ok ? <AuditList events={history.data} showOrganization /> : <Notice tone="danger" icon="alert" title="L'historique n'a pas pu être chargé." />}
        </ManageSection>
      </div>
    </ManageMain>
  );
}
