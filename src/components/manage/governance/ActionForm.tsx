"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import type { GovernanceActionState } from "@/app/actions/governance";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";

type Action = (prev: GovernanceActionState, form: FormData) => Promise<GovernanceActionState>;

/**
 * A form that runs one governance Server Action and says what happened, in
 * words: the confirmation, or why the database refused (with the way to
 * turn on two-factor authentication when that is the reason).
 *
 * Once hydrated it is submitted by hand (onSubmit + preventDefault) rather
 * than through React's form action, so a refusal keeps what the person typed
 * (React resets action forms after each run); the fields are cleared only
 * after a success, when `resetOnDone` is set.
 * Hidden values (ids) are conveniences: the database checks every one.
 */
export function ActionForm({
  action,
  hidden = {},
  submitLabel,
  submitIcon,
  variant = "primary",
  size = "md",
  resetOnDone = false,
  inline = false,
  className,
  children,
}: {
  action: Action;
  hidden?: Record<string, string | undefined>;
  submitLabel: string;
  submitIcon?: IconName;
  variant?: ButtonVariant;
  size?: ButtonSize;
  resetOnDone?: boolean;
  /** One-button forms laid out in a row (accept / decline). */
  inline?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const [state, dispatch, pending] = useActionState(action, { status: "idle" });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.status === "done" && resetOnDone) formRef.current?.reset();
  }, [state, resetOnDone]);

  return (
    <form
      ref={formRef}
      // Before hydration the form posts to the Server Action (never a GET
      // that would put e-mail addresses in the URL). Once hydrated, onSubmit
      // takes over and React leaves the default-prevented submit alone.
      action={dispatch}
      className={cx(inline ? "inline-flex flex-col gap-2" : "flex flex-col gap-4", className)}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => dispatch(data));
      }}
    >
      {Object.entries(hidden).map(([name, value]) =>
        value === undefined ? null : <input key={name} type="hidden" name={name} value={value} />,
      )}
      {children}
      <div className={cx("flex flex-wrap items-center gap-3", inline && "gap-2")}>
        <Button type="submit" variant={variant} size={size} icon={submitIcon} disabled={pending} aria-disabled={pending}>
          {pending ? "Un instant…" : submitLabel}
        </Button>
      </div>
      <ActionOutcome state={state} />
    </form>
  );
}

export function ActionOutcome({ state }: { state: GovernanceActionState }) {
  if (state.status === "idle" || !state.message) return <p aria-live="polite" className="sr-only" />;
  if (state.status === "done") {
    return (
      <p key={state.at} role="status" className="flex items-start gap-2 type-small font-semibold text-ok">
        <Icon name="check" size={16} className="mt-0.5 shrink-0" />
        <span>{state.message}</span>
      </p>
    );
  }
  return (
    <div key={state.at} role="alert" className="flex items-start gap-2 type-small font-semibold text-danger">
      <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
      <span>
        {state.message}
        {state.code === "mfa_required" && (
          <>
            {" "}
            <Link href={routes.accountSecurity} className="underline underline-offset-2">
              Ouvrir Sécurité
            </Link>
          </>
        )}
        {state.code === "not_authenticated" && (
          <>
            {" "}
            <Link href={routes.login} className="underline underline-offset-2">
              Se connecter
            </Link>
          </>
        )}
      </span>
    </div>
  );
}
