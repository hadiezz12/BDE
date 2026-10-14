"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DemoNotice } from "@/components/manage/DemoNotice";

/**
 * Withdraw an application (or drop a draft), PHASE 1: asks once, in words,
 * what would happen, then says plainly that nothing was sent. The
 * application keeps its status. Focus follows the step so keyboard and
 * screen-reader users are never left on a vanished button.
 */
export function WithdrawApplication({ associationName, draft }: { associationName: string; draft: boolean }) {
  const [step, setStep] = useState<"idle" | "confirm" | "done">("idle");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const questionId = useId();

  useEffect(() => {
    // Only move focus after an interaction, never on first render.
    if (!moved.current) return;
    if (step === "confirm") confirmRef.current?.focus();
    else if (step === "done") doneRef.current?.focus();
    else triggerRef.current?.focus();
  }, [step]);

  const go = (next: typeof step) => {
    moved.current = true;
    setStep(next);
  };

  const action = draft ? "Abandonner le brouillon" : "Retirer ma candidature";

  if (step === "confirm") {
    return (
      <div
        ref={confirmRef}
        tabIndex={-1}
        role="group"
        aria-labelledby={questionId}
        className="flex flex-col gap-3 rounded-sm border-2 border-danger p-4 outline-none"
      >
        <p id={questionId} className="font-bold leading-snug">
          {draft ? "Abandonner ce brouillon ?" : "Retirer ta candidature ?"}
        </p>
        <p className="type-small text-muted">
          {draft
            ? "Tes réponses et tes pièces jointes seraient effacées. Tu pourrais toujours recommencer depuis la fiche de poste."
            : `${associationName} serait prévenu·e et ta candidature passerait en « Retirée ». Tes réponses ne seraient plus lues.`}
        </p>
        <div className="flex flex-wrap gap-2.5">
          <Button variant="danger" size="sm" onClick={() => go("done")}>
            {draft ? "Oui, abandonner" : "Oui, retirer"}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => go("idle")}>
            Annuler
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <Button ref={triggerRef} variant="danger" size="sm" onClick={() => go("confirm")}>
        {action}
      </Button>
      <div ref={doneRef} tabIndex={-1} role="status" className="outline-none">
        {step === "done" && (
          <DemoNotice>
            {draft
              ? "rien n'est effacé pour l'instant : ton brouillon reste là."
              : `rien n'est envoyé pour l'instant. Ta candidature reste telle quelle et ${associationName} n'a reçu aucun message.`}
          </DemoNotice>
        )}
      </div>
    </div>
  );
}
