import type { ReactNode } from "react";
import type { CampusEvent } from "@/lib/types";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "@/components/ui/Icon";
import { timeRange, venueLine } from "./event-facts";

/**
 * When and where — what a student checks before saying yes. Times in mono
 * (metadata), the venue in plain text ("En ligne" for an online event).
 *
 *  - stack  : one line each with a small glyph (rows, posters, detail aside)
 *  - inline : a single run "20h30 → 1h · salle · campus" (compact lists)
 */
export type EventFact = "time" | "venue";

export function EventFacts({
  event,
  show = ["time", "venue"],
  layout = "stack",
  now = new Date(),
  className,
}: {
  event: Pick<CampusEvent, "startsAt" | "endsAt" | "venue">;
  show?: EventFact[];
  layout?: "stack" | "inline";
  now?: Date;
  className?: string;
}) {
  const range = timeRange(event, now);
  const items: Array<{ key: EventFact; icon: IconName; node: ReactNode; mono: boolean }> = [];

  for (const key of show) {
    if (key === "time") {
      items.push({
        key,
        icon: "clock",
        mono: true,
        node: (
          <>
            <span aria-hidden>{range.text}</span>
            <span className="sr-only">{range.spoken}</span>
          </>
        ),
      });
    } else {
      items.push({ key, icon: event.venue.type === "online" ? "globe" : "pin", mono: false, node: venueLine(event.venue) });
    }
  }

  if (layout === "inline") {
    return (
      <p className={cx("type-small text-muted", className)}>
        {items.map((it, i) => (
          <span key={it.key} className={cx(it.mono && "font-mono text-[0.8125rem]")}>
            {i > 0 && (
              <span aria-hidden className="mx-1.5 font-sans text-subtle">
                ·
              </span>
            )}
            {it.node}
          </span>
        ))}
      </p>
    );
  }

  return (
    <ul className={cx("flex flex-col gap-1", className)}>
      {items.map((it) => (
        <li key={it.key} className="flex min-w-0 items-start gap-2 text-muted">
          <Icon name={it.icon} size={15} className="mt-[0.2rem] shrink-0 text-subtle" />
          <span className={cx("min-w-0", it.mono ? "type-meta pt-px" : "type-small")}>{it.node}</span>
        </li>
      ))}
    </ul>
  );
}
