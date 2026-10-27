import type { Metadata } from "next";
import { getManageContext } from "@/lib/data/manage";
import { getBroadcastOptions, getOrganizationBroadcasts } from "@/lib/notifications/data";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { BroadcastComposer } from "@/components/notifications/BroadcastComposer";
import { BroadcastHistory } from "@/components/notifications/BroadcastHistory";

type Params = Promise<{ asso: string }>;

export const metadata: Metadata = { title: "Messages" };

/**
 * /manage/[asso]/communication — writing to the association's members or to
 * the people who follow it (communications.send). Not a chat: one message,
 * plain text, at most 5 a day, to an audience the database resolves and
 * freezes when it is sent. Each person's own choices decide whether it also
 * reaches them by e-mail. The history shows counts only.
 */
export default async function ManageCommunicationsPage({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!ctx.can("communications.send")) return <SectionDenied section="communications" ctx={ctx} />;
  const [options, history] = await Promise.all([getBroadcastOptions(ctx.organization.id), getOrganizationBroadcasts(ctx.organization.id)]);
  if (!options) return <SectionDenied section="communications" ctx={ctx} />;

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={ctx.organization.shortName ?? ctx.organization.name}
        title="Messages"
        description={
          <p>
            Un message à l&apos;équipe ou aux personnes qui suivent l&apos;asso. Il arrive dans leurs notifications, et par e-mail
            pour celles et ceux qui l&apos;ont choisi. Pour une discussion, utilisez vos canaux habituels : ce n&apos;est pas un chat.
          </p>
        }
      />
      <ManageSection title="Nouveau message">
        <div className="max-w-2xl">
          <BroadcastComposer organizationId={ctx.organization.id} options={options} />
        </div>
      </ManageSection>
      <ManageSection title="Historique" count={history.length}>
        <BroadcastHistory items={history} />
      </ManageSection>
    </div>
  );
}
