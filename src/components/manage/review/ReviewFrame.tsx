import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { getManageContext, type ManageContext } from "@/lib/data/manage";
import { getCampaignAccess } from "@/lib/recruitment/review-data";
import { campaignStage, STAGE_LABEL, STAGE_TONE } from "@/lib/recruitment/desk";
import type { CampaignAccess, Power } from "@/lib/recruitment/review";
import type { CampaignState } from "@/lib/recruitment/model";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { ButtonLink } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { canOpenRecruitment } from "@/components/manage/sections";
import { PageTabs } from "@/components/manage/governance/PageTabs";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { Notice } from "@/components/manage/governance/Notices";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ReviewTab = "suivi" | "candidatures" | "entretiens" | "decisions" | "comite";

const TAB_ROUTE: Record<ReviewTab, (asso: string, campaign: string) => string> = {
  suivi: routes.manageCampaignReview,
  candidatures: routes.manageApplications,
  entretiens: routes.manageInterviews,
  decisions: routes.manageDecisions,
  comite: routes.manageCommittee,
};

export type ReviewFrame =
  | { ok: false; node: ReactNode }
  | { ok: true; ctx: ManageContext; access: CampaignAccess; campaignId: string; has: (p: Power) => boolean };

/**
 * The opening of every page of a campaign's review workspace: the person
 * may open the recruitment section here (a key, or a live committee
 * appointment), and public.recruitment_campaign_access says what they may do
 * in this campaign. A campaign of another association is sent to its own
 * workspace. These answers only choose what to show: each read and each
 * action asks the database again.
 */
export async function loadReviewFrame(asso: string, campaign: string, tab: ReviewTab): Promise<ReviewFrame> {
  const ctx = await getManageContext(asso);
  if (!ctx) return { ok: false, node: null };
  if (!canOpenRecruitment(ctx.membership)) return { ok: false, node: <SectionDenied section="recruitment" ctx={ctx} /> };
  if (!UUID.test(campaign)) return { ok: false, node: <ReviewUnavailable asso={asso} message={governanceErrorMessage("campaign_not_found")} /> };
  const campaignId = campaign.toLowerCase();
  const access = await getCampaignAccess(campaignId);
  if (!access.ok) return { ok: false, node: <ReviewUnavailable asso={asso} message={governanceErrorMessage(access.code)} /> };
  const slug = access.data.organization.slug;
  if (slug !== asso) redirect(TAB_ROUTE[tab](slug, campaignId));
  const powers = access.data.powers;
  return { ok: true, ctx, access: access.data, campaignId, has: (p: Power) => powers.includes(p) };
}

/** The title of the campaign and its tabs, shown only where the person may go. */
export function ReviewHeader({
  asso,
  access,
  title,
  description,
  actions,
}: {
  asso: string;
  access: CampaignAccess;
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  const stage = campaignStage({ state: access.state as CampaignState, hidden: null, archived_at: access.archived ? "archived" : null });
  const short = access.organization.short_name ?? access.organization.name;
  return (
    <div className="flex flex-col gap-4">
      <ManagePageHeader
        kicker={`${short} · Recrutement`}
        title={title ?? (access.title.trim() || "Recrutement sans titre")}
        description={description}
        meta={<StatusBadge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</StatusBadge>}
        actions={actions}
      />
      <ReviewTabs asso={asso} access={access} />
      {access.candidate && (
        <Notice tone="warn" icon="lock" title="Tu candidates toi-même à ce recrutement">
          <p>
            Tant que ta candidature n&apos;est pas retirée, tu ne vois aucune candidature, aucune évaluation et aucune décision de ce
            recrutement, quels que soient tes droits.
          </p>
        </Notice>
      )}
    </div>
  );
}

/** The pages of one campaign the person may open: the review tabs (with "view"), and the editor (with a recruitment key). */
export function ReviewTabs({ asso, access }: { asso: string; access: Pick<CampaignAccess, "id" | "powers" | "editor"> }) {
  const id = access.id;
  const powers = new Set(access.powers);
  const tabs: { href: string; label: string; exact?: boolean }[] = [];
  if (powers.has("view")) {
    tabs.push({ href: routes.manageCampaignReview(asso, id), label: "Suivi" });
    tabs.push({ href: routes.manageApplications(asso, id), label: "Candidatures" });
    tabs.push({ href: routes.manageInterviews(asso, id), label: "Entretiens" });
    if ((["propose", "approve", "release", "view_team"] as Power[]).some((p) => powers.has(p))) {
      tabs.push({ href: routes.manageDecisions(asso, id), label: "Décisions" });
    }
    tabs.push({ href: routes.manageCommittee(asso, id), label: "Comité" });
  }
  if (access.editor) tabs.push({ href: routes.manageCampaign(asso, id), label: "Fiche et formulaire", exact: true });
  return tabs.length > 1 ? <PageTabs label="Le recrutement" tabs={tabs} /> : null;
}

/** A tab the person cannot open (a power they do not hold here): says so, nothing more. */
export function ReviewDenied({ asso, access, what }: { asso: string; access: CampaignAccess; what: string }) {
  return (
    <div className="flex flex-col gap-8">
      <ReviewHeader asso={asso} access={access} />
      <ManageEmpty as="h2" icon="lock" title="Pas dans ta nomination">
        <p>
          {what} n&apos;est pas ouvert à ta nomination ou à tes postes dans ce recrutement. La personne qui compose le comité peut
          te le confier.
        </p>
      </ManageEmpty>
    </div>
  );
}

/** The campaign cannot be opened (wrong link, no access, another association's): says so, nothing about it. */
export function ReviewUnavailable({ asso, message }: { asso: string; message: string }) {
  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader title="Recrutement" />
      <ManageEmpty
        as="h2"
        icon="lock"
        title="Ce recrutement ne s'ouvre pas ici"
        actions={
          <ButtonLink href={routes.manageRecruitment(asso)} variant="secondary" icon="arrow-left" iconPosition="start">
            Recrutement
          </ButtonLink>
        }
      >
        <p>{message}</p>
      </ManageEmpty>
    </div>
  );
}
