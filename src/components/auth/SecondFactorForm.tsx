"use client";

import { useActionState } from "react";
import { AUTH_MESSAGES } from "@/lib/auth/messages";
import { verifySecondFactor, type CodeState } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

/** The 6-digit code from the authenticator app, at sign-in. */
export function SecondFactorForm({ next }: { next: string | null }) {
  const [state, verify, pending] = useActionState<CodeState, FormData>(verifySecondFactor, {});
  return (
    <form action={verify} className="flex flex-col gap-5" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <Field
        label="Code de ton application d'authentification"
        hint="Ouvre l'application où tu as ajouté le Very Pink Club et entre les 6 chiffres affichés."
        error={state.problem ? AUTH_MESSAGES[state.problem] : undefined}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            name="code"
            required
            autoFocus
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="123456"
            aria-describedby={describedBy}
            aria-invalid={invalid || undefined}
            className="font-mono text-[1.375rem] tracking-[0.4em]"
          />
        )}
      </Field>
      <Button type="submit" size="lg" block icon="arrow-right" disabled={pending} aria-disabled={pending}>
        {pending ? "Vérification…" : "Terminer la connexion"}
      </Button>
    </form>
  );
}
