import type { Applicant, CampaignItem, CampaignStatus } from "@/lib/types";
import { CAMPAIGN_STATUS_LABEL, deadlineLabel, formatDayShort, plural } from "@/lib/format";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";

/**
 * Cells of the workspace campaigns table (/manage/[asso]/recruitment).
 * Server components: they only format the campaign, its applicants and the
 * clock. Tones follow the workspace badges: green = open, pink = last
 * stretch (needs the bureau), cyan = not open yet. Amber stays for safety.
 */

export const CAMPAIGN_TONE: Record<CampaignStatus, StatusTone> = {
  ouverte: "ok",
  "derniere-chance": "accent",
  "a-venir": "info",
  cloturee: "neutral",
};

export function isCampaignOpen(c: Pick<CampaignItem, "status">): boolean {
  return c.status === "ouverte" || c.status === "derniere-chance";
}

/** Title, then the window in mono: "Du 8 oct. au 24 oct.". */
export function CampaignTitleCell({ campaign }: { campaign: CampaignItem }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="font-bold break-words">{campaign.title}</span>
      <span className="type-meta font-normal text-subtle">
        Du <time dateTime={campaign.opensAt}>{formatDayShort(campaign.opensAt)}</time> au{" "}
        <time dateTime={campaign.closesAt}>{formatDayShort(campaign.closesAt)}</time>
      </span>
    </div>
  );
}

/** Status badge and where the deadline stands ("Plus que 3 jours", "Ouvre le 21 oct."). */
export function CampaignStatusCell({ campaign, now = new Date() }: { campaign: CampaignItem; now?: Date }) {
  const when =
    campaign.status === "a-venir"
      ? `Ouvre le ${formatDayShort(campaign.opensAt)}`
      : deadlineLabel(campaign.closesAt, now);
  return (
    <div className="flex flex-col gap-1">
      <StatusBadge tone={CAMPAIGN_TONE[campaign.status]}>{CAMPAIGN_STATUS_LABEL[campaign.status]}</StatusBadge>
      <span className="type-small text-subtle">{when}</span>
    </div>
  );
}

/**
 * One line per role: applications received against seats, and an earlier
 * closing date when the role has one (a role may close before the rest).
 */
export function CampaignPositionsCell({
  campaign,
  applicants,
  now = new Date(),
}: {
  campaign: CampaignItem;
  applicants: Applicant[];
  now?: Date;
}) {
  return (
    <ul className="flex min-w-0 flex-col gap-1.5 md:min-w-[14rem]">
      {campaign.positions.map((p) => {
        const received = applicants.filter((a) => a.positionId === p.id && a.status !== "brouillon").length;
        const closesEarly = p.closesAt && p.closesAt !== campaign.closesAt;
        return (
          <li key={p.id} className="flex flex-col">
            <span className="font-semibold break-words">{p.title}</span>
            <span className="type-meta text-subtle">
              {plural(received, "candidature")} · {plural(p.seats, "place")}
              {closesEarly && p.closesAt && (
                <>
                  {" "}
                  · {Date.parse(p.closesAt) <= now.getTime() ? "clos" : "ferme"} le {formatDayShort(p.closesAt)}
                </>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** "14" big, then "pour 22 places". */
export function CampaignTotalCell({ received, seats }: { received: number; seats: number }) {
  return (
    <div className="flex flex-col gap-0.5 md:items-end">
      <span className="type-meta text-[1rem] font-bold text-fg">{received.toLocaleString("fr-FR")}</span>
      <span className="type-small whitespace-nowrap text-subtle">pour {plural(seats, "place")}</span>
    </div>
  );
}
