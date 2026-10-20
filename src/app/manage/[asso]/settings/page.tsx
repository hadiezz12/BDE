import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { getManageContext } from "@/lib/data/manage";
import { getAssociationEditor } from "@/lib/associations/editor";
import { ButtonLink } from "@/components/ui/Button";
import { ManageSection } from "@/components/manage/ManagePageHeader";
import { Notice } from "@/components/manage/governance/Notices";
import { ContactForm, IdentityForm, PresentationForm } from "@/components/manage/page-editor/ContentForms";

type Params = Promise<{ asso: string }>;

export const metadata: Metadata = { title: "Page publique" };

/**
 * /manage/[asso]/settings — the page's words: identity and categories,
 * presentation and key points, contact and links. Each section saves on its
 * own, so two people can work on different sections at once.
 */
export default async function PageContentTab({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  const editor = await getAssociationEditor(ctx.organization.id);
  if (!editor.ok) return null;
  const e = editor.data;
  const readOnly = !e.can.edit;
  const neverPublished = e.page.published_revision === null;

  return (
    <div className="flex flex-col gap-12">
      {neverPublished && e.can.edit && (
        <Notice
          tone="info"
          icon="info"
          title="Première fois ? Le guide de démarrage reprend tout, étape par étape."
          action={
            <ButtonLink href={routes.manageSetup(asso)} size="sm" icon="arrow-right">
              Démarrer
            </ButtonLink>
          }
        />
      )}
      {readOnly && (
        <Notice tone="info" icon="lock" title="Tu peux publier la page, pas modifier son contenu.">
          <p>Le contenu est préparé par les postes qui ont le droit « Modifier la page de l&apos;asso ». Relis-le dans l&apos;aperçu.</p>
        </Notice>
      )}
      <section id="identite" className="scroll-mt-24">
        <ManageSection title="Identité" description="En tête de la page, dans l'annuaire des assos et sur vos événements.">
          <IdentityForm
            organizationId={e.organization.id}
            draft={e.draft}
            categories={e.categories}
            isBde={e.organization.kind === "bde"}
            readOnly={readOnly}
          />
        </ManageSection>
      </section>
      <section id="presentation" className="scroll-mt-24">
        <ManageSection title="Présentation" description="Le texte sous la couverture, et vos points forts.">
          <PresentationForm organizationId={e.organization.id} draft={e.draft} readOnly={readOnly} />
        </ManageSection>
      </section>
      <section id="contact" className="scroll-mt-24">
        <ManageSection title="Contact et réseaux" description="Affichés dans « Réseaux et contact ». Laisse vide ce que vous n'avez pas.">
          <ContactForm organizationId={e.organization.id} draft={e.draft} readOnly={readOnly} />
        </ManageSection>
      </section>
    </div>
  );
}
