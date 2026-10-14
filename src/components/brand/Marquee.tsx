import { Fragment, type CSSProperties, type ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * The maquette's scrolling ticker ("effet déroulant"). Content is rendered
 * twice for a seamless loop; the copy is hidden from assistive tech. Pauses
 * on hover/focus; with reduced motion it becomes a static, scrollable row.
 */
export function Marquee({
  items,
  label,
  duration = 45,
  separator = <span aria-hidden className="inline-block size-1.5 rotate-45 bg-info" />,
  className,
}: {
  items: ReactNode[];
  /** Accessible name of the ticker, e.g. "Événements de l'année". */
  label: string;
  duration?: number;
  separator?: ReactNode;
  className?: string;
}) {
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {items.map((item, i) => (
        <Fragment key={i}>
          <li className="flex items-center px-6 sm:px-9">{item}</li>
          <li aria-hidden className="flex items-center">
            {separator}
          </li>
        </Fragment>
      ))}
    </ul>
  );
  return (
    <section
      aria-label={label}
      className={cx("group overflow-hidden motion-reduce:overflow-x-auto", className)}
    >
      <div
        className="marquee-track group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]"
        style={{ "--marquee-duration": `${duration}s` } as CSSProperties}
      >
        {row(false)}
        <div className="flex motion-reduce:hidden">{row(true)}</div>
      </div>
    </section>
  );
}
