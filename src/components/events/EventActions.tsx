"use client";

import { createContext, use, useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * The event page's only interactive bits: register / waiting list, and the
 * "Enregistrer" toggle. They live in two places (side panel on desktop,
 * action bar on phones), so one provider holds the state and both stay in
 * sync. The page itself remains server-rendered; these are tiny leaves.
 *
 * PHASE 1 — nothing is sent or stored. Every action reveals a plain demo
 * notice in a live region; never a fake "Inscription confirmée !".
 */
export type DemoAction = "register" | "waitlist" | "save";

interface EventActionsState {
  saved: boolean;
  toggleSaved: () => void;
  notice: DemoAction | null;
  showNotice: (action: DemoAction) => void;
  dismissNotice: () => void;
}

const EventActionsContext = createContext<EventActionsState | null>(null);

function useEventActions(): EventActionsState {
  const state = use(EventActionsContext);
  if (!state) throw new Error("Event actions must be rendered inside <EventActionsProvider>.");
  return state;
}

export function EventActionsProvider({
  initialSaved = false,
  children,
}: {
  /** From the student's savedEventIds (mock). */
  initialSaved?: boolean;
  children: ReactNode;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [notice, setNotice] = useState<DemoAction | null>(null);

  const value: EventActionsState = {
    saved,
    toggleSaved: () => {
      setSaved((s) => !s);
      setNotice("save");
    },
    notice,
    showNotice: setNotice,
    dismissNotice: () => setNotice(null),
  };

  return <EventActionsContext value={value}>{children}</EventActionsContext>;
}

/** "S'inscrire" / "Rejoindre la liste d'attente" — demo: reveals the notice. */
export function RegisterButton({
  action,
  variant = "assoc",
  size = "md",
  block,
  arrow = true,
  className,
  children,
}: {
  action: "register" | "waitlist";
  /** Trailing arrow; off in the narrow phone bar. */
  arrow?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { showNotice } = useEventActions();
  return (
    <Button
      variant={variant}
      size={size}
      block={block}
      icon={arrow ? "arrow-right" : undefined}
      className={className}
      onClick={() => showNotice(action)}
    >
      {children}
    </Button>
  );
}

/**
 * Toggle button (aria-pressed, constant name "Enregistrer"). `compact` is the
 * square icon-only version for the phone bar.
 */
export function SaveToggle({ compact, className }: { compact?: boolean; className?: string }) {
  const { saved, toggleSaved } = useEventActions();
  const icon = <Icon name={saved ? "bookmark-filled" : "bookmark"} size={compact ? 20 : 18} />;

  if (compact) {
    return (
      <button
        type="button"
        aria-pressed={saved}
        aria-label="Enregistrer"
        onClick={toggleSaved}
        className={cx(
          "inline-grid size-11 shrink-0 place-items-center rounded-sm border-2 transition-colors duration-150",
          saved ? "border-accent text-accent-text" : "border-line-strong text-fg hover:border-fg",
          className,
        )}
      >
        {icon}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={saved}
      onClick={toggleSaved}
      className={cx(
        "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-sm border-2 px-5 type-button transition-colors duration-150",
        saved ? "border-accent bg-accent/10 text-fg" : "border-line-strong text-fg hover:border-fg hover:bg-fg/5",
        className,
      )}
    >
      <span className={saved ? "text-accent-text" : undefined}>{icon}</span>
      Enregistrer
    </button>
  );
}

const NOTICE: Record<DemoAction, string> = {
  register: "l'inscription n'est pas encore ouverte sur le site, rien n'est envoyé pour l'instant.",
  waitlist: "la liste d'attente n'est pas encore branchée, rien n'est envoyé pour l'instant.",
  save: "rien n'est enregistré pour l'instant, ton choix s'oublie dès que tu recharges la page.",
};

/**
 * Live region for the demo notice. Render one per visible action area (the
 * panel's and the bar's never show at the same breakpoint).
 */
export function EventDemoNotice({ className }: { className?: string }) {
  const { notice, dismissNotice } = useEventActions();
  return (
    <div role="status" aria-live="polite">
      {notice && (
        <p
          className={cx(
            "flex items-start gap-3 rounded-sm border-2 border-info/60 bg-info/10 py-2.5 pl-3 pr-1.5 type-small leading-snug",
            className,
          )}
        >
          <Icon name="info" size={18} className="mt-px shrink-0 text-info" />
          <span className="min-w-0 flex-1">
            <strong className="font-bold">Version de démonstration&nbsp;:</strong> {NOTICE[notice]}
          </span>
          <button
            type="button"
            onClick={dismissNotice}
            aria-label="Masquer ce message"
            className="-my-1 inline-grid size-8 shrink-0 place-items-center rounded-xs text-muted hover:text-fg"
          >
            <Icon name="close" size={16} />
          </button>
        </p>
      )}
    </div>
  );
}
