import type { Metadata } from "next";
import { getManageContext } from "@/lib/data/manage";
import { getAssociationEditor } from "@/lib/associations/editor";
import { ManageSection } from "@/components/manage/ManagePageHeader";
import { GalleryEditor } from "@/components/manage/page-editor/GalleryEditor";

type Params = Promise<{ asso: string }>;

export const metadata: Metadata = { title: "Galerie de la page" };

/** /manage/[asso]/settings/galerie — the photos of the page, in order, with captions. */
export default async function PageGalleryTab({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  const editor = await getAssociationEditor(ctx.organization.id);
  if (!editor.ok) return null;
  const e = editor.data;
  return (
    <ManageSection
      title="Galerie"
      description="Jusqu'à 24 photos de vos activités, dans l'ordre où elles s'affichent. Uniquement des photos que vous avez le droit de publier : demande l'accord des personnes reconnaissables."
    >
      <GalleryEditor
        asso={asso}
        organizationId={e.organization.id}
        items={e.gallery}
        media={e.media}
        canUpload={e.can.media}
        readOnly={!e.can.edit}
      />
    </ManageSection>
  );
}
