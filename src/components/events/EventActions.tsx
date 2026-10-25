"use client";

import Link from "next/link";
import {
  createContext,
  startTransition,
  use,
  useActionState,
  useOptimistic,
  useState,
  type ReactNode,
} from "react";
import {
  cancelMyRegistration,
  registerForEvent,
  setEventBookmark,
  type RegistrationActionState,
} from "@/app/actions/events";
import type { GovernanceActionState } from "@/app/actions/governance";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * The event page's interactive bits: register / join the waiting list,
 * cancel, and the "Enregistrer" toggle. They appear in two places (the side
 * panel on desktop, the action bar on phones), so one provider holds the
 * Server Actions' state and both stay in sync. The page itself stays
 * server-rendered; the actions revalidate it, so after a click it shows what
 * the database decided (confirmed, or waitlisted at a given place) — never a
 * success before the database has committed.
 */

interface EventActionsState {
  eventId: string;
  saved: boolean;
  toggleSaved: () => void;
  register: (form: FormData) => void;
  registerState: RegistrationActionState;
  registering: boolean;
  cancel: (form: FormData) => void;
  cancelState: RegistrationActionState;
  cancelling: boolean;
  bookmarkState: GovernanceActionState;
}

const EventActionsContext = createContext<EventActionsState | null>(null);

function useEventActions(): EventActionsState {
  const state = use(EventActionsContext);
  if (!state) throw new Error("Event actions must be rendered inside <EventActionsProvider>.");
  return state;
}

export function EventActionsProvider({
  eventId,
  initialSaved = false,
  children,
}: {
  eventId: string;
  /** Whether the student saved this event (my_event_status). */
  initialSaved?: boolean;
  children: ReactNode;
}) {
  const [registerState, register, registering] = useActionState(registerForEvent, { status: "idle" });
  const [cancelState, cancel, cancelling] = useActionState(cancelMyRegistration, { status: "idle" });
  const [bookmarkState, bookmark] = useActionState(setEventBookmark, { status: "idle" });
  const [saved, setSavedOptimistic] = useOptimistic(initialSaved);

  const value: EventActionsState = {
    eventId,
    saved,
    toggleSaved: () => {
      const form = new FormData();
      form.set("event_id", eventId);
      form.set("saved", saved ? "0" : "1");
      startTransition(() => {
        setSavedOptimistic(!saved);
        bookmark(form);
      });
    },
    register,
    registerState,
    registering,
    cancel,
    cancelState,
    cancelling,
    bookmarkState,
  };

  return <EventActionsContext value={value}>{children}</EventActionsContext>;
}

/** "S'inscrire" / "Rejoindre la liste d'attente": a real request; the result comes from the database. */
export function RegisterButton({
  variant = "assoc",
  size = "md",
  block,
  arrow = true,
  className,
  children,
}: {
  /** Trailing arrow; off in the narrow phone bar. */
  arrow?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { eventId, register, registering } = useEventActions();
  return (
    <form
      action={register}
      onSubmit={(event) => {
        event.preventDefault();
        if (registering) return;
        const data = new FormData(event.currentTarget);
        startTransition(() => register(data));
      }}
      className={cx(block && "w-full")}
    >
      <input type="hidden" name="event_id" value={eventId} />
      <Button
        type="submit"
        variant={variant}
        size={size}
        block={block}
        icon={arrow && !registering ? "arrow-right" : undefined}
        disabled={registering}
        aria-disabled={registering}
        className={className}
      >
        {registering ? "Un instant…" : children}
      </Button>
    </form>
  );
}

/**
 * Gives back the seat, or leaves the waiting list, after a confirmation
 * (one more click: a seat given back may be taken at once by the waiting list).
 */
export function CancelRegistration({ waitlisted, className }: { waitlisted: boolean; className?: string }) {
  const { eventId, cancel, cancelling } = useEventActions();
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={cx("inline-flex min-h-10 items-center gap-1.5 self-start type-small font-bold text-muted underline-offset-4 hover:text-danger hover:underline", className)}
      >
        <Icon name="close" size={15} />
        {waitlisted ? "Quitter la liste d'attente" : "Annuler mon inscription"}
      </button>
    );
  }
  return (
    <form
      action={cancel}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => cancel(data));
      }}
      className={cx("flex flex-col gap-3 rounded-sm border-2 border-danger/50 p-3", className)}
    >
      <input type="hidden" name="event_id" value={eventId} />
      <p className="type-small">
        {waitlisted
          ? "Tu quittes la liste d'attente : si tu changes d'avis, tu repasseras en dernier."
          : "Ta place est rendue tout de suite (elle peut revenir à la liste d'attente). Si tu changes d'avis, tu te réinscris s'il reste de la place."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="danger" size="sm" disabled={cancelling} aria-disabled={cancelling}>
          {cancelling ? "Un instant…" : waitlisted ? "Quitter la liste" : "Oui, annuler"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>
          Garder ma place
        </Button>
      </div>
    </form>
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

/**
 * What the database answered, in a live region: "C'est fait, tu es
 * inscrit·e !", "Tu es sur la liste d'attente, 3e…", or why not ("C'est
 * complet…", "Les inscriptions sont closes."). Render one per visible action
 * area (the panel's and the bar's never show at the same breakpoint).
 */
export function EventActionNotice({ className }: { className?: string }) {
  const { registerState, cancelState, bookmarkState } = useEventActions();
  // The latest answer wins.
  const latest = [registerState, cancelState, bookmarkState]
    .filter((s) => s.status !== "idle" && s.message)
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];
  return (
    <div role="status" aria-live="polite">
      {latest && (
        <p
          key={latest.at}
          className={cx(
            "flex items-start gap-3 rounded-sm border-2 py-2.5 pl-3 pr-3 type-small leading-snug",
            latest.status === "done" ? "border-ok/60 bg-ok/10" : "border-danger/60 bg-danger/10",
            className,
          )}
        >
          <Icon
            name={latest.status === "done" ? "check" : "alert"}
            size={18}
            className={cx("mt-px shrink-0", latest.status === "done" ? "text-ok" : "text-danger")}
          />
          <span className="min-w-0 flex-1">
            {latest.message}
            {latest.code === "not_authenticated" && (
              <>
                {" "}
                <Link href={routes.login} className="underline underline-offset-2">
                  Se connecter
                </Link>
              </>
            )}
            {latest.code === "profile_incomplete" && (
              <>
                {" "}
                <Link href={routes.accountOnboarding} className="underline underline-offset-2">
                  Compléter mon profil
                </Link>
              </>
            )}
          </span>
        </p>
      )}
    </div>
  );
}
