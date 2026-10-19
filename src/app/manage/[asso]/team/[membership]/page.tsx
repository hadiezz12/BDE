import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { routes } from "@/lib/routes";
import { formatDateLong, formatDayShort } from "@/lib/format";
import { getManageContext } from "@/lib/data/manage";
import { getMemberAccess, getOrganizationTeam, getPermissionCatalog } from "@/lib/governance/queries";
import { assignablePositions, myPositionKeys } from "@/lib/governance/team";
import {
  defaultDelegationEnd,
  defaultMandateEnd,
  EXPLANATION_LABEL,
  MEMBERSHIP_STATUS_LABEL,
  OFFICE_LABEL,
  PERMISSION_CATEGORY_LABEL,
  PERMISSION_CATEGORY_ORDER,
  SOURCE_LABEL,
  toDateInput,
} from "@/lib/governance/labels";
import type { MemberAccessAssignment } from "@/lib/governance/types";
import { assignPosition, createDelegation, endAssignment, setMembershipStatus } from "@/app/actions/governance";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { ButtonLink } from "@/components/ui/Button";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { PermissionPicker } from "@/components/manage/governance/PermissionPicker";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";

type Params = Promise<{ asso: string; membership: string }>;

export const metadata: Metadata = { title: "Fiche membre" };

const STATE: Record<MemberAccessAssignment["state"], { label: string; tone: StatusTone }> = {
  current: { label: "En cours", tone: "ok" },
  upcoming: { label: "À venir", tone: "info" },
  ended: { label: "Terminé", tone: "neutral" },
  cancelled: { label: "Annulé", tone: "neutral" },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /manage/[asso]/team/[membership] — one member: their positions and
 * mandates (past, current, coming), and the permission inspector: each right
 * of the association, granted or not, and why (public.member_access, which
 * only answers the member themselves and those who may see the team).
 * Then the actions the viewer's rights allow on this person.
 */
export default async function ManageMemberPage({ params }: { params: Params }) {
  const { asso, membership } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!UUID.test(membership)) notFound();
  const { organization, can } = ctx;

  const [access, team, catalog] = await Promise.all([
    getMemberAccess(membership),
    can("members.view") ? getOrganizationTeam(organization.id) : null,
    getPermissionCatalog(),
  ]);
  if (!access.ok) return <SectionDenied section="team" ctx={ctx} code={access.code} />;
  const member = access.data;
  if (member.organization_id !== organization.id) notFound();

  const writable = !ctx.workspace.readOnly;
  const teamData = team?.ok ? team.data : null;
  const ceiling = teamData ? myPositionKeys(teamData) : [];
  const offered = teamData && can("positions.assign") ? assignablePositions(teamData, ceiling) : [];
  const holdsOffice = member.assignments.some((a) => a.office && (a.state === "current" || a.state === "upcoming"));
  const active = member.status === "active";
  const byCategory = PERMISSION_CATEGORY_ORDER.map((category) => ({
    category,
    items: member.permissions.filter((p) => p.category === category),
  })).filter((g) => g.items.length > 0);
  const granted = member.permissions.filter((p) => p.result === "position" || p.result === "delegation").length;

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={organization.shortName ?? organization.name}
        title={member.is_you ? `${member.name} (toi)` : member.name}
        description={
          <p>
            {MEMBERSHIP_STATUS_LABEL[member.status]} depuis le {formatDateLong(member.joined_at)}.
            {member.status_reason && <> Motif&nbsp;: {member.status_reason}</>}
          </p>
        }
        meta={<span>{granted} droit(s) actif(s) sur {member.permissions.length}</span>}
        actions={
          <ButtonLink href={routes.manageTeam(asso)} variant="secondary" icon="arrow-left" iconPosition="start">
            Équipe
          </ButtonLink>
        }
      />

      <ManageSection title="Postes et mandats" count={member.assignments.length}>
        {member.assignments.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
            {member.assignments.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">
                    {a.title}
                    {a.office && <span className="ml-2 type-meta font-normal text-subtle">{OFFICE_LABEL[a.office]}</span>}
                  </span>
                  <StatusBadge tone={STATE[a.state].tone}>{STATE[a.state].label}</StatusBadge>
                </div>
                <p className="type-small text-muted">
                  Du {formatDayShort(a.starts_at)} au {formatDateLong(a.ends_at)} · {SOURCE_LABEL[a.source] ?? a.source}
                </p>
                {writable && can("positions.assign") && !a.office && (a.state === "current" || a.state === "upcoming") && (
                  <Disclosure summary={a.state === "upcoming" ? "Annuler ce mandat" : "Mettre fin à ce mandat"} icon="close" tone="danger">
                    <ActionForm action={endAssignment} hidden={{ assignment_id: a.id }} submitLabel="Confirmer la fin" variant="danger">
                      <p className="type-small text-muted">
                        Les droits de ce poste s&apos;arrêtent tout de suite pour {member.name}. L&apos;historique garde la trace.
                      </p>
                      <Field label="Raison" optional>
                        {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="reason" maxLength={500} placeholder="Ex : fin de mission" />}
                      </Field>
                    </ActionForm>
                  </Disclosure>
                )}
                {a.office && (a.state === "current" || a.state === "upcoming") && (
                  <p className="type-small text-subtle">
                    Mandat protégé&nbsp;: il change par une passation (Gouvernance), jamais depuis cette fiche.
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <ManageEmpty icon="user" title="Aucun poste">
            <p>Membre de l&apos;asso, sans poste. Un poste lui donnerait des droits, jusqu&apos;à la date de fin choisie.</p>
          </ManageEmpty>
        )}

        {writable && active && !member.is_you && offered.length > 0 && (
          <Disclosure summary="Attribuer un poste" icon="plus" tone="primary">
            <ActionForm action={assignPosition} hidden={{ membership_id: member.membership_id }} submitLabel="Attribuer" resetOnDone>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="Poste">
                  {({ id, describedBy }) => (
                    <Select id={id} aria-describedby={describedBy} name="position_id" required defaultValue="">
                      <option value="" disabled>
                        Choisir…
                      </option>
                      {offered.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Début" optional hint="Vide : tout de suite.">
                  {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="starts_on" />}
                </Field>
                <Field label="Fin du mandat" hint="25 mois au plus.">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} type="date" name="ends_on" required defaultValue={toDateInput(defaultMandateEnd())} />
                  )}
                </Field>
              </div>
              <p className="type-small text-subtle">
                Seuls les postes dont tu as toi-même tous les droits sont proposés. La présidence ne s&apos;attribue pas ici.
              </p>
            </ActionForm>
          </Disclosure>
        )}
      </ManageSection>

      <ManageSection
        title="Ce que cette personne peut faire"
        description="Pour chaque droit de l'asso : accordé ou non, et pourquoi. Calculé à l'instant par la base de données, comme pour chaque action."
      >
        <div className="flex flex-col gap-5">
          {byCategory.map(({ category, items }) => (
            <div key={category} className="flex flex-col gap-1.5">
              <p className="type-label text-subtle">{PERMISSION_CATEGORY_LABEL[category] ?? category}</p>
              <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
                {items.map((p) => {
                  const ok = p.result === "position" || p.result === "delegation";
                  return (
                    <li key={p.key} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                      <span className="flex items-center gap-2 font-semibold">
                        <Icon name={ok ? "check" : "close"} size={16} className={ok ? "text-ok" : "text-subtle"} label={ok ? "Oui" : "Non"} />
                        {p.label}
                        {!p.module_ready && <span className="type-meta font-normal text-subtle">module à venir</span>}
                      </span>
                      <span className={ok ? "type-small text-ok" : "type-small text-muted"}>
                        {EXPLANATION_LABEL[p.result] ?? p.result}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </ManageSection>

      {writable && active && !member.is_you && can("delegations.manage") && ceiling.length > 0 && (
        <ManageSection
          title="Déléguer des droits"
          description="Prête certains de tes droits à cette personne, pour une absence ou un coup de main. 92 jours au plus, avec une raison ; la délégation s'arrête dès que tu perds ces droits."
        >
          <Disclosure summary="Nouvelle délégation" icon="clock" tone="primary">
            <ActionForm
              action={createDelegation}
              hidden={{ organization_id: organization.id, delegate_membership_id: member.membership_id }}
              submitLabel="Déléguer"
              resetOnDone
            >
              <PermissionPicker catalog={catalog} selected={[]} ceiling={ceiling} mode="delegation" legend="Droits prêtés" />
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Jusqu'au" hint="92 jours au plus.">
                  {({ id, describedBy }) => (
                    <Input
                      id={id}
                      aria-describedby={describedBy}
                      type="date"
                      name="ends_on"
                      required
                      defaultValue={toDateInput(defaultDelegationEnd())}
                    />
                  )}
                </Field>
                <Field label="Début" optional hint="Vide : tout de suite.">
                  {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="starts_on" />}
                </Field>
              </div>
              <Field label="Raison" hint="Elle reste dans l'historique de l'asso.">
                {({ id, describedBy }) => (
                  <Textarea id={id} aria-describedby={describedBy} name="reason" required minLength={3} maxLength={500} placeholder="Ex : intérim pendant mon semestre à l'étranger" className="min-h-20" />
                )}
              </Field>
            </ActionForm>
          </Disclosure>
        </ManageSection>
      )}

      {writable && !member.is_you && can("members.manage") && (
        <ManageSection title="Statut dans l'asso">
          {holdsOffice ? (
            <p className="type-small text-muted">
              Cette personne occupe la présidence&nbsp;: elle ne peut être suspendue ou retirée qu&apos;après une passation,
              ou par le BDE en urgence.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {member.status === "suspended" ? (
                <Disclosure summary="Réactiver" icon="check" tone="primary">
                  <ActionForm action={setMembershipStatus} hidden={{ membership_id: member.membership_id, status: "active" }} submitLabel="Réactiver">
                    <p className="type-small text-muted">Ses postes encore en cours retrouvent leurs droits.</p>
                  </ActionForm>
                </Disclosure>
              ) : (
                <Disclosure summary="Suspendre" icon="lock" tone="danger">
                  <ActionForm action={setMembershipStatus} hidden={{ membership_id: member.membership_id, status: "suspended" }} submitLabel="Suspendre" variant="danger">
                    <p className="type-small text-muted">
                      Plus aucun droit dans l&apos;asso tant que dure la suspension&nbsp;; ses mandats restent en place.
                    </p>
                    <Field label="Raison">
                      {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="reason" required minLength={3} maxLength={500} />}
                    </Field>
                  </ActionForm>
                </Disclosure>
              )}
              <Disclosure summary="Retirer de l'asso" icon="logout" tone="danger">
                <ActionForm action={setMembershipStatus} hidden={{ membership_id: member.membership_id, status: "ended" }} submitLabel="Retirer définitivement" variant="danger">
                  <p className="type-small text-muted">
                    Ses mandats sont terminés et ses délégations arrêtées. Pour revenir, il lui faudra une nouvelle invitation.
                  </p>
                  <Field label="Raison">
                    {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="reason" required minLength={3} maxLength={500} />}
                  </Field>
                </ActionForm>
              </Disclosure>
            </div>
          )}
        </ManageSection>
      )}

      {member.is_you && !holdsOffice && organization.status !== "archived" && (
        <ManageSection title="Quitter l'asso">
          <Disclosure summary="Quitter l'asso" icon="logout" tone="danger">
            <ActionForm action={setMembershipStatus} hidden={{ membership_id: member.membership_id, status: "ended" }} submitLabel="Quitter" variant="danger">
              <p className="type-small text-muted">
                Tes postes et tes délégations s&apos;arrêtent maintenant. Pour revenir, il te faudra une nouvelle invitation.
              </p>
              <Field label="Un mot pour l'équipe" optional>
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="reason" maxLength={500} />}
              </Field>
            </ActionForm>
          </Disclosure>
        </ManageSection>
      )}
    </div>
  );
}
