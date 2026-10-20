import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { getManageContext } from "@/lib/data/manage";
import { arrangedTeam, getAssociationEditor } from "@/lib/associations/editor";
import { ManageSection } from "@/components/manage/ManagePageHeader";
import { SectionLink } from "@/components/manage/home/SectionLink";
import { TeamPresentationEditor } from "@/components/manage/page-editor/TeamPresentationEditor";

type Params = Promise<{ asso: string }>;

export const metadata: Metadata = { title: "Équipe présentée" };

/**
 * /manage/[asso]/settings/equipe — who appears in the page's team section,
 * in which order and with which title. Presentation only: positions and
 * rights are managed in Équipe and Postes et droits.
 */
export default async function PageTeamTab({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  const editor = await getAssociationEditor(ctx.organization.id);
  if (!editor.ok) return null;
  const e = editor.data;
  const rows = arrangedTeam(e).map(({ member, entry }) => ({
    membership_id: member.membership_id,
    name: member.name,
    titles: member.titles,
    member_hidden: member.member_hidden,
    show_photo: member.show_photo,
    has_bio: member.has_bio,
    display_title: entry?.display_title ?? null,
    hidden: entry?.hidden ?? false,
  }));
  return (
    <ManageSection
      title="Équipe présentée"
      description="Les personnes qui occupent un poste, telles qu'elles apparaissent sur la page. Chacune choisit elle-même si elle s'affiche, avec ou sans photo et avec une ligne sur elle (dans l'accueil de l'espace). Changer l'ordre ou un titre affiché ne change aucun droit."
      action={ctx.can("members.view") ? <SectionLink href={routes.manageTeam(asso)}>Postes et membres</SectionLink> : undefined}
    >
      <TeamPresentationEditor
        organizationId={e.organization.id}
        rows={rows}
        base={e.team_entries}
        readOnly={!e.can.edit}
      />
    </ManageSection>
  );
}
