import Link from "next/link";
import type { AssociationRef, Session } from "@/lib/types";
import { routes } from "@/lib/routes";
import { BrandMark } from "@/components/brand/BrandMark";
import { Icon } from "@/components/ui/Icon";
import { MobileUserButton, UserMenu } from "@/components/layout/UserMenu";

/**
 * The sign above the office door: a thin ink (night) strip with the panther,
 * then everything below is the calm studio surface. Compact on purpose —
 * the workspace needs the height. Sticky from lg: up; on phones the section
 * rail is the sticky element instead.
 */
export function ManageTopBar({ session, managed }: { session: Session; managed: AssociationRef[] }) {
  return (
    <header data-surface="night" data-theme="dark" className="z-40 border-b border-line lg:sticky lg:top-0">
      <div className="flex h-14 items-center gap-3 px-[var(--gutter)] lg:px-6">
        <Link href={routes.manage} className="group flex shrink-0 items-center gap-2.5">
          <BrandMark
            variant="panther"
            height={30}
            decorative
            className="transition-transform duration-300 group-hover:-rotate-6"
          />
          <span className="flex flex-col leading-none">
            <span className="hidden text-[0.85rem] font-black uppercase tracking-[0.03em] [font-stretch:125%] xs:block">
              Very Pink Club
            </span>
            <span className="font-mono text-[0.62rem] font-bold uppercase tracking-[0.12em] text-accent-text xs:mt-1.5">
              Espace assos
            </span>
          </span>
        </Link>

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

          <Link
            href={routes.home}
            className="hidden min-h-10 items-center gap-2 rounded-sm px-3 text-[0.85rem] font-semibold text-muted hover:bg-fg/8 hover:text-fg lg:inline-flex"
          >
            <Icon name="arrow-left" size={16} />
            Retour au site
          </Link>
          <Link
            href={routes.home}
            className="inline-flex size-11 items-center justify-center rounded-sm text-muted hover:bg-fg/8 hover:text-fg lg:hidden"
          >
            <Icon name="arrow-left" size={20} label="Retour au site public" />
          </Link>

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
