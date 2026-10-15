import Image from "next/image";
import type { EventSeries } from "@/lib/types";
import { cx } from "@/lib/cx";
import { LIT_EMBLEM } from "./event-facts";

/**
 * A recurring event's neon emblem, lit: on night the disc glows in its own
 * colour, on paper it is a clean printed badge (the glow scales with
 * --is-night). Decorative — the series name is always written next to it.
 * Size it with the className (e.g. "size-20 sm:size-24").
 */
export function SeriesEmblem({
  series,
  className,
}: {
  series: Pick<EventSeries, "emblem" | "accent">;
  className?: string;
}) {
  return (
    <span data-accent={series.accent} className={cx("relative block shrink-0 rounded-full", className)}>
      <Image
        src={series.emblem}
        alt=""
        width={154}
        height={154}
        className="size-full rounded-full transition-[filter] duration-300"
        style={LIT_EMBLEM}
      />
    </span>
  );
}
