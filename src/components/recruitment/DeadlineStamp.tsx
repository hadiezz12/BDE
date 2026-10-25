import type { CSSProperties } from "react";
import type { CampaignStatus } from "@/lib/types";
import { cx } from "@/lib/cx";
import { deadlineLabel, formatDayMonth, formatDayShort, formatTime } from "@/lib/format";

/**
 * The deadline as a rubber stamp on the fiche: tilted, double-ruled, condensed
 * caps, worn ink. Colour follows urgency (green open, pink text in the last
 * 48 h, cyan before opening, grey when paused or over) and the plain-language
 * label is always there for screen readers — the stamp itself is decorative.
 */
const TONE: Record<CampaignStatus, string> = {
  ouverte: "text-ok",
  "derniere-chance": "text-accent-text",
  "a-venir": "text-info",
  "en-pause": "text-subtle",
  cloturee: "text-subtle",
  annulee: "text-subtle",
};

const SIZE = {
  sm: { box: "px-2.5 py-1.5 border-[3px]", date: "text-[1.6rem]", label: "text-[0.62rem]", time: "text-[0.7rem]" },
  md: { box: "px-3.5 py-2 border-[4px]", date: "text-[2.4rem]", label: "text-[0.68rem]", time: "text-[0.78rem]" },
  lg: { box: "px-5 py-3 border-[5px]", date: "text-[3.4rem] sm:text-[4rem]", label: "text-[0.75rem]", time: "text-[0.85rem]" },
} as const;

/** Worn-ink texture: a few speckles where the rubber didn't touch the paper. */
const INK: CSSProperties = {
  maskImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.7' numOctaves='2' seed='4'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -7 5'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
  maskSize: "180px 180px",
};

export function DeadlineStamp({
  closesAt,
  opensAt,
  status,
  size = "md",
  tilt = -4,
  className,
}: {
  closesAt: string;
  opensAt?: string;
  status: CampaignStatus;
  size?: keyof typeof SIZE;
  /** Degrees; stamps are never quite straight. */
  tilt?: number;
  className?: string;
}) {
  const upcoming = status === "a-venir" && opensAt;
  const iso = upcoming ? opensAt : closesAt;
  const head = upcoming ? "Ouvre le" : status === "annulee" ? "Annulé" : status === "cloturee" ? "Clos le" : "Clôture";
  const spoken = upcoming
    ? `Ouverture le ${formatDayMonth(opensAt)} à ${formatTime(opensAt)}`
    : status === "annulee"
      ? "Recrutement annulé"
      : status === "cloturee"
        ? deadlineLabel(closesAt)
        : `${deadlineLabel(closesAt)} : clôture le ${formatDayMonth(closesAt)} à ${formatTime(closesAt)}`;
  const s = SIZE[size];

  return (
    <span className={cx("inline-block", TONE[status], className)}>
      <span
        aria-hidden
        style={{ ...INK, rotate: `${tilt}deg` }}
        className={cx(
          "inline-flex flex-col items-center gap-1 rounded-sm border-double border-current text-center uppercase leading-none",
          s.box,
        )}
      >
        <span className={cx("type-label", s.label)}>{head}</span>
        <span className={cx("type-numeral whitespace-nowrap", s.date)}>{formatDayShort(iso)}</span>
        <span className={cx("type-meta font-bold tracking-[0.12em]", s.time)}>{formatTime(iso)}</span>
      </span>
      <span className="sr-only">{spoken}</span>
    </span>
  );
}
