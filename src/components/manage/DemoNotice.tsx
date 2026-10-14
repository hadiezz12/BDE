import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";

/**
 * PHASE 1 — says plainly that an action does nothing yet. Never fake a
 * success ("Événement publié !"): the bureau must not believe it worked.
 * Static use: next to a form or control. After an action: see DemoForm /
 * DemoActionButton, which reveal it in a live region.
 */
export function DemoNotice({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <p
      className={cx(
        "flex items-start gap-2.5 rounded-sm border border-line-strong bg-sunken px-3.5 py-2.5 text-left type-small text-fg",
        className,
      )}
    >
      <Icon name="info" size={18} className="mt-px shrink-0 text-info" />
      <span>
        <strong className="font-bold">Version de démonstration&nbsp;:</strong>{" "}
        {children ?? "rien n'est envoyé pour l'instant."}
      </span>
    </p>
  );
}
