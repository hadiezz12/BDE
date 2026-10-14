import type { DemoRole, Photo } from "@/lib/types";
import { cx } from "@/lib/cx";
import { setDemoRole } from "@/app/actions/demo-session";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";

/**
 * PHASE 1 ONLY — the login screen's "Mode démo": three large choices that
 * call the existing setDemoRole action. Each choice is its own tiny form, so
 * it works without JavaScript and can land on its own page. Removed when
 * Supabase Auth lands.
 */
export interface DemoChoice {
  role: DemoRole;
  label: string;
  /** Who the role renders as ("Inès Belkacem"); none for the visitor. */
  person?: string;
  photo?: Photo;
  detail: string;
  /** Same-site path to land on after switching. */
  redirectTo: string;
}

export function DemoRolePicker({
  choices,
  current,
  className,
}: {
  choices: DemoChoice[];
  current: DemoRole;
  className?: string;
}) {
  return (
    <ul className={cx("flex flex-col gap-2.5", className)}>
      {choices.map((c) => {
        const active = c.role === current;
        return (
          <li key={c.role}>
            <form action={setDemoRole}>
              <input type="hidden" name="role" value={c.role} />
              <input type="hidden" name="redirectTo" value={c.redirectTo} />
              <button
                type="submit"
                className={cx(
                  "group flex min-h-16 w-full items-center gap-4 rounded-sm border-2 px-4 py-3.5 text-left transition-colors",
                  active ? "border-fg bg-raised" : "border-line-strong/60 hover:border-fg",
                )}
              >
                {c.person ? (
                  <span aria-hidden className="shrink-0">
                    <Avatar name={c.person} photo={c.photo} accent="rose" size={40} />
                  </span>
                ) : (
                  <span
                    aria-hidden
                    className="grid size-10 shrink-0 place-items-center rounded-full border border-line-strong text-muted"
                  >
                    <Icon name="user" size={20} />
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-bold leading-snug">
                      <span className="sr-only">Continuer en tant que </span>
                      {c.label}
                      {c.person && <span className="font-semibold text-muted"> — {c.person}</span>}
                    </span>
                    {active && <StatusBadge tone="ok">Profil actuel</StatusBadge>}
                  </span>
                  <span className="type-small text-muted">{c.detail}</span>
                </span>
                <Icon
                  name="arrow-right"
                  size={18}
                  className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-fg"
                />
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  );
}
