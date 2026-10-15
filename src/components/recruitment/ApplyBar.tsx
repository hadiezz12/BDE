import type { ApplicationItem, CampaignItem } from "@/lib/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { deadlineLabel, plural } from "@/lib/format";
import { ButtonLink } from "@/components/ui/Button";
import { ApplyTrigger } from "./ApplyTrigger";
import { isOpen, isPositionOpen } from "./campaign-facts";

/**
 * Phone action bar of an open fiche: the deadline in words and the apply
 * button, docked just above the tab bar. It is `sticky`, not `fixed`, and must
 * be the last child of the fiche: it travels with the reader through the
 * document, then settles at its end instead of covering the footer.
 */
export function ApplyBar({
  campaign,
  mine,
  now = new Date(),
}: {
  campaign: CampaignItem;
  mine: ApplicationItem | null;
  now?: Date;
}) {
  if (!isOpen(campaign.status)) return null;
  const urgent = campaign.status === "derniere-chance";
  const openRoles = campaign.positions.filter((p) => isPositionOpen(p, campaign, now));
  const seats = openRoles.reduce((n, p) => n + p.seats, 0);
  const applied = mine && mine.status !== "brouillon" ? mine : null;

  return (
    <div
      data-surface="paper"
      className="sticky bottom-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] z-30 border-t-2 border-fg lg:hidden"
    >
      <div className="flex items-center justify-between gap-4 px-[var(--gutter)] py-3">
        <p className="flex min-w-0 flex-col gap-0.5">
          <span className={cx("type-meta font-bold", urgent && "text-accent-text")}>
            {deadlineLabel(campaign.closesAt, now)}
          </span>
          <span className="type-caption">
            {plural(openRoles.length, "poste")} · {plural(seats, "place")}
          </span>
        </p>
        {applied ? (
          <ButtonLink href={routes.accountApplication(applied.id)} variant="secondary" icon="arrow-right">
            Ma candidature
          </ButtonLink>
        ) : (
          <ApplyTrigger>Candidater</ApplyTrigger>
        )}
      </div>
    </div>
  );
}
