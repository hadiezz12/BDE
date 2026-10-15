import type { Metadata } from "next";
import type { AssociationMember, TeamMember } from "@/lib/types";
import { getManageContext } from "@/lib/data/manage";
import { getAssociationMembers, getTeamInvites } from "@/lib/data/team";
import { ButtonLink } from "@/components/ui/Button";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { DataTable, type DataColumn } from "@/components/manage/DataTable";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { PersonCell, SinceCell } from "@/components/manage/team/TeamCells";
import { InviteForm, PendingInvites } from "@/components/manage/team/InviteForm";

type Params = Promise<{ asso: string }>;

export const metadata: Metadata = { title: "Équipe" };

/**
 * /manage/[asso]/team — who is who. The bureau (Association.team, in the
 * association's own order) runs this workspace; active members help on the
 * ground without access to it. Inviting someone onto the bureau is a demo
 * form in Phase 1.
 */
export default async function ManageTeamPage({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;

  const { association, user } = ctx;
  const now = new Date();
  const [members, invites] = await Promise.all([
    getAssociationMembers(association.id),
    getTeamInvites(association.id),
  ]);

  const me = `${user.firstName} ${user.lastName}`;
  const short = association.shortName ?? association.name;

  const bureauColumns: DataColumn<TeamMember>[] = [
    { key: "name", header: "Nom", primary: true, cell: (m) => <PersonCell name={m.name} isYou={m.name === me} /> },
    { key: "role", header: "Rôle", cell: (m) => m.role },
    { key: "promo", header: "Promo", cell: (m) => <span className="type-meta">{m.promo ?? "—"}</span> },
  ];

  const memberColumns: DataColumn<AssociationMember>[] = [
    { key: "name", header: "Nom", primary: true, cell: (m) => <PersonCell name={m.name} isYou={m.name === me} /> },
    { key: "role", header: "Rôle", cell: (m) => m.role },
    { key: "promo", header: "Promo", cell: (m) => <span className="type-meta">{m.promo ?? "—"}</span> },
    { key: "since", header: "Depuis", cell: (m) => <SinceCell iso={m.since} /> },
  ];

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={short}
        title="Équipe"
        description={
          <p>
            Le bureau tient cet espace&nbsp;: contenus, événements, recrutements, réglages. Les membres actifs font
            tourner {association.name} sur le terrain, sans accès ici.
          </p>
        }
        actions={
          <ButtonLink href="#inviter" icon="plus" iconPosition="start">
            Inviter
          </ButtonLink>
        }
      />

      {/* Two zeros say nothing the empty states below don't already say. */}
      {(association.team.length > 0 || members.length > 0 || association.memberCount !== undefined) && (
        <StatGroup label={`L'équipe de ${association.name} en chiffres`} columns={association.memberCount !== undefined ? 3 : 2}>
          <StatTile label="Au bureau" value={association.team.length} comparison="Avec accès à cet espace" />
          <StatTile label="Membres actifs" value={members.length} comparison="Sans accès à cet espace" />
          {association.memberCount !== undefined && (
            <StatTile
              label="Adhérent·es"
              value={association.memberCount}
              comparison="Cette année, bureau compris"
            />
          )}
        </StatGroup>
      )}

      <ManageSection
        title="Bureau"
        count={association.team.length}
        description="Dans l'ordre de la page publique, présidence en tête. Chaque membre du bureau a accès à cet espace."
      >
        <DataTable
          caption={`Bureau de ${association.name}`}
          columns={bureauColumns}
          rows={association.team}
          rowKey={(m) => m.id}
          empty={
            <ManageEmpty
              icon="users"
              title="Le bureau n'est pas encore renseigné"
              demo="les invitations ne partent pas encore, personne n'est ajouté."
            >
              <p>
                La présidence invite chaque membre du bureau ci-dessous, avec son rôle&nbsp;: nom, rôle et promo
                apparaîtront ici et sur la page publique de {association.name}.
              </p>
            </ManageEmpty>
          }
        />
      </ManageSection>

      <ManageSection
        title="Membres actifs"
        count={members.length}
        description="Staff de soirée, plumes, coups de main réguliers. Pour donner accès à l'espace, invite la personne au bureau."
      >
        <DataTable
          caption={`Membres actifs de ${association.name}`}
          columns={memberColumns}
          rows={members}
          rowKey={(m) => m.id}
          empty={
            <ManageEmpty icon="users" title="Pas encore de membre actif">
              <p>
                Les personnes qui donnent un coup de main sans être au bureau apparaîtront ici, avec ce qu&apos;elles
                font et depuis quand.
              </p>
            </ManageEmpty>
          }
        />
      </ManageSection>

      <div id="inviter">
        <ManageSection
          title="Inviter au bureau"
          description={`L'invitation part sur le mail GEM de la personne. Elle rejoint le bureau de ${association.name} dès qu'elle accepte.`}
        >
          <InviteForm associationName={association.name} />
          {invites.length > 0 && (
            <div className="mt-4 flex flex-col gap-1">
              <h3 className="flex items-baseline gap-2.5 type-label text-subtle">
                En attente de réponse
                <span className="type-meta normal-case">{invites.length}</span>
              </h3>
              <PendingInvites invites={invites} now={now} />
            </div>
          )}
        </ManageSection>
      </div>
    </div>
  );
}
