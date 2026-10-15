import type { ApplicationFormSpec, ApplicationItem, CampaignItem, Session } from "@/lib/types";
import { APPLICATION_STATUS_LABEL, formatDayMonth, formatDayShort, formatTime } from "@/lib/format";
import type { ApplyFormData } from "./ApplyDialog";
import { accountName, studyLine } from "@/components/account/identity";
import { isPositionOpen } from "./campaign-facts";

/**
 * Prepares the apply dialog's props on the server: open roles only, dates
 * already worded (so the client never recomputes "now"), and the applicant
 * taken from the session. Pure — the page passes in what it fetched.
 */
export function toApplyForm({
  campaign,
  spec,
  session,
  mine,
  now = new Date(),
}: {
  campaign: CampaignItem;
  spec: ApplicationFormSpec;
  session: Session;
  /** The student's application to this campaign, if any. */
  mine: ApplicationItem | null;
  now?: Date;
}): ApplyFormData {
  const { user } = session;
  return {
    campaignTitle: campaign.title,
    associationName: campaign.association.name,
    accent: campaign.association.accent,
    deadline: `Clôture le ${formatDayMonth(campaign.closesAt)} à ${formatTime(campaign.closesAt)}`,
    positions: campaign.positions
      .filter((p) => isPositionOpen(p, campaign, now))
      .map((p) => ({
        id: p.id,
        title: p.title,
        team: p.team,
        seats: p.seats,
        closesEarly:
          p.closesAt && p.closesAt !== campaign.closesAt
            ? `ferme le ${formatDayShort(p.closesAt)} à ${formatTime(p.closesAt)}`
            : undefined,
      })),
    spec,
    requirements: campaign.requirements,
    applicant: user
      ? {
          name: accountName(user),
          // Only what the profile knows: demo accounts have no programme, year or email.
          detail: [studyLine(user), user.email].filter(Boolean).join(" · "),
        }
      : null,
    existing: mine
      ? {
          id: mine.id,
          positionId: mine.positionId,
          positionTitle: mine.position.title,
          statusLabel: APPLICATION_STATUS_LABEL[mine.status],
          draft: mine.status === "brouillon",
        }
      : null,
  };
}
