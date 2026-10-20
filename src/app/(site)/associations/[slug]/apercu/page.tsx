import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { formatDateLong } from "@/lib/format";
import { getAuthContext } from "@/lib/auth/context";
import { getWorkspaceOrganization } from "@/lib/data/manage";
import { getAssociationEditor, getAssociationPreview, hasUnpublishedChanges } from "@/lib/associations/editor";
import { toAssociation } from "@/lib/associations/model";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { publishPage } from "@/app/actions/association-page";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { editorCompleteness } from "@/components/manage/page-editor/PageStatus";
import { Icon } from "@/components/ui/Icon";
import { AssociationProfile } from "../../_components/AssociationProfile";
import { loadProfileModules } from "../../_components/profile-modules";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const metadata: Metadata = {
  title: "Aperçu de la page",
  robots: { index: false, follow: false },
};

/**
 * /associations/[slug]/apercu — the draft of a page, exactly as the public
 * page will show it once published, for the people who prepare or publish
 * it (public.association_preview refuses everyone else, and draft images
 * come from the private preview route). Never indexed, never cached.
 *
 * ?vue=telephone frames the same page at phone width (?cadre=1 is the framed
 * page itself, without this banner). Publishing from here publishes the
 * revision shown: if someone saved a newer draft meanwhile, the database
 * refuses and asks for a fresh look.
 */
export default async function AssociationPreviewPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") {
    redirect(`${routes.login}?next=${encodeURIComponent(routes.associationPreview(slug))}`);
  }
  const organization = await getWorkspaceOrganization(slug);
  if (!organization) notFound();

  const [preview, editor] = await Promise.all([
    getAssociationPreview(organization.id),
    getAssociationEditor(organization.id),
  ]);
  if (!preview.ok || !editor.ok) {
    const code = !preview.ok ? preview.code : editor.ok ? "unexpected" : editor.code;
    return (
      <div className="wrap py-[var(--section)]">
        <EmptyState
          mark={<Icon name="lock" size={44} />}
          title="Aperçu réservé à l'équipe de la page"
          actions={
            <ButtonLink href={routes.association(slug)} variant="secondary" icon="arrow-right">
              La page publique
            </ButtonLink>
          }
        >
          {governanceErrorMessage(code)}
        </EmptyState>
      </div>
    );
  }

  const association = toAssociation(preview.data, { preview: true });
  const modules = await loadProfileModules(association);
  const profile = <AssociationProfile association={association} modules={modules} viewer={{ user: null }} preview />;
  if (sp.cadre === "1") return profile;

  const e = editor.data;
  const phone = sp.vue === "telephone";
  const self = routes.associationPreview(slug);
  const changes = hasUnpublishedChanges(e);
  const withheld = Boolean(e.page.withheld_at);
  const canPublish = e.can.publish && (organization.status === "active" || organization.status === "setup") && !withheld;
  const { publishable } = editorCompleteness(e);

  return (
    <>
      <section
        aria-label="Aperçu du brouillon"
        data-surface="paper"
        className="border-b-2 border-dashed border-fg"
      >
        <div className="wrap flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="type-label">Aperçu · brouillon n°{preview.data.revision}</p>
            <p className="type-small text-muted">
              {e.page.is_public
                ? changes
                  ? `En ligne : la version publiée le ${formatDateLong(e.page.published_at!)}. Ce brouillon n'est pas encore publié.`
                  : "Ce brouillon est exactement la version en ligne."
                : withheld
                  ? "Page retirée par le BDE : elle ne peut pas être publiée pour l'instant."
                  : "Cette page n'est pas en ligne : personne d'autre que l'équipe ne la voit."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Taille de l'aperçu" className="flex rounded-sm border border-line-strong p-0.5">
              {[
                { href: self, label: "Ordinateur", active: !phone },
                { href: `${self}?vue=telephone`, label: "Téléphone", active: phone },
              ].map((v) => (
                <Link
                  key={v.label}
                  href={v.href}
                  aria-current={v.active ? "page" : undefined}
                  className={cx(
                    "inline-flex min-h-10 items-center px-3 type-small font-semibold",
                    v.active ? "rounded-xs bg-fg text-bg" : "text-muted hover:text-fg",
                  )}
                >
                  {v.label}
                </Link>
              ))}
            </nav>
            <ButtonLink href={routes.manageSettings(slug)} variant="secondary" size="sm" icon="edit" iconPosition="start">
              Modifier
            </ButtonLink>
            {canPublish && changes && !publishable && (
              <ButtonLink href={routes.managePagePublication(slug)} size="sm" icon="arrow-right">
                Ce qui manque pour publier
              </ButtonLink>
            )}
            {canPublish && changes && publishable && (
              <ActionForm
                action={publishPage}
                hidden={{
                  organization_id: organization.id,
                  revision: String(preview.data.revision),
                  organization_slug: slug,
                  after: "page",
                }}
                submitLabel={e.page.is_public ? "Publier ces changements" : "Publier la page"}
                submitIcon="check"
                size="sm"
                inline
              />
            )}
          </div>
        </div>
      </section>

      {phone ? (
        <div className="wrap flex justify-center py-8">
          <iframe
            src={`${self}?cadre=1`}
            title={`Aperçu de la page de ${association.name} sur téléphone`}
            className="h-[844px] max-h-[80dvh] w-[390px] max-w-full rounded-[2rem] border-[10px] border-fg bg-bg"
          />
        </div>
      ) : (
        profile
      )}
    </>
  );
}
