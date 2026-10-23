"use client";

import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";
import { instantToParisLocal } from "@/lib/posts/schedule";
import { clock, stamp } from "./labels";
import type { SaveState } from "./useAutosave";

/**
 * Where the text stands, in a few words, beside the formatting bar: saved
 * (and when), not saved yet, saving, or not saved (with "Réessayer" when
 * another attempt may work). "Enregistré" only ever follows the server's
 * confirmation. Announcements to screen readers are the editor's job (only
 * the outcomes that matter, not every keystroke).
 */
export function SaveStatus({
  state,
  loadedAt,
  today,
  onRetry,
  compact = false,
  className,
}: {
  state: SaveState;
  /** When the version on screen was last saved, before this visit. */
  loadedAt: string;
  /** Today in Paris (yyyy-mm-dd), from the server. */
  today: string;
  onRetry: () => void;
  /** Beside the formatting bar: fewer words on phones, so the bar keeps its room. */
  compact?: boolean;
  className?: string;
}) {
  const words = (long: string, short: string) =>
    compact ? (
      <>
        <span className="leading-tight sm:hidden">{short}</span>
        <span className="leading-tight max-sm:hidden">{long}</span>
      </>
    ) : (
      <span className="leading-tight">{long}</span>
    );

  if (state.phase === "error" || state.phase === "conflict") {
    const retry = state.phase === "error" && state.retry;
    return (
      <span className={cx("flex items-center gap-1.5 type-small font-semibold text-danger", className)}>
        <Icon name="alert" size={16} className="shrink-0" />
        {state.phase === "conflict" ? words("Enregistrement arrêté", "Arrêté") : words("Pas enregistré", "Échec")}
        {retry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-1 inline-flex min-h-9 items-center rounded-sm px-2 underline underline-offset-2 hover:bg-danger/10"
          >
            Réessayer
          </button>
        )}
      </span>
    );
  }
  const text =
    state.phase === "saving"
      ? "Enregistrement…"
      : state.phase === "dirty"
        ? "Modifications non enregistrées"
        : state.at !== null || instantToParisLocal(loadedAt).date === today
          ? `Enregistré à ${clock(state.at ?? loadedAt)}`
          : `Enregistré le ${stamp(loadedAt)}`;
  return (
    <span className={cx("flex items-center gap-1.5 type-small", state.phase === "saved" ? "text-muted" : "text-fg", className)}>
      <Icon
        name={state.phase === "saved" ? "check" : "clock"}
        size={16}
        className={cx("shrink-0", state.phase === "saved" && "text-ok", state.phase === "saving" && "motion-safe:animate-pulse")}
      />
      {words(text, state.phase === "saving" ? "Envoi…" : state.phase === "dirty" ? "Non enregistré" : "Enregistré")}
    </span>
  );
}
