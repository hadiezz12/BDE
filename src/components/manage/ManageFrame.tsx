import type { ReactNode } from "react";
import type { DemoRole } from "@/lib/types";
import { cx } from "@/lib/cx";
import { DemoRoleSwitcher } from "@/components/layout/DemoRoleSwitcher";

/**
 * The page region of the workspace (skip-link target #contenu).
 * The /manage/[asso] layout already renders it around section pages; screens
 * outside an association (the /manage chooser, the 404) wrap themselves in it.
 */
export function ManageMain({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main id="contenu" className={cx("min-w-0 flex-1 px-[var(--gutter)] pb-16 pt-6 lg:px-10 lg:pt-8", className)}>
      <div className="mx-auto w-full max-w-[78rem]">{children}</div>
    </main>
  );
}

/** Bottom strip: the Phase 1 demo switcher, reachable at every size. */
export function ManageFooter({ role }: { role: DemoRole }) {
  return (
    <footer className="border-t border-line">
      <div className="flex flex-col gap-5 px-[var(--gutter)] py-6 lg:flex-row lg:items-end lg:justify-between lg:px-6">
        <DemoRoleSwitcher current={role} />
        <p className="type-meta text-subtle">Version de démonstration · données fictives, rien n&apos;est enregistré</p>
      </div>
    </footer>
  );
}
