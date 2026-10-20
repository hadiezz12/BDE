import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { formatDateLong } from "@/lib/format";
import { getManageContext, getManageGate } from "@/lib/data/manage";
import {
  getGovernanceInbox,
  getOrganizationGovernance,
  getOrganizationTeam,
  getPermissionCatalog,
} from "@/lib/governance/queries";
import { expiringAssignments } from "@/lib/governance/team";
import {
  ORGANIZATION_STATUS_LABEL,
  PERMISSION_CATEGORY_LABEL,
  PERMISSION_CATEGORY_ORDER,
  TRANSITION_KIND_LABEL,
} from "@/lib/governance/labels";
import { Icon } from "@/components/ui/Icon";
import { ButtonLink } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { MANAGE_SECTIONS } from "@/components/manage/sections";
import { SectionLink } from "@/components/manage/home/SectionLink";
import { MfaNotice, Notice, ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { getAssociationEditor, getMyPublicProfile } from "@/lib/associations/editor";
import { getMyProfile } from "@/lib/data/profile";
import { MyPublicProfileCard, PageCard } from "@/components/manage/page-editor/HomeCards";

type Params = Promise<{ asso: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { asso } = await params;
  const gate = await getManageGate(asso);
  return { title: gate ? `Accueil · ${gate.organization.name}` : "Association introuvable" };
}

/** Keys whose use needs a second factor: handing out rights, leadership, publishing the page. */
const SENSITIVE_KEYS = [
  "positions.manage",
  "positions.assign",
  "delegations.manage",
  "governance.succession",
  "organization.page.publish",
];

/** Keys that open the public page's editor or its image library. */
const PAGE_KEYS = ["organization.settings.update", "organization.page.publish", "media.manage"];

/**
 * /manage/[asso] — the person's desk in this association: their positions
 * and mandates, what they can do here (and what is still to come), what
 * waits for them, and, for those who may see it, the team and leadership at
 * a glance. Every number is a real count from the database.
 *
 * Phase 5: where the public page stands (for its team), and every member's
 * own choice of how they appear on it.
 */
export default async function ManageHomePage({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;

  const { organization, membership, can } = ctx;
  const [catalog, team, governance, inbox, editor, myPublic, myProfile] = await Promise.all([
    getPermissionCatalog(),
    can("members.view") ? getOrganizationTeam(organization.id) : null,
    can("governance.view") ? getOrganizationGovernance(organization.id) : null,
    getGovernanceInbox(),
    PAGE_KEYS.some(can) ? getAssociationEditor(organization.id) : null,
    getMyPublicProfile(membership.membership_id),
    getMyProfile(),
  ]);

  const held = new Set(membership.permissions);
  const byCategory = PERMISSION_CATEGORY_ORDER.map((category) => ({
    category,
    items: catalog.filter((p) => p.scope === "organization" && p.category === category && held.has(p.key)),
  })).filter((g) => g.items.length > 0);

  const readOnly =
    membership.membership_status === "suspended"
      ? "membership_suspended"
      : organization.status === "suspended"
        ? "organization_suspended"
        : organization.status === "archived"
          ? "organization_archived"
          : null;
  const needsMfa = ctx.aal !== "aal2" && SENSITIVE_KEYS.some((k) => held.has(k));

  const waiting = inbox.ok
    ? [
        ...inbox.data.candidacies
          .filter((c) => c.organization.id === organization.id)
          .map((c) => ({ key: `c-${c.transition_id}`, text: `On te propose la présidence (${TRANSITION_KIND_LABEL[c.kind].toLowerCase()}).` })),
        ...(organization.kind === "bde"
          ? inbox.data.approvals.map((a) => ({ key: `a-${a.transition_id}`, text: "Ton approbation est attendue pour la passation du BDE." }))
          : []),
      ]
    : [];

  const teamData = team?.ok ? team.data : null;
  const expiring = teamData ? expiringAssignments(teamData) : [];
  const transition = governance?.ok ? governance.data.transition : null;
  const president = governance?.ok ? governance.data.offices[0]?.holder : null;
  const soon = MANAGE_SECTIONS.filter((s) => s.soon && ctx.workspace.sections.includes(s.key));

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker="Accueil"
        title={organization.name}
        description={
          <p>
            {membership.positions.length
              ? `${membership.positions.length > 1 ? "Tes postes" : "Ton poste"} ici : ${membership.positions.map((p) => p.title).join(", ")}.`
              : "Tu fais partie de l'asso, sans poste de gestion pour l'instant."}{" "}
            Ce que tu vois dans cet espace suit tes postes du moment&nbsp;: il change dès qu&apos;un mandat commence ou
            s&apos;arrête.
          </p>
        }
        meta={
          <>
            {organization.status !== "active" && <span>{ORGANIZATION_STATUS_LABEL[organization.status]}</span>}
            {membership.positions.map((p) => (
              <span key={`${p.title}-${p.ends_at}`}>
                {p.title} jusqu&apos;au {formatDateLong(p.ends_at)}
              </span>
            ))}
          </>
        }
        actions={
          <ButtonLink href={routes.manageMember(asso, membership.membership_id)} variant="secondary" icon="user" iconPosition="start">
            Ma fiche
          </ButtonLink>
        }
      />

      {(readOnly || needsMfa || waiting.length > 0) && (
        <div className="flex flex-col gap-3">
          {readOnly && <ReadOnlyNotice reason={readOnly} />}
          {needsMfa && <MfaNotice what="Attribuer des postes, modifier les droits, préparer une passation ou publier la page" />}
          {waiting.map((w) => (
            <Notice
              key={w.key}
              tone="info"
              icon="bell"
              title={w.text}
              action={
                <ButtonLink href={routes.accountInvitations} size="sm" icon="arrow-right">
                  Répondre
                </ButtonLink>
              }
            />
          ))}
        </div>
      )}

      {teamData && (
        <StatGroup label={`L'équipe de ${organization.name} en chiffres`} columns={can("members.invite") ? 4 : 3}>
          <StatTile label="Membres" value={teamData.members.filter((m) => m.status === "active").length} />
          <StatTile label="Postes" value={teamData.positions.length} />
          {/* Pending invitations are only listed to those who may invite. */}
          {can("members.invite") && (
            <StatTile label="Invitations en attente" value={teamData.invitations.filter((i) => !i.expired).length} />
          )}
          <StatTile
            label="Mandats à renouveler"
            value={expiring.length}
            comparison="dans les 30 prochains jours"
            tone={expiring.length ? "danger" : "neutral"}
          />
        </StatGroup>
      )}

      <div className="grid gap-10 lg:grid-cols-2 lg:gap-12">
        {editor?.ok && (
          <ManageSection
            title="Page publique"
            action={<SectionLink href={routes.manageSettings(asso)}>Éditeur</SectionLink>}
          >
            <PageCard editor={editor.data} />
          </ManageSection>
        )}
        <ManageSection
          title="Ta présentation publique"
          description="Comment tu apparais dans l'équipe, sur la page de l'asso."
          className={editor?.ok ? undefined : "lg:col-span-2"}
        >
          <MyPublicProfileCard
            membershipId={membership.membership_id}
            profile={myPublic}
            holdsPosition={membership.positions.length > 0}
            hasPhoto={Boolean(myProfile?.avatarPath)}
          />
        </ManageSection>
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-12">
        <ManageSection
          title="Ce que tu peux faire ici"
          count={held.size}
          description="Tes droits du moment, venus de tes postes et des délégations en cours. Un droit d'un module à venir fonctionnera dès son arrivée."
        >
          {byCategory.length ? (
            <dl className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
              {byCategory.map(({ category, items }) => (
                <div key={category} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
                  <dt className="type-label text-subtle">{PERMISSION_CATEGORY_LABEL[category]}</dt>
                  <dd className="flex flex-wrap gap-x-3 gap-y-1 type-small">
                    {items.map((p) => (
                      <span key={p.key} className="inline-flex items-center gap-1.5">
                        <Icon name="check" size={14} className="text-ok" />
                        {p.label}
                        {!p.module_ready && <span className="text-subtle">(à venir)</span>}
                      </span>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <ManageEmpty icon="lock" title="Aucun droit de gestion pour l'instant">
              <p>
                Tu fais partie de l&apos;équipe sans poste qui donne des droits. Quand la présidence t&apos;attribue un
                poste, ses droits apparaissent ici, sans avoir à te reconnecter.
              </p>
            </ManageEmpty>
          )}
          {soon.length > 0 && (
            <p className="type-small text-muted">
              Modules à venir où tu auras la main&nbsp;: {soon.map((s) => s.label.toLowerCase()).join(", ")}.
            </p>
          )}
        </ManageSection>

        {governance?.ok ? (
          <ManageSection
            title="Gouvernance"
            action={<SectionLink href={routes.manageGovernance(asso)}>Détails</SectionLink>}
          >
            <div className="flex flex-col gap-3 rounded-md border border-line bg-raised px-4 py-4">
              {governance.data.offices.map((office) => (
                <div key={office.office} className="flex flex-col gap-0.5">
                  <p className="type-label text-subtle">{office.title}</p>
                  {office.holder ? (
                    <p className="font-bold">
                      {office.holder.name}
                      {office.holder.is_you && <span className="font-normal text-muted"> (toi)</span>}
                      <span className="block type-small font-normal text-muted">
                        Mandat jusqu&apos;au {formatDateLong(office.holder.ends_at)}
                      </span>
                    </p>
                  ) : (
                    <StatusBadge tone="danger">Poste vacant</StatusBadge>
                  )}
                </div>
              ))}
              <div className="border-t border-line pt-3">
                {transition ? (
                  <StatusBadge tone="info">{TRANSITION_KIND_LABEL[transition.kind]} en cours</StatusBadge>
                ) : (
                  <p className="type-small text-muted">Aucune passation en cours.</p>
                )}
              </div>
            </div>
            {!president && organization.kind === "association" && (
              <p className="type-small text-muted">
                Sans présidence, c&apos;est le BDE qui peut proposer une nouvelle personne (Gouvernance).
              </p>
            )}
          </ManageSection>
        ) : (
          <ManageSection title="Raccourcis">
            <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
              {MANAGE_SECTIONS.filter((s) => s.key !== "home" && ctx.workspace.sections.includes(s.key)).map((s) => (
                <li key={s.key}>
                  <Link href={s.href(asso)} className="flex min-h-12 items-center gap-3 px-4 font-semibold hover:bg-fg/5">
                    <Icon name={s.icon} size={18} className="text-subtle" />
                    {s.label}
                    {s.soon && <span className="type-meta text-subtle">bientôt</span>}
                    <Icon name="arrow-right" size={16} className="ml-auto text-muted" />
                  </Link>
                </li>
              ))}
              <li>
                <Link href={routes.accountInvitations} className="flex min-h-12 items-center gap-3 px-4 font-semibold hover:bg-fg/5">
                  <Icon name="mail" size={18} className="text-subtle" />
                  Mes invitations
                  <Icon name="arrow-right" size={16} className="ml-auto text-muted" />
                </Link>
              </li>
            </ul>
            {waiting.length === 0 && <p className="type-small text-muted">Rien ne t&apos;attend ici pour l&apos;instant.</p>}
          </ManageSection>
        )}
      </div>
    </div>
  );
}
