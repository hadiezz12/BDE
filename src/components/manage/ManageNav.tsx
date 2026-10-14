"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";
import { activeSection, MANAGE_SECTIONS, type ManageSectionKey } from "./sections";

export interface ManageNavCount {
  count: number;
  /** What the number means, read by screen readers: "7 candidatures à lire". */
  label: string;
}

/**
 * Section navigation of an association workspace — the only client part of
 * the shell (it needs the pathname for the active state).
 *  - sidebar : desktop column, one row per section
 *  - rail    : phone/tablet strip, scrolls sideways and keeps the active tab in view
 * The active marker is the association's own accent.
 */
export function ManageNav({
  asso,
  counts = {},
  variant,
  className,
}: {
  asso: string;
  counts?: Partial<Record<ManageSectionKey, ManageNavCount>>;
  variant: "sidebar" | "rail";
  className?: string;
}) {
  const pathname = usePathname();
  const active = activeSection(pathname, asso);
  const listRef = useRef<HTMLUListElement>(null);

  // Rail: bring the active tab into view without moving the page vertically.
  useEffect(() => {
    if (variant !== "rail") return;
    const list = listRef.current;
    const current = list?.querySelector<HTMLElement>("[aria-current='page']");
    if (!list || !current) return;
    list.scrollLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
  }, [variant, pathname]);

  if (variant === "rail") {
    return (
      <nav aria-label="Sections de gestion" className={className}>
        <ul
          ref={listRef}
          className="relative flex overflow-x-auto overscroll-x-contain px-[calc(var(--gutter)-0.75rem)] [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] [&::-webkit-scrollbar]:hidden"
        >
          {MANAGE_SECTIONS.map((s) => {
            const isActive = s.key === active;
            const count = counts[s.key];
            return (
              <li key={s.key} className="flex shrink-0">
                <Link
                  href={s.href(asso)}
                  aria-current={isActive ? "page" : undefined}
                  className={cx(
                    "relative flex min-h-12 items-center gap-2 whitespace-nowrap px-3 text-[0.88rem] font-semibold transition-colors",
                    isActive ? "text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  <Icon name={s.icon} size={18} className={isActive ? "text-assoc-text" : "text-subtle"} />
                  {s.label}
                  {count && <CountChip count={count} />}
                  <span
                    aria-hidden
                    className={cx(
                      "absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-assoc transition-opacity",
                      isActive ? "opacity-100" : "opacity-0",
                    )}
                  />
                </Link>
              </li>
            );
          })}
          {/* Room for the fade so the last tab can scroll fully into view. */}
          <li aria-hidden className="w-10 shrink-0" />
        </ul>
      </nav>
    );
  }

  return (
    <nav aria-label="Sections de gestion" className={className}>
      <ul className="flex flex-col gap-0.5">
        {MANAGE_SECTIONS.map((s) => {
          const isActive = s.key === active;
          const count = counts[s.key];
          return (
            <li key={s.key}>
              <Link
                href={s.href(asso)}
                aria-current={isActive ? "page" : undefined}
                className={cx(
                  "relative flex min-h-10 items-center gap-3 rounded-sm px-3 text-[0.92rem] transition-colors",
                  isActive ? "bg-assoc-soft font-bold text-fg" : "font-semibold text-muted hover:bg-fg/5 hover:text-fg",
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    "absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-assoc transition-opacity",
                    isActive ? "opacity-100" : "opacity-0",
                  )}
                />
                <Icon name={s.icon} size={18} className={isActive ? "text-assoc-text" : "text-subtle"} />
                <span className="truncate">{s.label}</span>
                {count && <CountChip count={count} className="ml-auto" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function CountChip({ count, className }: { count: ManageNavCount; className?: string }) {
  return (
    <>
      <span
        aria-hidden
        className={cx(
          "inline-grid min-w-5 place-items-center rounded-xs bg-fg px-1 font-mono text-[0.7rem] font-bold leading-5 text-bg",
          className,
        )}
      >
        {count.count}
      </span>
      <span className="sr-only"> ({count.label})</span>
    </>
  );
}
