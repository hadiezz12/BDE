"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";

const EVENT = "vpc:action-done";

/**
 * Says that an action worked when the form that ran it is gone: a success
 * often changes the page so that its own form disappears (a question answered,
 * a slot booked, a review submitted), taking its confirmation with it. The
 * form calls this right after the result; if the form is no longer in the
 * page a moment later, the message is shown in the announcer instead.
 */
export function announceIfGone(form: HTMLFormElement | null, message: string | undefined) {
  if (!message || typeof window === "undefined") return;
  // The refreshed page arrives a little after the result: look a few times over three seconds.
  let tries = 0;
  const look = () => {
    if (!form || !form.isConnected) window.dispatchEvent(new CustomEvent(EVENT, { detail: message }));
    else if (++tries < 8) window.setTimeout(look, 400);
  };
  window.setTimeout(look, 300);
}

/** One per layout: a status line pinned to the bottom of the screen, read out, closed by hand or after a while. */
export function DoneAnnouncer() {
  const [message, setMessage] = useState<{ text: string; at: number } | null>(null);

  useEffect(() => {
    const on = (e: Event) => setMessage({ text: String((e as CustomEvent).detail), at: Date.now() });
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(null), 9000);
    return () => window.clearTimeout(t);
  }, [message]);

  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-[var(--gutter)]">
      {message && (
        <p
          key={message.at}
          className="pointer-events-auto flex max-w-xl items-start gap-3 rounded-md border border-ok/50 bg-raised px-4 py-3 type-small font-semibold text-fg shadow-lg"
        >
          <Icon name="check" size={16} className="mt-0.5 shrink-0 text-ok" />
          <span className="flex-1">{message.text}</span>
          <button type="button" onClick={() => setMessage(null)} className="shrink-0 text-muted hover:text-fg" aria-label="Fermer">
            <Icon name="close" size={16} />
          </button>
        </p>
      )}
    </div>
  );
}
