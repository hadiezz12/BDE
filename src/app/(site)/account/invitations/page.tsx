import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { formatDateLong, formatDayShort } from "@/lib/format";
import { requireUser } from "@/lib/auth/context";
import { getMyAccess } from "@/lib/governance/access";
import { getGovernanceInbox, getPermissionCatalog } from "@/lib/governance/queries";
import { doneMessage, OFFICE_LABEL, TRANSITION_KIND_LABEL } from "@/lib/governance/labels";
import { permissionLabels } from "@/lib/governance/team";
import { approveBdeSuccession, respondToCandidacy, respondToInvitation } from "@/app/actions/governance";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { AssociationLogo } from "@/components/associations/AssociationLogo";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { DoneNotice, Notice } from "@/components/manage/governance/Notices";

export const metadata: Metadata = {
  title: "Invitations",
  description: "Les invitations à rejoindre une asso, les présidences qu'on te propose et les approbations attendues.",
};

/**
 * Mon espace › Invitations — everything that waits for the student's own
 * answer (public.my_governance_inbox): invitations bound to their e-mail,
 * presidencies proposed to them, BDE approvals expected from them. In-app
 * only for now: no e-mail is sent (that is the notification phase), so the
 * page is the reliable place; nothing here expires silently without saying so.
 */
export default async function AccountInvitationsPage({ searchParams }: { searchParams: Promise<{ fait?: string }> }) {
  const { fait } = await searchParams;
  const user = await requireUser(routes.accountInvitations);
  const [inbox, catalog, access] = await Promise.all([getGovernanceInbox(), getPermissionCatalog(), getMyAccess()]);
  const data = inbox.ok ? inbox.data : { invitations: [], candidacies: [], approvals: [] };
  const bde = access?.organizations.find((o) => o.kind === "bde");
  const approvalsHref = access?.is_guardian && !bde ? routes.manageContinuity : bde ? routes.manageGovernance(bde.slug) : routes.manage;

  return (
    <>
      <PageHeader
        variant="document"
        kicker="Mon espace"
        title="Invitations"
        intro="Les assos qui t'invitent, les présidences qu'on te propose, et les approbations qu'on attend de toi."
      />

      <div className="wrap flex max-w-4xl flex-col gap-16">
        <DoneNotice message={doneMessage(fait)} />
        {!inbox.ok && (
          <Notice tone="danger" icon="alert" title="Tes invitations n'ont pas pu être chargées.">
            <p>Réessaie dans un instant.</p>
          </Notice>
        )}

        <section aria-labelledby="invitations-titre">
          <SectionHeader id="invitations-titre" index="01" kicker="Associations" title="Invitations à rejoindre" />
          <div className="mt-8 flex flex-col gap-4">
            {data.invitations.length ? (
              data.invitations.map((i) => (
                <article key={i.id} data-accent={i.organization.accent} className="flex flex-col gap-4 rounded-md border border-line bg-raised px-5 py-5">
                  <header className="flex items-center gap-3">
                    <AssociationLogo association={{ name: i.organization.name, accent: i.organization.accent }} size={40} />
                    <div className="min-w-0">
                      <h3 className="type-card">{i.organization.name}</h3>
                      <p className="type-meta text-subtle">
                        Invitation de {i.invited_by_name} · expire le {formatDayShort(i.expires_at)}
                      </p>
                    </div>
                  </header>
                  <p>
                    {i.position_title ? (
                      <>
                        Poste proposé&nbsp;: <strong>{i.position_title}</strong>, jusqu&apos;au {formatDateLong(i.mandate_ends_at!)}.
                      </>
                    ) : (
                      "Tu rejoindrais l'asso comme membre, sans poste de gestion."
                    )}
                  </p>
                  {i.position_permissions.length > 0 && (
                    <p className="type-small text-muted">
                      Ce poste donne&nbsp;: {permissionLabels(i.position_permissions, catalog).join(", ")}.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <ActionForm
                      action={respondToInvitation}
                      hidden={{ invitation_id: i.id, accept: "1", organization_slug: i.organization.slug }}
                      submitLabel="Accepter"
                      submitIcon="check"
                      inline
                    />
                    <ActionForm action={respondToInvitation} hidden={{ invitation_id: i.id, accept: "0" }} submitLabel="Refuser" variant="secondary" inline />
                  </div>
                </article>
              ))
            ) : (
              <EmptyState title="Aucune invitation en attente" tone="quiet">
                <p>Quand une asso t&apos;invite avec l&apos;adresse de ce compte, l&apos;invitation t&apos;attend ici pendant 14 jours.</p>
              </EmptyState>
            )}
          </div>
        </section>

        <section aria-labelledby="presidences-titre">
          <SectionHeader id="presidences-titre" index="02" kicker="Passations" title="Présidences proposées" />
          <div className="mt-8 flex flex-col gap-4">
            {data.candidacies.length > 0 && user.aal !== "aal2" && (
              <Notice
                tone="warn"
                icon="lock"
                title="Accepter une présidence demande la double authentification"
                action={
                  <ButtonLink href={routes.accountSecurity} size="sm" variant="secondary" icon="arrow-right">
                    Activer
                  </ButtonLink>
                }
              >
                <p>Active-la dans Sécurité, puis reviens ici&nbsp;: la proposition t&apos;attend jusqu&apos;à sa date d&apos;expiration.</p>
              </Notice>
            )}
            {data.candidacies.length ? (
              data.candidacies.map((c) => (
                <article key={`${c.transition_id}-${c.office}`} data-accent={c.organization.accent} className="flex flex-col gap-4 rounded-md border border-line-strong bg-raised px-5 py-5">
                  <header className="flex items-center gap-3">
                    <AssociationLogo association={{ name: c.organization.name, accent: c.organization.accent }} size={40} />
                    <div className="min-w-0">
                      <p className="type-label text-assoc-text">{TRANSITION_KIND_LABEL[c.kind]}</p>
                      <h3 className="type-card">
                        {OFFICE_LABEL[c.office]} · {c.organization.name}
                      </h3>
                    </div>
                  </header>
                  <p>
                    Proposée par {c.proposed_by_name}. Mandat du {formatDateLong(c.effective_at)} au {formatDateLong(c.mandate_ends_at)}.
                  </p>
                  {c.reason && <p className="type-small text-muted">Raison&nbsp;: {c.reason}</p>}
                  {c.approvals_missing && (
                    <p className="type-small text-muted">
                      La direction du BDE n&apos;a pas encore tout approuvé&nbsp;: ton accord est enregistré, la passation aboutira à la
                      dernière approbation.
                    </p>
                  )}
                  <p className="type-small text-subtle">
                    Expire le {formatDayShort(c.expires_at)}. Accepter, c&apos;est prendre les droits de ce poste à la date prévue,
                    jusqu&apos;à la fin du mandat.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <ActionForm action={respondToCandidacy} hidden={{ transition_id: c.transition_id, accept: "1" }} submitLabel="J'accepte" submitIcon="check" inline />
                    <ActionForm action={respondToCandidacy} hidden={{ transition_id: c.transition_id, accept: "0" }} submitLabel="Je refuse" variant="secondary" inline />
                  </div>
                </article>
              ))
            ) : (
              <EmptyState title="Aucune présidence proposée" tone="quiet">
                <p>Si une présidence d&apos;asso ou du BDE te propose de prendre la suite, la proposition apparaît ici.</p>
              </EmptyState>
            )}
          </div>
        </section>

        {data.approvals.length > 0 && (
          <section aria-labelledby="approbations-titre">
            <SectionHeader id="approbations-titre" index="03" kicker="BDE" title="Approbations attendues" />
            <div className="mt-8 flex flex-col gap-4">
              {data.approvals.map((a) => (
                <article key={a.transition_id} className="flex flex-col gap-3 rounded-md border border-line-strong bg-raised px-5 py-5">
                  <h3 className="type-card">Passation du BDE</h3>
                  <p>
                    Proposée par {a.proposed_by_name} le {formatDayShort(a.created_at)}. Elle expire le {formatDayShort(a.expires_at)}.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <ActionForm action={approveBdeSuccession} hidden={{ transition_id: a.transition_id }} submitLabel="Approuver" submitIcon="check" inline />
                    <ButtonLink href={approvalsHref} variant="secondary">
                      Voir le détail
                    </ButtonLink>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
