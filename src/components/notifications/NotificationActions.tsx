"use client";

import { useActionState } from "react";
import { archiveNotifications, markNotificationsRead } from "@/app/actions/notifications";
import { Icon } from "@/components/ui/Icon";

/**
 * The small actions under one notification: mark it read, archive it, or
 * bring it back from the archive. They sit above the line's link (relative,
 * z-10), so clicking them never opens the notification. Each one is a real
 * request on the person's own row; the page re-renders from the database.
 */
export function NotificationActions({ id, read, archived, title }: { id: number; read: boolean; archived: boolean; title: string }) {
  const [readState, readAction, readPending] = useActionState(markNotificationsRead, { status: "idle" });
  const [archiveState, archiveAction, archivePending] = useActionState(archiveNotifications, { status: "idle" });
  const error = readState.status === "error" ? readState.message : archiveState.status === "error" ? archiveState.message : null;
  const button =
    "relative z-10 inline-flex min-h-9 items-center gap-1.5 rounded-sm px-2 -ml-2 text-[0.8rem] font-bold text-muted hover:bg-fg/8 hover:text-fg";

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
      {!read && !archived && (
        <form action={readAction}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" className={button} aria-label={`Marquer comme lue : ${title}`} disabled={readPending}>
            <Icon name="check" size={15} />
            {readPending ? "…" : "Marquer comme lue"}
          </button>
        </form>
      )}
      <form action={archiveAction}>
        <input type="hidden" name="id" value={id} />
        {archived && <input type="hidden" name="restore" value="1" />}
        <button
          type="submit"
          className={button}
          aria-label={`${archived ? "Remettre dans les notifications" : "Archiver"} : ${title}`}
          disabled={archivePending}
        >
          <Icon name={archived ? "undo" : "minus"} size={15} />
          {archivePending ? "…" : archived ? "Remettre" : "Archiver"}
        </button>
      </form>
      <span role="status" className="relative z-10 text-[0.8rem] text-danger">
        {error}
      </span>
    </div>
  );
}
