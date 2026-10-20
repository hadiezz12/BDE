import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { formatDateLong } from "@/lib/format";
import { getManageContext } from "@/lib/data/manage";
import { getAssociationEditor, hasUnpublishedChanges } from "@/lib/associations/editor";
import { changeSlug, publishPage, unpublishPage } from "@/app/actions/association-page";
import { ButtonLink } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { ManageSection } from "@/components/manage/ManagePageHeader";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { MfaNotice, Notice } from "@/components/manage/governance/Notices";
import { CompletenessList, editorCompleteness } from "@/components/manage/page-editor/PageStatus";

type Params = Promise<{ asso: string }>;
type Search = Promise<{ adresse?: string }>;

export const metadata: Metadata = { title: "Publication de la page" };

/**
 * /manage/[asso]/settings/publication — what the page lacks, then publish
 * (organization.page.publish, second factor): the public page becomes the
 * draft revision loaded here, in one transaction. If someone saves a newer
 * draft meanwhile, the database refuses and asks for a new look. Also: take
 * the page off the site, and change its address (the old one keeps
 * redirecting, and is never given to anyone else).
 */
export default async function PagePublicationTab({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { asso } = await params;
  const { adresse } = await searchParams;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  const editor = await getAssociationEditor(ctx.organization.id);
  if (!editor.ok) return null;
  const e = editor.data;
  const { publishable } = editorCompleteness(e);
  const changes = hasUnpublishedChanges(e);
  const withheld = Boolean(e.page.withheld_at);
  const orgOpen = e.organization.status === "setup" || e.organization.status === "active";
  const needsMfa = e.can.publish && ctx.aal !== "aal2";

  return (
    <div className="flex flex-col gap-12">
      {adresse && <Notice tone="info" icon="check" title="Adresse changée. L'ancienne redirige vers celle-ci." />}

      <ManageSection title="Avant de publier">
        <CompletenessList editor={e} />
      </ManageSection>

      <ManageSection
        title="Publier"
        description="Publier remplace la page en ligne par le brouillon, d'un coup. Relis-le dans l'aperçu, ordinateur et téléphone, avant."
      >
        {needsMfa && <MfaNotice what="Publier la page ou changer son adresse" />}
        {!e.can.publish ? (
          <Notice tone="info" icon="lock" title="La publication est réservée aux postes qui ont le droit « Publier la page ».">
            <p>Prépare le brouillon, puis préviens la présidence ou le secrétariat : ils le publieront.</p>
          </Notice>
        ) : withheld ? (
          <Notice tone="danger" icon="alert" title="Publication bloquée : le BDE a retiré la page.">
            <p>Raison donnée : {e.page.withheld_reason}</p>
          </Notice>
        ) : !orgOpen ? (
          <Notice tone="warn" icon="lock" title="L'asso est suspendue ou archivée : rien ne peut être publié." />
        ) : !changes && e.page.status === "published" ? (
          <p className="type-small text-muted">
            Rien à publier : le brouillon est identique à la version en ligne (publiée le{" "}
            {formatDateLong(e.page.published_at!)}).
          </p>
        ) : (
          <div className="flex flex-col gap-4 rounded-md border border-line-strong bg-raised px-4 py-5 sm:px-5">
            <p className="type-small">
              Brouillon n°{e.draft.revision}, enregistré le {formatDateLong(e.draft.updated_at)}
              {e.draft.updated_by_name ? ` par ${e.draft.updated_by_name}` : ""}.
              {e.organization.status === "setup" &&
                " L'asso est encore en préparation : la page sera publiée, mais visible seulement quand le BDE rendra l'asso active."}
            </p>
            <div className="flex flex-wrap items-start gap-3">
              <ButtonLink href={routes.associationPreview(asso)} variant="secondary" icon="eye" iconPosition="start">
                Voir l&apos;aperçu
              </ButtonLink>
              {publishable ? (
                <ActionForm
                  action={publishPage}
                  hidden={{ organization_id: e.organization.id, revision: String(e.draft.revision), organization_slug: asso }}
                  submitLabel={e.page.status === "published" ? "Publier les changements" : "Publier la page"}
                  submitIcon="check"
                  inline
                />
              ) : (
                <p className="type-small font-semibold text-warn">Complète les points obligatoires ci-dessus pour publier.</p>
              )}
            </div>
          </div>
        )}
      </ManageSection>

      {e.can.publish && e.page.status === "published" && !withheld && (
        <ManageSection title="Retirer la page du site">
          <Disclosure summary="Retirer la page" icon="eye" tone="danger">
            <ActionForm action={unpublishPage} hidden={{ organization_id: e.organization.id }} submitLabel="Retirer du site" variant="danger">
              <p className="type-small text-muted">
                La page disparaît du site et de l&apos;annuaire tout de suite. Le brouillon reste&nbsp;: elle revient à la
                prochaine publication.
              </p>
              <Field label="Raison" optional hint="Gardée dans l'historique de l'asso.">
                {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="reason" maxLength={500} />}
              </Field>
            </ActionForm>
          </Disclosure>
        </ManageSection>
      )}

      <ManageSection
        title="Adresse de la page"
        description={
          <p>
            <span className="type-meta">{routes.association(asso)}</span>
          </p>
        }
      >
        {e.organization.kind === "bde" ? (
          <p className="type-small text-muted">L&apos;adresse de la page du BDE ne change pas.</p>
        ) : e.can.publish ? (
          <Disclosure summary="Changer l'adresse" icon="edit">
            <ActionForm action={changeSlug} hidden={{ organization_id: e.organization.id }} submitLabel="Changer l'adresse">
              <p className="type-small text-muted">
                L&apos;ancienne adresse continuera de mener ici, pour toujours, et ne pourra jamais être prise par une autre
                asso. À faire rarement&nbsp;: les liens déjà partagés passent par une redirection.
              </p>
              <Field label="Nouvelle adresse" hint="Minuscules sans accent, chiffres et tirets : /associations/…">
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    name="slug"
                    required
                    defaultValue={asso}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    maxLength={80}
                    spellCheck={false}
                    autoCapitalize="off"
                  />
                )}
              </Field>
            </ActionForm>
          </Disclosure>
        ) : (
          <p className="type-small text-muted">Changer l&apos;adresse demande le droit « Publier la page ».</p>
        )}
      </ManageSection>
    </div>
  );
}
