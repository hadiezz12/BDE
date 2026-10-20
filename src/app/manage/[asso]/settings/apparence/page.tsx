import type { Metadata } from "next";
import { getManageContext } from "@/lib/data/manage";
import { getAssociationEditor } from "@/lib/associations/editor";
import { ManageSection } from "@/components/manage/ManagePageHeader";
import { AppearanceForm } from "@/components/manage/page-editor/AppearanceForm";

type Params = Promise<{ asso: string }>;

export const metadata: Metadata = { title: "Apparence de la page" };

/** /manage/[asso]/settings/apparence — colour, logo, cover (and its focal point). */
export default async function PageAppearanceTab({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  const editor = await getAssociationEditor(ctx.organization.id);
  if (!editor.ok) return null;
  const e = editor.data;
  return (
    <ManageSection
      title="Apparence"
      description="La personnalité de ta page : ta couleur, ton logo, ta couverture. La mise en page reste celle du site, pour que chaque page se lise bien partout."
    >
      <AppearanceForm
        asso={asso}
        organizationId={e.organization.id}
        draft={e.draft}
        media={e.media}
        kindLabel={e.draft.kind_label ?? (e.organization.kind === "bde" ? "Bureau des étudiants" : "Association étudiante")}
        canUpload={e.can.media}
        readOnly={!e.can.edit}
      />
    </ManageSection>
  );
}
