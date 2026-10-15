import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

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

/** Bottom strip: says plainly what this workspace is today. */
export function ManageFooter({ preview }: { preview: boolean }) {
  return (
    <footer className="border-t border-line">
      <div className="px-[var(--gutter)] py-6 lg:px-6">
        <p className="type-meta text-subtle">
          {preview
            ? "Aperçu de développement · compte démo fictif, aucune donnée réelle, aucun droit réel"
            : "Espace assos · ouverture avec les droits des bureaux"}
        </p>
      </div>
    </footer>
  );
}
