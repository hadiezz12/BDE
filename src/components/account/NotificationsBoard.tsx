"use client";

import { useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { DemoNotice } from "@/components/manage/DemoNotice";

/**
 * The notification list's toolbar and wrapper. "Tout marquer comme lu" is
 * PHASE 1 client state only: it flips [data-read-all] on the wrapper (the
 * server-rendered NotificationItems restyle themselves from it) and says
 * plainly that nothing is saved.
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
  const [allRead, setAllRead] = useState(false);
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
        {/* aria-disabled, not disabled: the button keeps focus after the click. */}
        <Button
          variant="secondary"
          size="sm"
          icon="check"
          iconPosition="start"
          aria-disabled={left === 0}
          onClick={() => {
            if (left > 0) setAllRead(true);
          }}
        >
          Tout marquer comme lu
        </Button>
      </div>
      <div role="status" className={cx(allRead && "mt-4")}>
        {allRead && (
          <DemoNotice>
            rien n&apos;est enregistré pour l&apos;instant. Au prochain chargement, tes notifications redeviennent non
            lues.
          </DemoNotice>
        )}
      </div>
      <div data-read-all={allRead ? "" : undefined}>{children}</div>
    </div>
  );
}
