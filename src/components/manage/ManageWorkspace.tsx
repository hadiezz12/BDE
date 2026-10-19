import Link from "next/link";
import type { ReactNode } from "react";
import type { WorkspaceRef } from "@/lib/governance/workspace";
import { Icon } from "@/components/ui/Icon";
import { ManageAssociationSwitcher } from "./ManageAssociationSwitcher";
import { ManageMain } from "./ManageFrame";
import { ManageNav, type ManageNavCount } from "./ManageNav";
import type { ManageSectionKey } from "./sections";

/**
 * One association's workspace: identity + section nav + page.
 *  - lg and up: white side column (sticky under the top bar) beside the page
 *  - below lg : identity bar, then a sticky sideways section rail
 * Everything inside carries the association's accent (data-accent). The nav
 * lists the sections the person's current permissions open.
 */
export function ManageWorkspace({
  association,
  managed,
  counts = {},
  publicHref,
  children,
}: {
  association: WorkspaceRef;
  managed: WorkspaceRef[];
  counts?: Partial<Record<ManageSectionKey, ManageNavCount>>;
  /** The association's public page, when it has one. */
  publicHref?: string | null;
  children: ReactNode;
}) {
  return (
    <div data-accent={association.accent} className="flex flex-1 flex-col lg:flex-row">
      {/* Phone / tablet */}
      <div className="flex items-center gap-2 border-b border-line bg-raised px-[var(--gutter)] py-2 lg:hidden">
        <ManageAssociationSwitcher current={association} options={managed} className="flex-1" />
        {publicHref && (
          <Link
            href={publicHref}
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-fg/5 hover:text-fg"
          >
            <Icon name="eye" size={20} label={`Voir la page publique de ${association.name}`} />
          </Link>
        )}
      </div>
      <ManageNav
        variant="rail"
        asso={association.slug}
        sections={association.sections}
        counts={counts}
        className="sticky top-0 z-30 border-b border-line bg-raised lg:hidden"
      />

      {/* Desktop */}
      <div className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-line bg-raised px-3 py-4 lg:flex lg:self-start">
        <ManageAssociationSwitcher current={association} options={managed} />
        <ManageNav variant="sidebar" asso={association.slug} sections={association.sections} counts={counts} />
        {publicHref && (
          <Link
            href={publicHref}
            className="mt-auto flex min-h-10 items-center gap-3 rounded-sm px-3 text-[0.85rem] font-semibold text-muted hover:bg-fg/5 hover:text-fg"
          >
            <Icon name="eye" size={18} className="text-subtle" />
            Voir la page publique
          </Link>
        )}
      </div>

      <ManageMain>{children}</ManageMain>
    </div>
  );
}
