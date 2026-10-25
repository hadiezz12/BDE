import Link from "next/link";
import type { CampaignItem } from "@/lib/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { CAMPAIGN_STATUS_LABEL } from "@/lib/format";
import { AssociationIdentity } from "@/components/associations/AssociationIdentity";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Icon } from "@/components/ui/Icon";
import { STATUS_TONE, positionsLine, shortDeadline } from "./campaign-facts";

/**
 * Compact campaign for rails (home, association page, student space, the
 * "encore ouverts" list of a closed campaign). One stretched link; the
 * accent bar on top says whose it is before the name does.
 */
export function CampaignCard({
  campaign,
  headingLevel = 3,
  className,
}: {
  campaign: CampaignItem;
  headingLevel?: 2 | 3 | 4;
  /** Width is the caller's call; rails usually pass a fixed width. */
  className?: string;
}) {
  const H = `h${headingLevel}` as "h2" | "h3" | "h4";
  const urgent = campaign.status === "derniere-chance";

  return (
    <article
      data-accent={campaign.association.accent}
      className={cx(
        "group focus-ring-within relative flex flex-col gap-4 overflow-hidden rounded-sm border border-line-strong bg-raised p-5 pt-6 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-assoc",
        className,
      )}
    >
      <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-assoc" />
      <AssociationIdentity association={campaign.association} size="sm" link={false} />
      <H className="type-card text-[1.3rem] break-words hyphens-auto">
        <Link
          href={routes.campaign(campaign.slug)}
          className="outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-assoc-text"
        >
          {campaign.title}
        </Link>
      </H>
      <p className="type-meta text-muted">{positionsLine(campaign)}</p>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3">
        <div className="flex min-w-0 flex-col gap-1">
          <StatusBadge tone={STATUS_TONE[campaign.status]} pulse={urgent}>
            {CAMPAIGN_STATUS_LABEL[campaign.status]}
          </StatusBadge>
          <p className={cx("type-small", urgent ? "font-bold text-accent-text" : "text-fg")}>{shortDeadline(campaign)}</p>
        </div>
        <Icon
          name="arrow-right"
          size={20}
          className="shrink-0 text-assoc-text transition-transform group-hover:translate-x-0.5"
        />
      </div>
    </article>
  );
}
