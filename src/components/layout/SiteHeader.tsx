import Link from "next/link";
import type { SearchEntry, Session } from "@/lib/types";
import type { ManageEntry } from "@/lib/governance/workspace";
import { routes } from "@/lib/routes";
import { BrandMark } from "@/components/brand/BrandMark";
import { Icon } from "@/components/ui/Icon";
import { CommandSearch } from "@/components/search/CommandSearch";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import type { NotificationSummary } from "@/lib/notifications/view";
import { ManageEntryMark } from "@/components/manage/ManageEntryMark";
import { NavLinks } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";
import { MobileUserButton, UserMenu } from "./UserMenu";

/**
 * One solid ink bar (no glass). Desktop: lockup · sections · utilities.
 * Mobile: lockup + safety, search, account — sections live in the tab bar,
 * and the light / dark switch in the account sheet.
 * The VSS / VDH link stays visible at every size, as in the maquette.
 * Between lg and 1440px the utilities stay compact (icons, no names, no
 * shortcut hint), and the officer's "Gérer" label waits for 2xl, so the row
 * never overflows or wraps on a laptop screen.
 */
export function SiteHeader({
  session,
  managed,
  searchIndex,
  notifications,
}: {
  session: Session;
  managed: ManageEntry[];
  searchIndex: SearchEntry[];
  /** The bell's first state (signed-in people only; it then stays current on its own). */
  notifications: NotificationSummary | null;
}) {
  const primaryManaged = managed[0];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg">
      <div className="wrap flex h-[var(--header-h)] items-center gap-2 xs:gap-3">
        <Link href={routes.home} className="group flex shrink-0 items-center gap-2 xs:gap-2.5" aria-label="Very Pink Club — accueil">
          <BrandMark
            variant="panther"
            height={38}
            decorative
            priority
            className="transition-transform duration-300 group-hover:-rotate-6"
          />
          <span aria-hidden className="flex flex-col leading-none">
            <span className="text-[0.82rem] font-black uppercase tracking-[0.03em] [font-stretch:110%] xs:text-[0.92rem] xs:[font-stretch:125%] sm:text-[1rem]">
              Very Pink Club
            </span>
            <span className="mt-1.5 font-mono text-[0.62rem] font-bold uppercase tracking-[0.12em] text-subtle">
              BDE · GEM Paris
            </span>
          </span>
        </Link>

        <nav aria-label="Sections" className="ml-2 hidden h-full self-stretch lg:flex xl:ml-8">
          <NavLinks />
        </nav>

        <div className="ml-auto flex items-center gap-0.5 lg:gap-2">
          <Link
            href={routes.safety}
            className="hidden min-h-10 items-center gap-2 whitespace-nowrap rounded-sm px-3 type-label text-warn hover:bg-warn/10 xl:inline-flex"
          >
            <Icon name="shield" size={16} />
            VSS / VDH
          </Link>
          <Link
            href={routes.safety}
            className="inline-flex size-11 items-center justify-center rounded-sm text-warn hover:bg-warn/10 xl:hidden"
          >
            <Icon name="shield" size={21} label="Signaler une situation (VSS / VDH)" />
          </Link>

          <CommandSearch index={searchIndex} />

          {session.user && notifications && <NotificationBell initial={notifications} userId={session.user.id} />}

          <div className="hidden lg:block">
            <ThemeToggle />
          </div>

          {primaryManaged && (
            <Link
              href={managed.length > 1 ? routes.manage : primaryManaged.href}
              className="hidden min-h-10 items-center gap-2 rounded-sm border border-line-strong/60 p-1 text-[0.82rem] font-bold hover:border-fg lg:inline-flex 2xl:pr-3"
            >
              <ManageEntryMark entry={primaryManaged} size={26} />
              <span className="sr-only 2xl:not-sr-only">Gérer</span>
              <span className="sr-only"> {managed.length > 1 ? "tes espaces" : primaryManaged.label}</span>
            </Link>
          )}

          <div className="hidden lg:block">
            <UserMenu session={session} managed={managed} unread={notifications?.unread ?? 0} />
          </div>
          <div className="lg:hidden">
            <MobileUserButton session={session} managed={managed} unread={notifications?.unread ?? 0} />
          </div>
        </div>
      </div>
    </header>
  );
}
