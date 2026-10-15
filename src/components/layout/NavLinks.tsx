"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/lib/cx";
import { isActive, PRIMARY_NAV } from "./nav";

/** Desktop primary navigation. The active section gets a lit neon bar. */
export function NavLinks() {
  const pathname = usePathname();
  return (
    <ul className="flex items-stretch gap-1">
      {PRIMARY_NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href} className="flex">
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "relative flex items-center px-3 type-nav transition-colors xl:px-4",
                active ? "text-fg" : "text-muted hover:text-fg",
              )}
            >
              {item.label}
              <span
                aria-hidden
                className={cx(
                  "absolute inset-x-3 bottom-0 h-[3px] rounded-full bg-accent transition-opacity xl:inset-x-4",
                  active ? "opacity-100 shadow-[0_0_10px_1px_rgb(250_4_121/0.7)]" : "opacity-0",
                )}
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
