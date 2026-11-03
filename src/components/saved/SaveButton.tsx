"use client";

import Link from "next/link";
import { startTransition, useActionState } from "react";
import type { SavedKind } from "@/lib/types";
import { saveItem } from "@/app/actions/saved";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";

/**
 * "Enregistrer" for an association, an article, a recruitment or a position
 * (events have theirs in EventActions). A toggle (aria-pressed, constant
 * name, the filled mark shows the state, as on the event page) whose state
 * is what the database confirmed: pressing it waits for the answer, it never
 * shows "saved" before the save is stored. Saving is only a bookmark: the
 * line under it says it is not a registration, an application or a
 * membership. A visitor gets a link to sign in that brings them back here.
 */
export function SaveButton({
  kind,
  id,
  initialSaved,
  signedIn,
  loginHref,
  compact,
  className,
}: {
  kind: SavedKind;
  id: string;
  initialSaved: boolean;
  signedIn: boolean;
  /** The sign-in page with ?next= this page. */
  loginHref: string;
  /** Icon only (lists, phone bars). */
  compact?: boolean;
  className?: string;
}) {
  const [state, act, pending] = useActionState(saveItem, { status: "idle" });
  const saved = state.status === "done" && state.saved !== undefined ? state.saved : initialSaved;
  const box = cx(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border-2 type-button transition-colors duration-150",
    compact ? "size-11 shrink-0" : "px-4",
    saved ? "border-accent bg-accent/10 text-fg" : "border-line-strong text-fg hover:border-fg hover:bg-fg/5",
  );

  if (!signedIn) {
    return (
      <Link href={loginHref} className={cx(box, className)} title="Connecte-toi avec ton compte école pour enregistrer">
        <Icon name="bookmark" size={18} />
        {compact ? <span className="sr-only">Se connecter pour enregistrer</span> : "Se connecter pour enregistrer"}
      </Link>
    );
  }

  return (
    <span className={cx("inline-flex flex-col gap-1.5", className)}>
      <button
        type="button"
        aria-pressed={saved}
        aria-busy={pending || undefined}
        aria-label={compact ? "Enregistrer" : undefined}
        title={saved ? "Retirer de tes enregistrements" : "Enregistrer pour plus tard"}
        onClick={() => {
          if (pending) return;
          const form = new FormData();
          form.set("kind", kind);
          form.set("id", id);
          form.set("saved", saved ? "0" : "1");
          startTransition(() => act(form));
        }}
        className={cx(box, pending && "opacity-70")}
      >
        <span className={saved ? "text-accent-text" : undefined}>
          <Icon name={saved ? "bookmark-filled" : "bookmark"} size={18} />
        </span>
        {!compact && "Enregistrer"}
      </button>
      <span
        role="status"
        aria-live="polite"
        className={cx(
          "type-meta",
          state.status === "error" ? "text-danger" : state.status === "done" && !compact ? "text-muted" : "sr-only",
        )}
      >
        {state.status !== "idle" ? state.message : ""}
      </span>
    </span>
  );
}
