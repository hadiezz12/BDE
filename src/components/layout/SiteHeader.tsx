import Link from "next/link";
import type { AssociationRef, SearchEntry, Session } from "@/lib/types";
import { routes } from "@/lib/routes";
import { BrandMark } from "@/components/brand/BrandMark";
import { Icon } from "@/components/ui/Icon";
import { CommandSearch } from "@/components/search/CommandSearch";
import { AssociationLogo } from "@/components/associations/AssociationLogo";
import { NavLinks } from "./NavLinks";
import { MobileUserButton, UserMenu } from "./UserMenu";

/**
 * One solid ink bar (no glass). Desktop: lockup · sections · utilities.
 * Mobile: lockup + safety, search, account — sections live in the tab bar.
 * The VSS / VDH link stays visible at every size, as in the maquette.
 */
export function SiteHeader({
  session,
  managed,
  searchIndex,
}: {
  session: Session;
  managed: AssociationRef[];
  searchIndex: SearchEntry[];
}) {
  const primaryManaged = managed[0];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg">
      <div className="wrap flex h-[var(--header-h)] items-center gap-3">
        <Link href={routes.home} className="group flex shrink-0 items-center gap-2.5" aria-label="Very Pink Club — accueil">
          <BrandMark
            variant="panther"
            height={38}
            decorative
            priority
            className="transition-transform duration-300 group-hover:-rotate-6"
          />
          <span aria-hidden className="flex flex-col leading-none">
            <span className="text-[0.92rem] font-black uppercase tracking-[0.03em] [font-stretch:125%] xs:text-[1rem]">
              Very Pink Club
            </span>
            <span className="mt-1.5 font-mono text-[0.62rem] font-bold uppercase tracking-[0.12em] text-subtle">
              BDE · GEM Paris
            </span>
          </span>
        </Link>

        <nav aria-label="Sections" className="ml-4 hidden h-full self-stretch lg:flex xl:ml-8">
          <NavLinks />
        </nav>

        <div className="ml-auto flex items-center gap-0.5 lg:gap-2">
          <Link
            href={routes.safety}
            className="hidden min-h-10 items-center gap-2 rounded-sm px-3 type-label text-warn hover:bg-warn/10 lg:inline-flex"
          >
            <Icon name="shield" size={16} />
            VSS / VDH
          </Link>
          <Link
            href={routes.safety}
            className="inline-flex size-11 items-center justify-center rounded-sm text-warn hover:bg-warn/10 lg:hidden"
          >
            <Icon name="shield" size={21} label="Signaler une situation (VSS / VDH)" />
          </Link>

          <CommandSearch index={searchIndex} />

          {primaryManaged && (
            <Link
              href={routes.manageHome(primaryManaged.slug)}
              className="hidden min-h-10 items-center gap-2 rounded-sm border border-line-strong/60 py-1 pl-1 pr-3 text-[0.82rem] font-bold hover:border-fg lg:inline-flex"
            >
              <AssociationLogo association={primaryManaged} size={26} />
              Gérer
            </Link>
          )}

          <div className="hidden lg:block">
            <UserMenu session={session} managed={managed} />
          </div>
          <div className="lg:hidden">
            <MobileUserButton session={session} managed={managed} />
          </div>
        </div>
      </div>
    </header>
  );
}
