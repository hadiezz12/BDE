"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/format";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toSummary, unreadBadge, type NotificationSummary } from "@/lib/notifications/view";
import { markNotificationsRead } from "@/app/actions/notifications";
import { sinceWords } from "@/components/account/account-facts";
import { Icon } from "@/components/ui/Icon";

/**
 * The bell in the site header and the workspace top bar: the unread count
 * ("99+" from 100), and on a large screen a small panel with the five
 * latest, "Tout marquer comme lu" and the way to the notification centre.
 * On a phone it is a plain link to the centre (a full page reads better
 * than a popover there); below 640px the header has no room for it and the
 * account button carries the count instead (UserMenu).
 *
 * The count comes from the server render, then stays current: a realtime
 * subscription to the person's own rows (row level security filters it),
 * and, whatever realtime does, a refresh every minute while the tab is
 * visible and whenever it comes back to the front. A new unread message is
 * announced politely to screen readers. Notifications are not authorization:
 * every link goes through /account/notifications/<id>, then to a page that
 * checks access again.
 */
export function NotificationBell({ initial, userId }: { initial: NotificationSummary; userId: string }) {
  const [live, setLive] = useState<{ from: NotificationSummary; value: NotificationSummary } | null>(null);
  // A new server render (after an action, a navigation) replaces what the browser fetched.
  const summary = live && live.from === initial ? live.value : initial;
  const [open, setOpen] = useState(false);
  const [announce, setAnnounce] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const pathname = usePathname();
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    setOpen(false);
  }

  const latestUnread = useRef(initial.unread);
  // The server's latest summary, read by the subscription without re-subscribing on every render.
  const initialRef = useRef(initial);
  useEffect(() => {
    initialRef.current = initial;
    latestUnread.current = initial.unread;
  }, [initial]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = async () => {
      const { data, error } = await supabase.rpc("my_notification_summary");
      if (stopped || error) return;
      const next = toSummary(data);
      if (!next) return;
      if (next.unread > latestUnread.current && next.latest[0] && !next.latest[0].read) {
        setAnnounce(`Nouvelle notification : ${next.latest[0].title}`);
      }
      latestUnread.current = next.unread;
      setLive({ from: initialRef.current, value: next });
    };
    // Several changes in a burst (a broadcast, a bulk action) refresh once.
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, 400);
    };
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}` }, soon)
      .subscribe();
    const every = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") soon();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      clearInterval(every);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        ref.current?.querySelector<HTMLButtonElement>("button[aria-controls]")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const count = summary.unread;
  const label = count > 0 ? `Notifications, ${count >= 100 ? "plus de 99" : count} ${count > 1 ? "non lues" : "non lue"}` : "Notifications";
  const badge =
    count > 0 ? (
      <span
        aria-hidden
        className="absolute -right-0.5 -top-0.5 min-w-5 rounded-xs bg-accent px-1 py-0.5 text-center font-mono text-[0.66rem] font-bold leading-none text-accent-fg ring-2 ring-bg"
      >
        {unreadBadge(count)}
      </span>
    ) : null;

  return (
    <div ref={ref} className="relative">
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {/* Phone and tablet: the centre itself. */}
      <Link
        href={routes.accountNotifications}
        aria-label={label}
        className="relative hidden size-11 items-center justify-center rounded-sm hover:bg-fg/8 sm:inline-flex lg:hidden"
      >
        <Icon name="bell" size={21} />
        {badge}
      </Link>
      {/* Large screens: the latest five in a panel. */}
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={cx("relative hidden size-10 items-center justify-center rounded-sm hover:bg-fg/8 lg:inline-flex", open && "bg-fg/8")}
      >
        <Icon name="bell" size={20} />
        {badge}
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-[22rem] rounded-md border border-line-strong bg-raised shadow-[var(--pop-shadow)]"
      >
        {/* Rendered only while open: the titles are not in the page twice. */}
        {open && <BellPanel summary={summary} />}
      </div>
    </div>
  );
}

function BellPanel({ summary }: { summary: NotificationSummary }) {
  const [state, action, pending] = useActionState(markNotificationsRead, { status: "idle" });
  const now = new Date();
  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 pb-2.5 pt-3.5">
        <h2 className="type-label text-fg">Notifications</h2>
        <p className="type-small text-muted">
          {summary.unread > 0 ? plural(summary.unread, "non lue", "non lues").replace(/^100 /, "99+ ") : "Tout est lu"}
        </p>
      </div>
      {summary.latest.length === 0 ? (
        <p className="px-4 py-6 type-small text-muted">
          Rien pour l&apos;instant. Tes inscriptions, candidatures et messages des assos arriveront ici.
        </p>
      ) : (
        <ul className="max-h-[min(60vh,26rem)] overflow-y-auto">
          {summary.latest.map((n) => (
            <li key={n.id} className="border-b border-line last:border-b-0">
              {/* A plain link: only a real click opens (and marks read). */}
              <a href={n.href} className="group/item relative flex flex-col gap-1 px-4 py-3 hover:bg-fg/5 focus-visible:bg-fg/5">
                {!n.read && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-xs bg-accent" />}
                <span className={cx("type-label", n.read ? "text-muted" : "text-accent-text")}>
                  {n.categoryLabel}
                  <span aria-hidden className="text-subtle">
                    {" · "}
                  </span>
                  <time dateTime={n.createdAt} className="font-normal normal-case tracking-normal">
                    {sinceWords(n.createdAt, now)}
                  </time>
                  {!n.read && <span className="sr-only">, non lue</span>}
                </span>
                <span className={cx("line-clamp-2 leading-snug group-hover/item:underline", n.read ? "font-semibold" : "font-extrabold")}>
                  {n.title}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line-strong px-3 py-2.5">
        <form action={action}>
          <button
            type="submit"
            aria-disabled={summary.unread === 0 || pending}
            onClick={(e) => {
              if (summary.unread === 0 || pending) e.preventDefault();
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-sm px-2 text-[0.85rem] font-bold hover:bg-fg/8 aria-disabled:text-subtle aria-disabled:hover:bg-transparent"
          >
            <Icon name="check" size={16} />
            {pending ? "Un instant…" : "Tout marquer comme lu"}
          </button>
        </form>
        <Link href={routes.accountNotifications} className="inline-flex min-h-10 items-center gap-1.5 rounded-sm px-2 text-[0.85rem] font-bold hover:bg-fg/8">
          Tout voir
          <Icon name="arrow-right" size={16} />
        </Link>
      </div>
      <p role="status" className={cx("px-4 text-[0.82rem]", state.status === "error" ? "pb-3 text-danger" : "sr-only")}>
        {state.status === "error" ? state.message : state.status === "done" ? state.message : ""}
      </p>
    </div>
  );
}
