"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { Icon } from "@/components/ui/Icon";
import { isActive, PRIMARY_NAV } from "./nav";

const TABS = [{ href: routes.home, label: "Accueil", short: "Accueil", icon: "home" as const }, ...PRIMARY_NAV];

/**
 * Phone navigation lives at the thumb: five fixed tabs. Account, search and
 * the safety link sit in the top bar, so nothing important is two taps deep.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden"
    >
      <ul className="mx-auto grid h-[var(--tabbar-h)] max-w-xl grid-cols-5">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <li key={tab.href} className="flex">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex flex-1 flex-col items-center justify-center gap-1 text-[0.7rem] font-bold tracking-wide transition-colors",
                  active ? "text-fg" : "text-subtle hover:text-fg",
                )}
              >
                <span
                  aria-hidden
                  className={cx(
                    "absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-accent transition-opacity",
                    active ? "opacity-100 shadow-[0_0_10px_1px_rgb(250_4_121/0.7)]" : "opacity-0",
                  )}
                />
                <Icon name={tab.icon} size={22} className={active ? "text-accent-text" : undefined} />
                {tab.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
