import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { getManageContext } from "@/lib/data/manage";
import { getEventDashboard } from "@/lib/events/editor";
import { createEvent } from "@/app/actions/events";
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

export const metadata: Metadata = { title: "Nouvel événement" };

/**
 * /manage/[asso]/events/new — start an event: a title if it is already
 * known. public.create_event checks events.create and opens a private draft;
 * the person lands on the first step of the wizard.
 */
export default async function NewEventPage({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!canOpenSection("events", ctx.membership.permissions)) return <SectionDenied section="events" ctx={ctx} />;
  const dashboard = await getEventDashboard(ctx.organization.id);
  if (!dashboard.ok) return <SectionDenied section="events" ctx={ctx} code={dashboard.code} />;

  const { organization, can } = dashboard.data;
  const short = organization.short_name ?? organization.name;
  const readOnly = readOnlyReason(ctx);
  const back = (
    <ButtonLink href={routes.manageEvents(asso)} variant="secondary" icon="arrow-left" iconPosition="start">
      Événements
    </ButtonLink>
  );

  if (!can.create) {
    return (
      <div className="flex flex-col gap-8">
        <ManagePageHeader kicker={short} title="Nouvel événement" actions={back} />
        <ManageEmpty as="h2" icon="lock" title="Créer un événement demande un autre droit">
          <p>
            Commencer un événement demande le droit «&nbsp;Créer des événements&nbsp;» dans {organization.name}. Si tu
            devrais l&apos;avoir, demande à la présidence de l&apos;asso&nbsp;: un poste ou une délégation peut te
            l&apos;ouvrir.
          </p>
        </ManageEmpty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader
        kicker={short}
        title="Nouvel événement"
        description={
          <p>
            Le brouillon s&apos;ouvre sur la première étape&nbsp;: les infos, le lieu, le visuel, les inscriptions, puis
            l&apos;aperçu. Il reste privé jusqu&apos;à sa publication
            {can.publish ? "." : ", par un poste qui a le droit « Publier les événements »."}
          </p>
        }
        actions={back}
      />

      {readOnly ? (
        <ReadOnlyNotice reason={readOnly} />
      ) : (
        <ActionForm
          action={createEvent}
          hidden={{ organization_id: organization.id, organization_slug: asso }}
          submitLabel="Ouvrir le brouillon"
          submitIcon="arrow-right"
          className="max-w-3xl"
        >
          <Field label="Titre" optional hint="120 caractères au plus. Tu pourras le changer ensuite.">
            {({ id, describedBy }) => (
              <Input id={id} aria-describedby={describedBy} name="title" maxLength={120} autoComplete="off" />
            )}
          </Field>
        </ActionForm>
      )}
    </div>
  );
}
