"use client";

import { usePathname } from "next/navigation";
import { setDemoRole } from "@/app/actions/demo-session";
import type { DemoRole } from "@/lib/types";
import { cx } from "@/lib/cx";

const ROLES: { role: DemoRole; label: string }[] = [
  { role: "visiteur", label: "Visiteur" },
  { role: "etudiant", label: "Compte démo étudiant·e" },
  { role: "responsable", label: "Compte démo responsable d'asso" },
];

/**
 * PHASE 1 ONLY. Lets reviewers flip between the three UX states. The two
 * accounts are demo accounts (empty, no real person) and say so.
 * Removed when Supabase Auth lands.
 */
export function DemoRoleSwitcher({ current, className }: { current: DemoRole; className?: string }) {
  const pathname = usePathname();
  return (
    <form action={setDemoRole} className={cx("flex flex-col gap-2.5", className)}>
      <input type="hidden" name="redirectTo" value={pathname} />
      <p className="type-label text-subtle">Mode démo — afficher le site en tant que</p>
      <div role="group" aria-label="Profil de démonstration" className="flex flex-wrap gap-1.5">
        {ROLES.map(({ role, label }) => (
          <button
            key={role}
            type="submit"
            name="role"
            value={role}
            aria-pressed={current === role}
            className={cx(
              "min-h-9 rounded-sm border px-3 text-[0.8rem] font-bold transition-colors",
              current === role ? "border-fg bg-fg text-bg" : "border-line-strong text-muted hover:border-fg hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </form>
  );
}
