"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { ACCOUNT_NAV, isActive } from "@/components/layout/nav";

/**
 * The student space's own tabs, under the site header: a ruled strip on the
 * paper, the current page underlined in ink and pink. Scrolls sideways on a
 * phone (the last tab peeks out at the edge). Unread notifications are
 * counted on their tab.
 */
export function AccountNav({ unread = 0, className }: { unread?: number; className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Mon espace" className={cx("border-b border-line-strong", className)}>
      <div className="wrap">
        <ul className="rail gap-1 sm:gap-2">
          {ACCOUNT_NAV.map((item) => {
            // "Mon espace" is the parent of every other tab: only exact matches count.
            const active = item.href === routes.account ? pathname === item.href : isActive(pathname, item.href);
            const count = item.href === routes.accountNotifications ? unread : 0;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cx(
                    "relative -mb-px flex min-h-13 items-center gap-2 whitespace-nowrap border-b-[3px] px-2.5 type-nav transition-colors sm:px-3",
                    active ? "border-accent text-fg" : "border-transparent text-muted hover:border-line-strong hover:text-fg",
                  )}
                >
                  <Icon name={item.icon} size={18} className={active ? "text-accent-text" : undefined} />
                  {item.label}
                  {count > 0 && (
                    <span className="rounded-xs bg-accent px-1.5 py-0.5 font-mono text-[0.72rem] font-bold leading-none text-accent-fg">
                      <span aria-hidden>{count}</span>
                      <span className="sr-only">, {plural(count, "non lue", "non lues")}</span>
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
