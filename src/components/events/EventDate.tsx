import type { CampusEvent } from "@/lib/types";
import { cx } from "@/lib/cx";
import { dateParts, formatDayFull, formatDayMonth } from "@/lib/format";
import { eventPhase, isLit, isMultiDay, LIT_TEXT, relativeWords } from "./event-facts";

/**
 * The scannable date block: a big condensed numeral between a mono weekday
 * and month, then the relative words when they help ("Ce soir", "Demain
 * soir", "Dans 3 jours", "En cours"). The block itself is decorative; a
 * sentence in plain French carries the date for screen readers.
 *
 *  - single night  : MAR. / 14 / OCT.
 *  - several days  : VEN. / 14 / NOV. / → dim. 16
 *  - already going : FIN / 13 / NOV.  + "En cours"  (JUSQU'AU on lg)
 *
 * `lit` defaults to the event's own state (tonight / happening now): the
 * numeral glows on night surfaces and turns accent ink on paper. Colour comes
 * from the nearest data-accent.
 */
const SIZE = {
  sm: { numeral: "text-[2rem]", label: "text-[0.62rem]", range: "text-[0.66rem]", words: "text-[0.75rem]", gap: "gap-1" },
  md: {
    numeral: "text-[3rem] sm:text-[3.6rem] lg:text-[4.1rem]",
    label: "",
    range: "text-[0.75rem]",
    words: "text-[0.8125rem]",
    gap: "gap-1.5",
  },
  lg: {
    numeral: "text-[4.5rem] sm:text-[5.75rem]",
    label: "text-[0.8rem]",
    range: "text-[0.85rem]",
    words: "text-[0.95rem]",
    gap: "gap-2",
  },
} as const;

export type EventDateSize = keyof typeof SIZE;

export function EventDate({
  event,
  size = "md",
  align = "start",
  relative = true,
  lit,
  now = new Date(),
  className,
}: {
  event: Pick<CampusEvent, "startsAt" | "endsAt">;
  size?: EventDateSize;
  align?: "start" | "center";
  /** Show "Ce soir", "Dans 3 jours"… under the block. */
  relative?: boolean;
  /** Override the computed lit state (e.g. force off in a dense table). */
  lit?: boolean;
  now?: Date;
  className?: string;
}) {
  const s = SIZE[size];
  const phase = eventPhase(event, now);
  const multi = isMultiDay(event);
  const ongoing = multi && phase === "live" && Boolean(event.endsAt);
  const glowing = lit ?? isLit(event, now);
  const words = relative ? relativeWords(event, now) : null;

  // While a multi-day event is under way, its end date is the useful one.
  const shown = ongoing && event.endsAt ? event.endsAt : event.startsAt;
  const p = dateParts(shown);
  // "jusqu'au" only fits the big block; narrow stubs and columns say "fin".
  const head = ongoing ? (size === "lg" ? "jusqu'au" : "fin") : p.weekday;

  let rangeEnd: string | null = null;
  if (multi && !ongoing && event.endsAt) {
    const e = dateParts(event.endsAt);
    rangeEnd = e.month === p.month ? `${size === "sm" ? "" : `${e.weekday} `}${e.day}` : `${e.day} ${e.month}`;
  }

  const spoken = ongoing
    ? `Jusqu'au ${formatDayMonth(shown)}`
    : multi && event.endsAt
      ? `Du ${formatDayFull(event.startsAt).toLowerCase()} au ${formatDayFull(event.endsAt).toLowerCase()}`
      : formatDayFull(event.startsAt);

  const past = phase === "past";
  const itemAlign = align === "center" ? "items-center" : "items-start";

  return (
    <div
      className={cx(
        "flex flex-col",
        s.gap,
        itemAlign,
        align === "center" ? "text-center" : "text-left",
        past ? "text-subtle" : "text-fg",
        className,
      )}
    >
      <time dateTime={shown} className={cx("flex flex-col", itemAlign)}>
        <span aria-hidden className={cx("flex flex-col", itemAlign)}>
          <span className={cx("type-label whitespace-nowrap", s.label, !past && "text-muted")}>{head}</span>
          <span
            className={cx("type-numeral py-[0.08em]", s.numeral, glowing && "text-assoc-text")}
            style={glowing ? LIT_TEXT : undefined}
          >
            {p.day}
          </span>
          <span className={cx("type-label whitespace-nowrap", s.label, glowing && "text-assoc-text")}>{p.month}</span>
          {rangeEnd && (
            <span className={cx("mt-1 whitespace-nowrap font-mono", s.range, !past && "text-muted")}>→ {rangeEnd}</span>
          )}
        </span>
        <span className="sr-only">{spoken}</span>
      </time>
      {words && (
        <span
          className={cx(
            "max-w-[7rem] font-bold leading-tight",
            s.words,
            glowing ? "text-assoc-text" : phase === "live" ? "text-ok" : "text-fg",
          )}
        >
          {words}
        </span>
      )}
    </div>
  );
}
