"use client";

import { useActionState, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/format";
import { markNotificationsRead } from "@/app/actions/events";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * The message list's toolbar and wrapper. "Tout marquer comme lu" is a real
 * request (mark_notifications_read: the student's own rows only); once it
 * succeeds the wrapper takes [data-read-all] at once (the server-rendered
 * NotificationItems restyle themselves from it) and the next load shows
 * them read from the database.
 */
export function NotificationsBoard({
  unread,
  children,
  className,
}: {
  unread: number;
  children: ReactNode;
  className?: string;
}) {
  const [state, action, pending] = useActionState(markNotificationsRead, { status: "idle" });
  const allRead = state.status === "done";
  const left = allRead ? 0 : unread;

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-y-2 border-fg py-3">
        <p className="type-meta" aria-live="polite">
          {left > 0 ? (
            <>
              <span className="font-bold text-accent-text">{plural(left, "non lue", "non lues")}</span>
              <span className="text-muted"> · les plus récentes en haut</span>
            </>
          ) : (
            <span className="text-muted">Tout est lu. Les plus récentes en haut.</span>
          )}
        </p>
        <form action={action}>
          {/* aria-disabled, not disabled: the button keeps focus after the click. */}
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            icon="check"
            iconPosition="start"
            aria-disabled={left === 0 || pending}
            onClick={(event) => {
              if (left === 0 || pending) event.preventDefault();
            }}
          >
            {pending ? "Un instant…" : "Tout marquer comme lu"}
          </Button>
        </form>
      </div>
      <div role="status" className={cx(state.status === "error" && "mt-4")}>
        {state.status === "error" && (
          <p className="flex items-start gap-2 rounded-sm border-2 border-danger/60 bg-danger/10 p-3 type-small">
            <Icon name="alert" size={18} className="mt-px shrink-0 text-danger" />
            {state.message}
          </p>
        )}
      </div>
      <div data-read-all={allRead ? "" : undefined}>{children}</div>
    </div>
  );
}
