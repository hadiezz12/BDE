import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { getManageContext } from "@/lib/data/manage";
import { getContentDashboard } from "@/lib/posts/editor";
import { POST_KINDS } from "@/lib/posts/model";
import { createPost } from "@/app/actions/posts";
import { ButtonLink } from "@/components/ui/Button";
import { ChoiceGroup, Field, Input } from "@/components/ui/Field";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { canOpenSection } from "@/components/manage/sections";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { POST_KIND_HINT, POST_KIND_LABEL } from "@/components/campus/labels";
import { readOnlyReason } from "@/components/manage/content/desk";

type Params = Promise<{ asso: string }>;

export const metadata: Metadata = { title: "Nouvel article" };

/**
 * /manage/[asso]/content/new — start a post: its kind, and a title if it is
 * already known. public.create_post checks posts.create (or posts.edit) and
 * opens the first draft; the person lands in the editor, where everything
 * else is written and saved as they go.
 */
export default async function NewPostPage({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!canOpenSection("content", ctx.membership.permissions)) return <SectionDenied section="content" ctx={ctx} />;
  const dashboard = await getContentDashboard(ctx.organization.id);
  if (!dashboard.ok) return <SectionDenied section="content" ctx={ctx} code={dashboard.code} />;
  if (!dashboard.data) return <SectionDenied section="content" ctx={ctx} code="unexpected" />;

  const { organization, settings, can } = dashboard.data;
  const short = organization.short_name ?? organization.name;
  const readOnly = readOnlyReason(ctx);
  const back = (
    <ButtonLink href={routes.manageContent(asso)} variant="secondary" icon="arrow-left" iconPosition="start">
      Contenus
    </ButtonLink>
  );

  if (!can.create) {
    return (
      <div className="flex flex-col gap-8">
        <ManagePageHeader kicker={short} title="Nouvel article" actions={back} />
        <ManageEmpty as="h2" icon="lock" title="Écrire demande un autre droit">
          <p>
            Commencer un article demande le droit «&nbsp;Écrire des articles&nbsp;» dans {organization.name}. Si tu
            devrais l&apos;avoir, demande à la présidence de l&apos;asso&nbsp;: un poste ou une délégation peut te
            l&apos;ouvrir.
          </p>
        </ManageEmpty>
      </div>
    );
  }

  const next =
    settings.review_mode === "approval"
      ? "Quand il est prêt, tu l'envoies en relecture : une autre personne l'approuve avant sa publication."
      : can.publish
        ? "Quand il est prêt, tu le publies, ou tu le programmes."
        : "Quand il est prêt, tu l'envoies en relecture : il partira en ligne une fois approuvé.";

  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader
        kicker={short}
        title="Nouvel article"
        description={
          <p>
            Le brouillon s&apos;ouvre dans l&apos;éditeur&nbsp;: il reste privé, enregistré au fil de l&apos;écriture,
            jusqu&apos;à sa publication. {next}
          </p>
        }
        actions={back}
      />

      {readOnly ? (
        <ReadOnlyNotice reason={readOnly} />
      ) : (
        <ActionForm
          action={createPost}
          hidden={{ organization_id: organization.id, organization_slug: asso }}
          submitLabel="Ouvrir le brouillon"
          submitIcon="arrow-right"
          className="max-w-3xl"
        >
          <ChoiceGroup
            legend="Type"
            name="kind"
            defaultValue="article"
            options={POST_KINDS.map((k) => ({ value: k, label: POST_KIND_LABEL[k], description: POST_KIND_HINT[k] }))}
          />
          <Field label="Titre" optional hint="140 caractères au plus. Tu pourras le changer ensuite.">
            {({ id, describedBy }) => (
              <Input id={id} aria-describedby={describedBy} name="title" maxLength={140} autoComplete="off" />
            )}
          </Field>
        </ActionForm>
      )}
    </div>
  );
}
