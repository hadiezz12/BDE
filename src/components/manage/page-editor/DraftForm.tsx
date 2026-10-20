"use client";

import { startTransition, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { saveDraftSection, type PageActionState } from "@/app/actions/association-page";
import type { FieldErrors } from "@/lib/associations/validation";
import { cx } from "@/lib/cx";
import { Button } from "@/components/ui/Button";
import { ActionOutcome } from "@/components/manage/governance/ActionForm";

export type DraftSection = "identity" | "presentation" | "contact" | "appearance";

/**
 * One section of the page editor (identity, presentation, contact,
 * appearance). Saving writes the draft only; the public page changes when
 * someone with the right publishes.
 *
 * `base` is what the editor loaded for this section's fields: the database
 * saves a field only if nobody changed it since (or if the new value is the
 * same), so two people editing different sections never overwrite each
 * other, and a real clash is refused with the fields named. A refusal keeps
 * what was typed (the form is submitted by hand, never reset). Leaving with
 * unsaved changes asks first.
 */
export function DraftForm({
  organizationId,
  section,
  base,
  known = [],
  next,
  label,
  submitLabel = "Enregistrer le brouillon",
  readOnly = false,
  className,
  children,
}: {
  organizationId: string;
  section: DraftSection;
  base: Record<string, unknown>;
  /** Ids the form may use (categories, images), for clear messages before the database checks. */
  known?: string[];
  /** Setup wizard: where to go after a successful save. */
  next?: string;
  /** Accessible name of the form. */
  label: string;
  submitLabel?: string;
  /** The person may publish but not edit: fields shown, no save button. */
  readOnly?: boolean;
  className?: string;
  children: (errors: FieldErrors) => ReactNode;
}) {
  const [state, dispatch, pending] = useActionState<PageActionState, FormData>(saveDraftSection, { status: "idle" });
  // Edits typed so far, and how many of them the last submitted save carried:
  // after a success, only what was typed since is unsaved; after a refusal, everything.
  const [edits, setEdits] = useState(0);
  const [submitted, setSubmitted] = useState(0);
  const dirty = state.status === "done" ? edits > submitted : edits > 0;
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <form
      ref={formRef}
      aria-label={label}
      action={dispatch}
      noValidate
      onChange={() => setEdits((n) => n + 1)}
      onSubmit={(event) => {
        event.preventDefault();
        setSubmitted(edits);
        const data = new FormData(event.currentTarget);
        startTransition(() => dispatch(data));
      }}
      className={cx("flex flex-col gap-6", className)}
    >
      <input type="hidden" name="organization_id" value={organizationId} />
      <input type="hidden" name="section" value={section} />
      <input type="hidden" name="base" value={JSON.stringify(base)} />
      <input type="hidden" name="known" value={known.join(",")} />
      {next && <input type="hidden" name="next" value={next} />}
      <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-6">
        {children(state.fieldErrors ?? {})}
      </fieldset>
      {!readOnly && (
        <div className="flex flex-col gap-3 border-t border-line pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" icon="check" iconPosition="start" disabled={pending} aria-disabled={pending}>
              {pending ? "Enregistrement…" : submitLabel}
            </Button>
            {dirty && !pending && (
              <span className="type-meta text-subtle" aria-live="polite">
                Modifications pas encore enregistrées
              </span>
            )}
          </div>
          <ActionOutcome state={state} />
        </div>
      )}
    </form>
  );
}

/** "123 / 280": a live count under a text field. */
export function CharCount({ value, max }: { value: string; max: number }) {
  const over = value.length > max;
  return (
    <span className={cx("type-meta tabular-nums", over ? "font-semibold text-danger" : "text-subtle")}>
      {value.length} / {max}
    </span>
  );
}
