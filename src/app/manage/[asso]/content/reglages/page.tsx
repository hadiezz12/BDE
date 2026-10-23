import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { formatDateLong } from "@/lib/format";
import { getManageContext } from "@/lib/data/manage";
import { getContentDashboard } from "@/lib/posts/editor";
import { setEditorialSettings } from "@/app/actions/posts";
import { ButtonLink } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Field";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { canOpenSection } from "@/components/manage/sections";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { MfaNotice, ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { PolicySummary, ReviewModeFieldset, SHOW_AUTHORS_TEXT } from "@/components/manage/content/EditorialPolicy";
import { readOnlyReason } from "@/components/manage/content/desk";

type Params = Promise<{ asso: string }>;

export const metadata: Metadata = { title: "Règles de publication" };

/**
 * /manage/[asso]/content/reglages — the association's editorial policy:
 * approval (a second person approves the exact version) or direct
 * publishing, and whether articles are signed with their author's name.
 * Changing it takes posts.settings and a second factor
 * (public.set_editorial_settings checks both, and audits the change);
 * everyone else on the content team reads it here.
 */
export default async function EditorialSettingsPage({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!canOpenSection("content", ctx.membership.permissions)) return <SectionDenied section="content" ctx={ctx} />;
  const dashboard = await getContentDashboard(ctx.organization.id);
  if (!dashboard.ok) return <SectionDenied section="content" ctx={ctx} code={dashboard.code} />;
  if (!dashboard.data) return <SectionDenied section="content" ctx={ctx} code="unexpected" />;

  const { organization, settings, can } = dashboard.data;
  const readOnly = readOnlyReason(ctx);
  const editable = can.settings && !readOnly;

  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader
        kicker={organization.short_name ?? organization.name}
        title="Règles de publication"
        description={
          <p>
            Comment un article de {organization.name} passe du brouillon au fil Campus. Les mêmes règles valent pour
            toute l&apos;équipe, et le site les applique à chaque publication.
          </p>
        }
        meta={
          <span>
            {settings.updated_by_name && settings.updated_at
              ? `Dernier changement le ${formatDateLong(settings.updated_at)} par ${settings.updated_by_name}`
              : "Réglages de départ : personne ne les a encore changés"}
          </span>
        }
        actions={
          <ButtonLink href={routes.manageContent(asso)} variant="secondary" icon="arrow-left" iconPosition="start">
            Contenus
          </ButtonLink>
        }
      />

      {readOnly && <ReadOnlyNotice reason={readOnly} />}
      {editable && ctx.aal !== "aal2" && <MfaNotice what="Changer les règles de publication" />}

      {editable ? (
        <ActionForm
          action={setEditorialSettings}
          hidden={{ organization_id: organization.id }}
          submitLabel="Enregistrer les règles"
          submitIcon="check"
          className="max-w-5xl"
        >
          <ReviewModeFieldset defaultValue={settings.review_mode} />
          <p className="max-w-2xl type-small text-muted">
            Un changement vaut pour les prochaines publications&nbsp;: ce qui est déjà en ligne, approuvé ou programmé ne
            bouge pas, et les versions en relecture y restent.
          </p>
          <fieldset className="flex max-w-2xl flex-col gap-2 border-t border-line pt-5">
            <legend className="sr-only">Signature des articles</legend>
            <Checkbox
              name="show_authors"
              defaultChecked={settings.show_authors}
              label="Signer les articles du nom de leur auteur ou autrice"
              description={`${SHOW_AUTHORS_TEXT} Décoché, l'asso signe seule.`}
            />
          </fieldset>
        </ActionForm>
      ) : (
        <div className="flex max-w-4xl flex-col gap-4">
          <PolicySummary settings={settings} />
          {!can.settings && (
            <p className="type-small text-muted">
              Ces règles sont choisies par les postes qui ont le droit «&nbsp;Régler la publication&nbsp;» (par défaut, la
              présidence). Pour en changer, parles-en avec eux.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
