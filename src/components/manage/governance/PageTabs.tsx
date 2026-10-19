"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";

/**
 * Tabs of the platform screens (BDE control center): plain links, the
 * current one marked. Sideways-scrolling on phones, like the section rail.
 */
export function PageTabs({ label, tabs }: { label: string; tabs: { href: string; label: string; exact?: boolean }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="-mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] [scrollbar-width:none] lg:mx-0 lg:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex min-h-11 items-center whitespace-nowrap px-3 text-[0.9rem] font-semibold transition-colors",
                  active ? "text-fg" : "text-muted hover:text-fg",
                )}
              >
                {t.label}
                <span aria-hidden className={cx("absolute inset-x-3 -bottom-px h-[3px] rounded-t-full bg-assoc", active ? "opacity-100" : "opacity-0")} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
