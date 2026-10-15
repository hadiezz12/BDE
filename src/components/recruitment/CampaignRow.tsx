import Link from "next/link";
import type { CampaignItem } from "@/lib/types";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { CAMPAIGN_STATUS_LABEL, plural } from "@/lib/format";
import { AssociationIdentity } from "@/components/associations/AssociationIdentity";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Icon } from "@/components/ui/Icon";
import { STATUS_TONE, countdown, roleTags } from "./campaign-facts";

/**
 * One campaign in the recruitment index: the countdown as a huge numeral,
 * the roles named outright, the seats as a number you can't miss. The whole
 * row is one link (stretched from the title) — no nested controls.
 *
 * Phone: identity · title · roles, then countdown / seats / arrow.
 * Tablet: countdown column on the left, seats and CTA on the right.
 * Desktop: one line on the 12-column grid (2 · 7 · 1 · 2).
 */
export function CampaignRow({
  campaign,
  headingLevel = 3,
  note,
}: {
  campaign: CampaignItem;
  headingLevel?: 2 | 3;
  /** Personal line for a signed-in student, e.g. "Ta candidature : en cours de lecture". */
  note?: string;
}) {
  const H = headingLevel === 2 ? "h2" : "h3";
  const closed = campaign.status === "cloturee";
  const urgent = campaign.status === "derniere-chance";
  const count = countdown(campaign);
  const tags = roleTags(campaign.positions);
  const status = (
    <StatusBadge tone={STATUS_TONE[campaign.status]} pulse={urgent}>
      {CAMPAIGN_STATUS_LABEL[campaign.status]}
    </StatusBadge>
  );

  return (
    <article
      data-accent={campaign.association.accent}
      className={cx(
        "group focus-ring-within relative grid items-end gap-x-5 gap-y-5 border-t border-line-strong py-7 transition-colors hover:bg-raised/60",
        "grid-cols-[auto_auto_1fr] [grid-template-areas:'main_main_main'_'count_seats_cta']",
        "sm:grid-cols-[8.5rem_minmax(0,1fr)_auto] sm:gap-x-8 sm:[grid-template-areas:'count_main_seats'_'count_main_cta']",
        "lg:grid-cols-[minmax(0,2fr)_minmax(0,7fr)_minmax(0,1fr)_minmax(0,2fr)] lg:py-9 lg:[grid-template-areas:'count_main_seats_cta']",
      )}
    >
      {/* Accent edge that lights up on hover / focus. */}
      <span
        aria-hidden
        className={cx(
          "absolute -top-px left-0 h-[3px] w-full origin-left scale-x-0 transition-transform duration-300 ease-out group-hover:scale-x-100 group-focus-within:scale-x-100",
          closed ? "bg-line-strong" : "bg-assoc",
        )}
      />

      {/* Identity, title, roles */}
      <div className="flex min-w-0 flex-col gap-3 self-start [grid-area:main]">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <AssociationIdentity association={campaign.association} size="sm" link={false} />
          <span className="sm:hidden">{status}</span>
        </div>
        <H className="type-title text-[clamp(1.45rem,1.05rem+1.6vw,2.4rem)] break-words hyphens-auto">
          <Link
            href={routes.campaign(campaign.slug)}
            className="outline-none after:absolute after:inset-0 after:content-[''] group-hover:text-assoc-text"
          >
            {campaign.title}
          </Link>
        </H>
        <ul aria-label="Postes" className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <li
              key={t}
              className={cx(
                "rounded-xs border px-2 py-1 text-[0.9rem] font-semibold leading-tight",
                closed ? "border-line text-muted" : "border-line-strong text-fg",
              )}
            >
              {t}
            </li>
          ))}
        </ul>
        {note && (
          <p className="flex items-center gap-1.5 type-meta font-bold text-fg">
            <Icon name="check" size={15} className="shrink-0 text-assoc-text" />
            {note}
          </p>
        )}
      </div>

      {/* Countdown: the numeral is decorative, the label says it in words. */}
      <div className="flex flex-col gap-1.5 [grid-area:count] sm:self-start">
        <p
          aria-hidden
          className={cx(
            "flex items-baseline gap-1 type-numeral",
            closed ? "text-subtle" : urgent ? "text-accent-text" : "text-assoc-text",
          )}
        >
          <span className={closed ? "text-[2.6rem] sm:text-[3.4rem]" : "text-[3.6rem] sm:text-[5.5rem]"}>{count.value}</span>
          {count.unit && <span className="text-[1.5rem] sm:text-[2rem]">{count.unit}</span>}
        </p>
        <p className={cx("type-meta", urgent ? "font-bold text-accent-text" : "text-muted")}>{count.label}</p>
      </div>

      {/* Seats */}
      <p
        className={cx(
          "flex flex-col gap-1.5 [grid-area:seats] sm:items-end sm:self-start lg:items-start",
          closed ? "text-subtle" : "text-fg",
        )}
      >
        <span aria-hidden className="type-numeral text-[2.6rem] sm:text-[3.4rem]">
          {campaign.seats}
        </span>
        <span aria-hidden className="type-meta text-muted">
          {campaign.seats > 1 ? "places" : "place"}
        </span>
        <span className="sr-only">{plural(campaign.seats, "place")}</span>
      </p>

      {/* Status + visual CTA (the title link carries the action). */}
      <div className="flex flex-col items-end gap-4 [grid-area:cta] lg:self-stretch lg:justify-between">
        <span className="hidden sm:block">{status}</span>
        <span
          aria-hidden
          className={cx(
            "inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-sm border-2 type-button transition-colors sm:px-4",
            closed
              ? "border-line-strong text-muted group-hover:border-fg group-hover:text-fg"
              : "border-assoc text-fg group-hover:bg-assoc group-hover:text-assoc-fg",
          )}
        >
          <span className="hidden sm:inline">{closed ? "Relire la fiche" : "Voir les postes"}</span>
          <Icon name="arrow-right" size={18} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </article>
  );
}
