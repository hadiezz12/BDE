"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { withdrawApplication } from "@/app/actions/recruitment";
import type { GovernanceActionState } from "@/app/actions/governance";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Field";

/**
 * Withdraws a sent application (withdraw_application): asks once, in words,
 * what will happen, with an optional reason. The application stays readable,
 * marked "Retirée"; the position frees up for another application. Focus
 * follows the step so keyboard and screen-reader users are never left on a
 * vanished button.
 */
export function WithdrawApplication({ applicationId, associationName }: { applicationId: string; associationName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<GovernanceActionState, FormData>(withdrawApplication, { status: "idle" });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLFormElement>(null);
  const moved = useRef(false);
  const questionId = useId();

  useEffect(() => {
    if (!moved.current) return;
    if (confirming) confirmRef.current?.focus();
    else triggerRef.current?.focus();
  }, [confirming]);

  if (confirming) {
    return (
      <form
        ref={confirmRef}
        action={action}
        tabIndex={-1}
        aria-labelledby={questionId}
        className="flex flex-col gap-3 rounded-sm border-2 border-danger p-4 outline-none"
      >
        <input type="hidden" name="application_id" value={applicationId} />
        <p id={questionId} className="font-bold leading-snug">
          Retirer ta candidature&nbsp;?
        </p>
        <p className="type-small text-muted">
          Elle passera en «&nbsp;Retirée&nbsp;» : {associationName} ne la comptera plus parmi les candidatures envoyées. Elle restera lisible ici. Tu pourras
          candidater de nouveau à ce poste tant que le recrutement est ouvert.
        </p>
        <Field label="Pourquoi tu la retires" optional hint="Gardé avec ta candidature. 500 caractères au plus.">
          {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="reason" rows={3} maxLength={500} className="min-h-20" />}
        </Field>
        <div className="flex flex-wrap gap-2.5">
          <Button type="submit" variant="danger" size="sm" disabled={pending}>
            {pending ? "Un instant…" : "Oui, retirer"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              moved.current = true;
              setConfirming(false);
            }}
          >
            Annuler
          </Button>
        </div>
        {state.status === "error" && state.message && (
          <p role="alert" className="type-small font-semibold text-danger">
            {state.message}
          </p>
        )}
      </form>
    );
  }

  return (
    <Button
      ref={triggerRef}
      variant="danger"
      size="sm"
      onClick={() => {
        moved.current = true;
        setConfirming(true);
      }}
    >
      Retirer ma candidature
    </Button>
  );
}
