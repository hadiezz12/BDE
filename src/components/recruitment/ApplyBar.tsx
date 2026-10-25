import type { ApplicationItem, CampaignItem } from "@/lib/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { deadlineLabel, plural } from "@/lib/format";
import { ButtonLink } from "@/components/ui/Button";
import { isOpen, openPositions } from "./campaign-facts";

/**
 * Phone action bar of an open fiche: the deadline in words and the way to
 * the positions (or to the student's draft), docked just above the tab bar.
 * It is `sticky`, not `fixed`, and must be the last child of the fiche: it
 * travels with the reader through the document, then settles at its end
 * instead of covering the footer.
 */
export function ApplyBar({
  campaign,
  mine,
  now = new Date(),
}: {
  campaign: CampaignItem;
  /** The student's applications to this campaign that still count. */
  mine: ApplicationItem[];
  now?: Date;
}) {
  if (!isOpen(campaign.status)) return null;
  const urgent = campaign.status === "derniere-chance";
  const roles = openPositions(campaign);
  const draft = mine.find((a) => a.status === "brouillon");
  const full = mine.length >= campaign.maxApplications;

  return (
    <div
      data-surface="paper"
      className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-30 border-t-2 border-fg lg:hidden"
    >
      <div className="flex items-center justify-between gap-4 px-[var(--gutter)] py-3">
        <p className="flex min-w-0 flex-col gap-0.5">
          <span className={cx("type-meta font-bold", urgent && "text-accent-text")}>{deadlineLabel(campaign.closesAt, now)}</span>
          <span className="type-caption">{plural(roles.length, "poste ouvert", "postes ouverts")}</span>
        </p>
        {draft ? (
          <ButtonLink href={routes.accountApplication(draft.id)} icon="arrow-right">
            Mon brouillon
          </ButtonLink>
        ) : full && mine[0] ? (
          <ButtonLink href={routes.accountApplication(mine[0].id)} variant="secondary" icon="arrow-right">
            Ma candidature
          </ButtonLink>
        ) : roles.length > 0 ? (
          <ButtonLink href="#postes" icon="arrow-right">
            Candidater
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
