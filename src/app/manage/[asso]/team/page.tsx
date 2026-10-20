import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { formatDateLong, formatDayShort, plural } from "@/lib/format";
import { getManageContext } from "@/lib/data/manage";
import { getOrganizationTeam, getPermissionCatalog } from "@/lib/governance/queries";
import { assignablePositions, expiringAssignments, memberTitles, myPositionKeys, permissionLabels } from "@/lib/governance/team";
import { defaultMandateEnd, MEMBERSHIP_STATUS_LABEL, toDateInput } from "@/lib/governance/labels";
import type { TeamMember } from "@/lib/governance/types";
import { inviteMember, revokeDelegation, revokeInvitation } from "@/app/actions/governance";
import { renewInvitation } from "@/app/actions/association-page";
import { cleanQuery, normalizeSearch } from "@/lib/associations/search";
import { Button } from "@/components/ui/Button";
import { FilterChips } from "@/components/ui/FilterChips";
import { Icon } from "@/components/ui/Icon";
import { Field, Input, Select } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { DataTable, type DataColumn } from "@/components/manage/DataTable";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { MfaNotice, ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";

type Params = Promise<{ asso: string }>;
type Search = Promise<{ [key: string]: string | string[] | undefined }>;

type MemberFilter = "bureau" | "postes" | "sans-poste" | "suspendus";

const FILTERS: { value: MemberFilter; label: string; test: (m: TeamMember) => boolean }[] = [
  { value: "bureau", label: "Bureau", test: (m) => m.assignments.some((a) => !a.upcoming && a.office !== null) },
  { value: "postes", label: "Avec un poste", test: (m) => m.assignments.some((a) => !a.upcoming) },
  { value: "sans-poste", label: "Sans poste", test: (m) => !m.assignments.some((a) => !a.upcoming) },
  { value: "suspendus", label: "Suspendus", test: (m) => m.status === "suspended" },
];

export const metadata: Metadata = { title: "Équipe" };

/**
 * /manage/[asso]/team — who is in the association, with which positions and
 * until when; invitations waiting for an answer; delegations in progress.
 * Every list comes from public.organization_team, which checks members.view
 * itself. Actions appear only to those whose rights allow them, and the
 * database checks them again.
 *
 * The member list filters in the URL (?q=…&filtre=bureau): a name search
 * (accents ignored) and who holds a position. A pending invitation can be
 * given 14 more days instead of being sent again.
 */
export default async function ManageTeamPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { asso } = await params;
  const sp = await searchParams;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  const { organization, can } = ctx;
  if (!can("members.view")) return <SectionDenied section="team" ctx={ctx} />;

  const [team, catalog] = await Promise.all([getOrganizationTeam(organization.id), getPermissionCatalog()]);
  if (!team.ok) return <SectionDenied section="team" ctx={ctx} code={team.code} />;
  const { members, invitations, delegations } = team.data;

  const short = organization.shortName ?? organization.name;
  const writable = !ctx.workspace.readOnly;
  const ceiling = myPositionKeys(team.data);
  const positionsOffered = can("positions.assign") ? assignablePositions(team.data, ceiling) : [];
  const expiring = expiringAssignments(team.data);
  const active = members.filter((m) => m.status === "active");
  const q = cleanQuery(sp.q);
  const words = normalizeSearch(q).split(" ").filter(Boolean);
  const filter = FILTERS.find((f) => f.value === (Array.isArray(sp.filtre) ? sp.filtre[0] : sp.filtre)) ?? null;
  const shown = members.filter(
    (m) => (!filter || filter.test(m)) && words.every((w) => normalizeSearch(`${m.name} ${memberTitles(m)}`).includes(w)),
  );
  const filtering = Boolean(q || filter);

  const columns: DataColumn<TeamMember>[] = [
    {
      key: "name",
      header: "Nom",
      primary: true,
      cell: (m) => (
        <Link href={routes.manageMember(asso, m.membership_id)} className="font-bold hover:text-assoc-text hover:underline">
          {m.name}
          {m.is_you && <span className="font-normal text-muted"> (toi)</span>}
        </Link>
      ),
    },
    {
      key: "positions",
      header: "Postes",
      cell: (m) => (
        <span className="flex flex-col">
          <span>{memberTitles(m)}</span>
          {m.assignments.some((a) => a.upcoming) && (
            <span className="type-meta text-subtle">
              À venir&nbsp;: {m.assignments.filter((a) => a.upcoming).map((a) => `${a.title} (${formatDayShort(a.starts_at)})`).join(", ")}
            </span>
          )}
          {m.delegations.length > 0 && (
            <span className="type-meta text-subtle">{plural(m.delegations.length, "délégation")} en cours</span>
          )}
        </span>
      ),
    },
    {
      key: "until",
      header: "Mandat jusqu'au",
      hideOnPhone: true,
      cell: (m) => {
        const ends = m.assignments.filter((a) => !a.upcoming).map((a) => a.ends_at).sort()[0];
        return <span className="type-meta">{ends ? formatDayShort(ends) : "—"}</span>;
      },
    },
    {
      key: "status",
      header: "Statut",
      cell: (m) => (
        <StatusBadge tone={m.status === "active" ? "ok" : "warn"}>{MEMBERSHIP_STATUS_LABEL[m.status]}</StatusBadge>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={short}
        title="Équipe"
        description={
          <p>
            Chaque membre a un compte à son nom et des postes avec une date de fin&nbsp;: quand un mandat s&apos;arrête,
            ses droits s&apos;arrêtent avec lui. Ouvre une fiche pour voir précisément ce que la personne peut faire.
          </p>
        }
      />

      {!writable && (
        <ReadOnlyNotice
          reason={
            ctx.membership.membership_status === "suspended"
              ? "membership_suspended"
              : organization.status === "archived"
                ? "organization_archived"
                : "organization_suspended"
          }
        />
      )}
      {writable && ctx.aal !== "aal2" && can("positions.assign") && (
        <MfaNotice what="Inviter quelqu'un avec un poste, attribuer un poste ou déléguer des droits" />
      )}

      <StatGroup label={`L'équipe de ${short} en chiffres`}>
        <StatTile label="Membres actifs" value={active.length} comparison={members.length > active.length ? `${members.length - active.length} suspendu·e(s)` : undefined} />
        <StatTile label="Invitations en attente" value={invitations.filter((i) => !i.expired).length} />
        <StatTile label="Mandats à renouveler" value={expiring.length} comparison="dans les 30 jours" tone={expiring.length ? "danger" : "neutral"} />
        <StatTile label="Délégations en cours" value={delegations.length} />
      </StatGroup>

      {writable && can("members.invite") && (
        <ManageSection
          title="Inviter quelqu'un"
          description="L'invitation est liée à une adresse e-mail et dure 14 jours. La personne la trouve dans son espace (Invitations) en se connectant avec cette adresse : aucun mail n'est envoyé pour l'instant, préviens-la toi-même."
        >
          <Disclosure summary="Nouvelle invitation" icon="plus" tone="primary">
            <ActionForm action={inviteMember} hidden={{ organization_id: organization.id }} submitLabel="Inviter" resetOnDone>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Adresse e-mail" hint="Celle avec laquelle la personne se connecte au site.">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} type="email" name="email" autoComplete="off" spellCheck={false} placeholder="Ex : prenom.nom@…" required />
                  )}
                </Field>
                {positionsOffered.length > 0 && (
                  <Field label="Poste proposé" optional hint="Sans poste, la personne rejoint l'asso comme membre.">
                    {({ id, describedBy }) => (
                      <Select id={id} aria-describedby={describedBy} name="position_id" defaultValue="">
                        <option value="">Membre, sans poste</option>
                        {positionsOffered.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                )}
                {positionsOffered.length > 0 && (
                  <Field label="Fin du mandat (si poste)" hint="Par défaut, la fin de l'année universitaire.">
                    {({ id, describedBy }) => (
                      <Input id={id} aria-describedby={describedBy} type="date" name="ends_on" defaultValue={toDateInput(defaultMandateEnd())} />
                    )}
                  </Field>
                )}
              </div>
            </ActionForm>
          </Disclosure>
        </ManageSection>
      )}

      <ManageSection title="Membres" count={members.length}>
        {members.length > 1 && (
          <div className="flex flex-col gap-4">
            <Form action={routes.manageTeam(asso)} role="search" className="flex max-w-xl items-stretch gap-2">
              {filter && <input type="hidden" name="filtre" value={filter.value} />}
              <label htmlFor="team-q" className="sr-only">
                Chercher un membre par nom ou par poste
              </label>
              <Input
                key={q}
                id="team-q"
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Nom ou poste"
                autoComplete="off"
                maxLength={60}
                className="min-w-0 flex-1"
              />
              <Button type="submit" variant="secondary" icon="search">
                <span className="max-sm:sr-only">Chercher</span>
              </Button>
            </Form>
            <FilterChips
              label="Filtrer les membres"
              param="filtre"
              options={[
                { value: null, label: "Tous", count: members.length },
                ...FILTERS.map((f) => ({ value: f.value, label: f.label, count: members.filter(f.test).length })).filter(
                  (o) => o.count > 0,
                ),
              ]}
              current={filter?.value ?? null}
              basePath={routes.manageTeam(asso)}
              params={{ q: q || undefined }}
            />
            {filtering && (
              <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 type-meta text-muted">
                <span role="status">{plural(shown.length, "membre trouvé", "membres trouvés")}</span>
                <Link href={routes.manageTeam(asso)} className="inline-flex min-h-10 items-center gap-1.5 type-label text-fg">
                  <Icon name="close" size={14} />
                  Tout effacer
                </Link>
              </p>
            )}
          </div>
        )}
        <DataTable
          caption={`Membres de ${organization.name}`}
          columns={columns}
          rows={shown}
          rowKey={(m) => m.membership_id}
          actions={(m) => (
            <Link href={routes.manageMember(asso, m.membership_id)} className="inline-flex min-h-9 items-center px-2 type-small font-semibold text-muted hover:text-fg">
              Fiche
            </Link>
          )}
          empty={
            filtering ? (
              <ManageEmpty icon="search" title="Personne ne correspond">
                <p>Essaie un autre nom, ou retire le filtre.</p>
              </ManageEmpty>
            ) : (
              <ManageEmpty icon="users" title="Personne dans l'équipe pour l'instant">
                <p>Les personnes invitées apparaissent ici dès qu&apos;elles acceptent leur invitation.</p>
              </ManageEmpty>
            )
          }
        />
      </ManageSection>

      {can("members.invite") && (
        <ManageSection title="Invitations en attente" count={invitations.length}>
          {invitations.length ? (
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
              {invitations.map((i) => (
                <li key={i.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{i.email}</span>
                    <span className="type-meta text-subtle">
                      {i.position_title ? `${i.position_title} jusqu'au ${formatDateLong(i.mandate_ends_at!)}` : "Membre"} · par {i.invited_by_name} ·{" "}
                      {i.expired ? "expirée" : `expire le ${formatDayShort(i.expires_at)}`}
                    </span>
                  </div>
                  {writable && (
                    <div className="flex flex-wrap items-start gap-2">
                      <ActionForm
                        action={renewInvitation}
                        hidden={{ invitation_id: i.id }}
                        submitLabel={i.expired ? "Relancer 14 jours" : "Prolonger de 14 jours"}
                        variant="secondary"
                        size="sm"
                        inline
                      />
                      <ActionForm action={revokeInvitation} hidden={{ invitation_id: i.id }} submitLabel="Annuler" variant="ghost" size="sm" inline />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <ManageEmpty icon="mail" title="Aucune invitation en attente">
              <p>Les invitations envoyées attendent ici leur réponse, 14 jours au plus.</p>
            </ManageEmpty>
          )}
        </ManageSection>
      )}

      <ManageSection
        title="Délégations en cours"
        count={delegations.length}
        description="Des droits prêtés pour une durée courte (92 jours au plus), avec une raison. Une délégation s'arrête seule à sa date de fin, ou dès que la personne qui l'a donnée perd ces droits."
      >
        {delegations.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
            {delegations.map((d) => (
              <li key={d.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold">
                    {d.delegator_name} → {d.delegate_name}
                  </span>
                  <span className="type-small text-muted">{permissionLabels(d.permissions, catalog).join(", ")}</span>
                  <span className="type-meta text-subtle">
                    Jusqu&apos;au {formatDayShort(d.ends_at)} · {d.reason}
                  </span>
                  {!d.effective && (
                    <StatusBadge tone="warn">Sans effet : la personne qui a délégué n&apos;a plus ces droits</StatusBadge>
                  )}
                </div>
                {writable && (d.delegator_is_you || d.delegate_is_you || can("delegations.manage")) && (
                  <ActionForm action={revokeDelegation} hidden={{ delegation_id: d.id }} submitLabel="Arrêter" variant="secondary" size="sm" inline />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <ManageEmpty icon="clock" title="Aucune délégation en cours">
            <p>
              Besoin d&apos;un coup de main pendant une absence&nbsp;? Depuis la fiche d&apos;un membre, tu peux lui prêter
              certains de tes droits pour quelques semaines.
            </p>
          </ManageEmpty>
        )}
      </ManageSection>
    </div>
  );
}
