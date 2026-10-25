import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { getManageContext } from "@/lib/data/manage";
import { getRecruitmentDashboard } from "@/lib/recruitment/editor";
import { createCampaign } from "@/app/actions/recruitment";
import { ButtonLink } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { canOpenSection } from "@/components/manage/sections";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { readOnlyReason } from "@/components/manage/content/desk";

type Params = Promise<{ asso: string }>;

export const metadata: Metadata = { title: "Nouveau recrutement" };

/**
 * /manage/[asso]/recruitment/new — start a campaign with its title.
 * public.create_recruitment_campaign checks recruitment.campaigns.manage
 * and opens a private draft (with an empty draft form); the person lands on
 * the first step of the wizard.
 */
export default async function NewCampaignPage({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!canOpenSection("recruitment", ctx.membership.permissions)) return <SectionDenied section="recruitment" ctx={ctx} />;
  const dashboard = await getRecruitmentDashboard(ctx.organization.id);
  if (!dashboard.ok) return <SectionDenied section="recruitment" ctx={ctx} code={dashboard.code} />;

  const { organization, can } = dashboard.data;
  const short = organization.short_name ?? organization.name;
  const readOnly = readOnlyReason(ctx);
  const back = (
    <ButtonLink href={routes.manageRecruitment(asso)} variant="secondary" icon="arrow-left" iconPosition="start">
      Recrutement
    </ButtonLink>
  );

  if (!can.manage) {
    return (
      <div className="flex flex-col gap-8">
        <ManagePageHeader kicker={short} title="Nouveau recrutement" actions={back} />
        <ManageEmpty as="h2" icon="lock" title="Commencer un recrutement demande un autre droit">
          <p>
            Commencer un recrutement demande le droit «&nbsp;Préparer les recrutements&nbsp;» dans {organization.name}. Si tu
            devrais l&apos;avoir, demande à la présidence de l&apos;asso&nbsp;: un poste ou une délégation peut te l&apos;ouvrir.
          </p>
        </ManageEmpty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader
        kicker={short}
        title="Nouveau recrutement"
        description={
          <p>
            Le brouillon s&apos;ouvre sur la première étape : la présentation, puis le déroulé, les postes, le formulaire et les
            dates. Il reste privé jusqu&apos;à sa publication
            {can.publish ? "." : ", par un poste qui a le droit « Publier les recrutements »."}
          </p>
        }
        actions={back}
      />
      {readOnly ? (
        <ReadOnlyNotice reason={readOnly} />
      ) : (
        <ActionForm
          action={createCampaign}
          hidden={{ organization_id: organization.id, organization_slug: asso }}
          submitLabel="Ouvrir le brouillon"
          submitIcon="arrow-right"
          className="max-w-3xl"
        >
          <Field label="Titre" hint="Ex : « Recrutement 2027 », « Équipe soirées ». 120 caractères au plus, modifiable ensuite.">
            {({ id, describedBy }) => (
              <Input id={id} aria-describedby={describedBy} name="title" minLength={3} maxLength={120} autoComplete="off" required />
            )}
          </Field>
        </ActionForm>
      )}
    </div>
  );
}
