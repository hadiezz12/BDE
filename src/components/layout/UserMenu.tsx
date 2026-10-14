"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { AssociationRef, Session } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { setDemoRole } from "@/app/actions/demo-session";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { Dialog } from "@/components/ui/Dialog";
import { AssociationLogo } from "@/components/associations/AssociationLogo";
import { ACCOUNT_NAV } from "./nav";
import { DemoRoleSwitcher } from "./DemoRoleSwitcher";

interface Props {
  session: Session;
  managed: AssociationRef[];
}

/** Desktop: disclosure panel under the avatar. */
export function UserMenu({ session, managed }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  useCloseOnNavigate(setOpen);

  // Close when clicking outside or pressing Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const user = session.user;
  if (!user) {
    return (
      <Link
        href={routes.login}
        className="inline-flex min-h-10 items-center rounded-sm border-2 border-line-strong px-4 type-button text-[0.78rem] hover:border-fg"
      >
        Se connecter
      </Link>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-10 items-center gap-2.5 rounded-sm py-1 pl-1 pr-2 hover:bg-fg/8"
      >
        <Avatar name={`${user.firstName} ${user.lastName}`} photo={user.avatar} accent="rose" size={32} />
        <span className="text-[0.9rem] font-bold">{user.firstName}</span>
        <Icon name="chevron-down" size={16} className={cx("transition-transform", open && "rotate-180")} />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-80 rounded-md border border-line-strong bg-raised p-2 shadow-[0_24px_60px_-20px_rgb(0_0_0/0.8)]"
      >
        <AccountLinks session={session} managed={managed} />
      </div>
    </div>
  );
}

/** Mobile: avatar button opening a bottom sheet with the same links. */
export function MobileUserButton({ session, managed }: Props) {
  const [open, setOpen] = useState(false);
  useCloseOnNavigate(setOpen);
  const user = session.user;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="inline-flex size-11 items-center justify-center rounded-sm hover:bg-fg/8"
      >
        {user ? (
          <Avatar name={`${user.firstName} ${user.lastName}`} photo={user.avatar} accent="rose" size={30} />
        ) : (
          <Icon name="user" size={22} />
        )}
        <span className="sr-only">{user ? "Mon compte" : "Connexion et options"}</span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label={user ? "Mon compte" : "Connexion"} variant="sheet">
        <div className="mx-auto max-w-xl px-3 pb-5 pt-2">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
          {user ? (
            <AccountLinks session={session} managed={managed} />
          ) : (
            <div className="flex flex-col gap-4 px-2 py-3">
              <p className="type-card">Connecte-toi avec ton mail GEM</p>
              <p className="text-muted">Pour sauvegarder des soirées, suivre tes candidatures et recevoir les rappels.</p>
              <Link
                href={routes.login}
                className="inline-flex min-h-12 items-center justify-center rounded-sm bg-accent type-button text-accent-fg"
              >
                Se connecter
              </Link>
            </div>
          )}
          <div className="mt-3 border-t border-line px-2 pt-4">
            <Link
              href={routes.safety}
              className="flex min-h-12 items-center gap-3 rounded-sm px-2 font-bold text-warn hover:bg-warn/10"
            >
              <Icon name="shield" size={20} />
              Signaler une situation — VSS / VDH
            </Link>
          </div>
          <div className="mt-3 border-t border-line px-2 pt-4">
            <DemoRoleSwitcher current={session.role} />
          </div>
        </div>
      </Dialog>
    </>
  );
}

/** Closes a popover when the route changes (adjusting state during render, not in an effect). */
function useCloseOnNavigate(setOpen: (open: boolean) => void) {
  const pathname = usePathname();
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }
}

function AccountLinks({ session, managed }: Props) {
  const user = session.user!;
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-2 py-3">
        <Avatar name={`${user.firstName} ${user.lastName}`} photo={user.avatar} accent="rose" size={44} />
        <div className="min-w-0">
          <p className="truncate font-bold">
            {user.firstName} {user.lastName}
          </p>
          <p className="truncate type-meta text-subtle">
            {user.programme} · {user.year}
          </p>
        </div>
      </div>
      <ul className="border-t border-line py-1.5">
        {ACCOUNT_NAV.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="flex min-h-11 items-center gap-3 rounded-sm px-2 font-semibold hover:bg-fg/8">
              <Icon name={item.icon} size={18} className="text-muted" />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      {managed.length > 0 && (
        <div className="border-t border-line py-1.5">
          <p className="px-2 pb-1 pt-2 type-label text-subtle">Mes associations</p>
          <ul>
            {managed.map((a) => (
              <li key={a.id}>
                <Link
                  href={routes.manageHome(a.slug)}
                  className="flex min-h-11 items-center gap-3 rounded-sm px-2 font-semibold hover:bg-fg/8"
                >
                  <AssociationLogo association={a} size={24} />
                  <span className="truncate">Gérer {a.shortName ?? a.name}</span>
                  <Icon name="arrow-right" size={16} className="ml-auto text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form action={setDemoRole} className="border-t border-line pt-1.5">
        <input type="hidden" name="role" value="visiteur" />
        <input type="hidden" name="redirectTo" value={routes.home} />
        <button type="submit" className="flex min-h-11 w-full items-center gap-3 rounded-sm px-2 font-semibold text-muted hover:bg-fg/8 hover:text-fg">
          <Icon name="logout" size={18} />
          Se déconnecter
        </button>
      </form>
    </div>
  );
}
