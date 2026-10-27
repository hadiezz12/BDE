"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import type { Session } from "@/lib/types";
import type { ManageEntry } from "@/lib/governance/workspace";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { signOut } from "@/app/actions/auth";
import { Avatar } from "@/components/ui/Avatar";
import { Icon } from "@/components/ui/Icon";
import { Dialog } from "@/components/ui/Dialog";
import { ManageEntryMark } from "@/components/manage/ManageEntryMark";
import { accountName, accountShortName, studyLine } from "@/components/account/identity";
import { ACCOUNT_NAV } from "./nav";
import { ThemeToggle } from "./ThemeToggle";

interface Props {
  session: Session;
  /** "Gérer…" links from the person's effective permissions (lib/governance/workspace.ts). */
  managed: ManageEntry[];
  /** Unread notifications (capped at 100 by the database), shown next to "Notifications". */
  unread?: number;
}

const unreadText = (n: number) => (n >= 100 ? "99+" : String(n));

/** Desktop: disclosure panel under the avatar. */
export function UserMenu({ session, managed, unread = 0 }: Props) {
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
    // Signed in with the first factor only: the session is not open yet.
    const pendingMfa = session.pending === "mfa";
    return (
      <Link
        href={pendingMfa ? routes.loginVerification : routes.login}
        className="inline-flex min-h-10 items-center whitespace-nowrap rounded-sm border-2 border-line-strong px-3 type-button text-[0.78rem] hover:border-fg xl:px-4"
      >
        {pendingMfa ? "Terminer la connexion" : "Se connecter"}
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
        <Avatar name={accountName(user)} photo={user.avatar} src={user.avatarUrl} accent="rose" size={32} />
        {/* Named for screen readers; on screen the avatar is enough (the header has no room for a long name next to Gérer). */}
        <span className="sr-only">
          {accountShortName(user)}
        </span>
        <Icon name="chevron-down" size={16} className={cx("transition-transform", open && "rotate-180")} />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-80 rounded-md border border-line-strong bg-raised p-2 shadow-[var(--pop-shadow)]"
      >
        <AccountLinks session={session} managed={managed} unread={unread} />
      </div>
    </div>
  );
}

/**
 * Mobile: avatar button opening a bottom sheet with the same links. Below
 * 400px the header has no room for the bell: the avatar then carries the
 * unread count, and the sheet shows it next to "Notifications".
 */
export function MobileUserButton({ session, managed, unread = 0 }: Props) {
  const [open, setOpen] = useState(false);
  useCloseOnNavigate(setOpen);
  const user = session.user;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="relative inline-flex size-11 items-center justify-center rounded-sm hover:bg-fg/8"
      >
        {user ? (
          <Avatar name={accountName(user)} photo={user.avatar} src={user.avatarUrl} accent="rose" size={30} />
        ) : (
          <Icon name="user" size={22} />
        )}
        {user && unread > 0 && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 min-w-5 rounded-xs bg-accent px-1 py-0.5 text-center font-mono text-[0.66rem] font-bold leading-none text-accent-fg ring-2 ring-bg xs:hidden"
          >
            {unreadText(unread)}
          </span>
        )}
        <span className="sr-only">
          {user ? "Mon compte" : "Connexion et options"}
          {user && unread > 0 ? `, ${unread >= 100 ? "plus de 99" : unread} ${unread > 1 ? "notifications non lues" : "notification non lue"}` : ""}
        </span>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} label={user ? "Mon compte" : "Connexion"} variant="sheet">
        <div className="mx-auto max-w-xl px-3 pb-5 pt-2">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-line-strong" aria-hidden />
          {user ? (
            <AccountLinks session={session} managed={managed} unread={unread} />
          ) : (
            <div className="flex flex-col gap-4 px-2 py-3">
              <p className="type-card">
                {session.pending === "mfa" ? "Il te reste une étape" : "Connecte-toi avec ton mail GEM"}
              </p>
              <p className="text-muted">
                {session.pending === "mfa"
                  ? "Entre le code de ton application d'authentification pour ouvrir ton espace."
                  : "Pour retrouver ton espace, tes soirées et tes candidatures."}
              </p>
              <Link
                href={session.pending === "mfa" ? routes.loginVerification : routes.login}
                className="inline-flex min-h-12 items-center justify-center rounded-sm bg-accent type-button text-accent-fg"
              >
                {session.pending === "mfa" ? "Terminer la connexion" : "Se connecter"}
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
            <ThemeToggle variant="row" />
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

function AccountLinks({ session, managed, unread = 0 }: Props) {
  const user = session.user!;
  // Only what the student filled in; nothing when they skipped it.
  const detail = session.pending === "onboarding" ? "Profil à compléter" : studyLine(user);
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 px-2 py-3">
        <Avatar name={accountName(user)} photo={user.avatar} src={user.avatarUrl} accent="rose" size={44} />
        <div className="min-w-0">
          <p className="truncate font-bold">{accountName(user)}</p>
          {detail && <p className="truncate type-meta text-subtle">{detail}</p>}
        </div>
      </div>
      <ul className="border-t border-line py-1.5">
        {ACCOUNT_NAV.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="flex min-h-11 items-center gap-3 rounded-sm px-2 font-semibold hover:bg-fg/8">
              <Icon name={item.icon} size={18} className="text-muted" />
              {item.label}
              {item.href === routes.accountNotifications && unread > 0 && (
                <span className="ml-auto rounded-xs bg-accent px-1.5 py-0.5 font-mono text-[0.72rem] font-bold leading-none text-accent-fg">
                  <span aria-hidden>{unreadText(unread)}</span>
                  <span className="sr-only">, {unread >= 100 ? "plus de 99" : unread} non lue{unread > 1 ? "s" : ""}</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
      {managed.length > 0 && (
        <div className="border-t border-line py-1.5">
          <p className="px-2 pb-1 pt-2 type-label text-subtle">Gérer</p>
          <ul>
            {managed.map((entry) => (
              <li key={entry.key}>
                <Link
                  href={entry.href}
                  className="flex min-h-11 items-center gap-3 rounded-sm px-2 py-1 font-semibold hover:bg-fg/8"
                >
                  <ManageEntryMark entry={entry} size={24} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{entry.label}</span>
                    <span className="truncate type-meta font-normal text-subtle">{entry.detail}</span>
                  </span>
                  <Icon name="arrow-right" size={16} className="ml-auto shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form action={signOut} className="border-t border-line pt-1.5">
        <button type="submit" className="flex min-h-11 w-full items-center gap-3 rounded-sm px-2 font-semibold text-muted hover:bg-fg/8 hover:text-fg">
          <Icon name="logout" size={18} />
          Se déconnecter
        </button>
      </form>
    </div>
  );
}
