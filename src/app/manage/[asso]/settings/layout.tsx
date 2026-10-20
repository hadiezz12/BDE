import type { ReactNode } from "react";
import { routes } from "@/lib/routes";
import { getManageContext } from "@/lib/data/manage";
import { getAssociationEditor } from "@/lib/associations/editor";
import { ButtonLink } from "@/components/ui/Button";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { PageTabs } from "@/components/manage/governance/PageTabs";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { PageStatusPanel } from "@/components/manage/page-editor/PageStatus";

type Params = Promise<{ asso: string }>;

/**
 * /manage/[asso]/settings/* — the public page editor. Open to whoever may
 * prepare the page (organization.settings.update) or publish it
 * (organization.page.publish); public.association_editor checks the same
 * keys. Every tab edits the draft; only Publication changes the public page.
 */
export default async function PageEditorLayout({ children, params }: { children: ReactNode; params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!ctx.can("organization.settings.update") && !ctx.can("organization.page.publish")) {
    return <SectionDenied section="settings" ctx={ctx} />;
  }
  const editor = await getAssociationEditor(ctx.organization.id);
  if (!editor.ok) return <SectionDenied section="settings" ctx={ctx} code={editor.code} />;
  const e = editor.data;
  const readOnly =
    ctx.membership.membership_status === "suspended"
      ? "membership_suspended"
      : ctx.organization.status === "suspended"
        ? "organization_suspended"
        : ctx.organization.status === "archived"
          ? "organization_archived"
          : null;

  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader
        kicker={ctx.organization.shortName ?? ctx.organization.name}
        title="Page publique"
        description={
          <p>
            Ce que tout le monde lit sur{" "}
            <span className="type-meta">{routes.association(asso)}</span>. Tu travailles sur un brouillon&nbsp;: rien ne
            change en ligne avant la publication.
          </p>
        }
        actions={
          <>
            <ButtonLink href={routes.associationPreview(asso)} icon="eye" iconPosition="start">
              Aperçu
            </ButtonLink>
            {e.page.is_public && (
              <ButtonLink href={routes.association(asso)} variant="secondary" icon="arrow-up-right">
                Voir en ligne
              </ButtonLink>
            )}
          </>
        }
      />
      {readOnly && <ReadOnlyNotice reason={readOnly} />}
      <PageStatusPanel editor={e} />
      <PageTabs
        label="Éditeur de la page"
        tabs={[
          { href: routes.manageSettings(asso), label: "Contenu", exact: true },
          { href: routes.managePageAppearance(asso), label: "Apparence" },
          { href: routes.managePageGallery(asso), label: "Galerie" },
          { href: routes.managePageTeam(asso), label: "Équipe présentée" },
          { href: routes.managePagePublication(asso), label: "Publication" },
        ]}
      />
      {children}
    </div>
  );
}
