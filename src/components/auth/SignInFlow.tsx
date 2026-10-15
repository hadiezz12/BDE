"use client";

import { useActionState, useEffect, useState } from "react";
import { cx } from "@/lib/cx";
import { AUTH_MESSAGES, type AuthProblem } from "@/lib/auth/messages";
import { requestSignInCode, verifySignInCode, type SignInState } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";

/** Matches max_frequency in supabase/config.toml; the server enforces it anyway. */
const RESEND_COOLDOWN_S = 60;

/**
 * Sign-in by school e-mail: the address, then the 6-digit code it receives.
 * No password. The first sign-in creates the account, but only for school
 * addresses: the server refuses the others whatever this form checks.
 */
export function SignInFlow({ next, className }: { next: string | null; className?: string }) {
  const [sent, send, sending] = useActionState<SignInState, FormData>(requestSignInCode, { step: "email", email: "" });
  const [editing, setEditing] = useState(false);
  const onCodeStep = sent.step === "code" && !editing;

  return (
    <div className={cx("flex flex-col gap-5", className)}>
      {onCodeStep ? (
        <CodeStep sent={sent} next={next} send={send} sending={sending} onChangeEmail={() => setEditing(true)} />
      ) : (
        <form
          action={(form) => {
            setEditing(false);
            send(form);
          }}
          className="flex flex-col gap-5"
          noValidate
        >
          <Field
            label="Ton adresse e-mail de l'école"
            hint="Pas de mot de passe : on t'envoie un code à 6 chiffres. Pas encore de compte ? Il se crée à ta première connexion."
            error={sent.step === "email" && sent.problem ? AUTH_MESSAGES[sent.problem] : undefined}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                name="email"
                type="email"
                required
                defaultValue={sent.email}
                autoComplete="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                aria-describedby={describedBy}
                aria-invalid={invalid || undefined}
              />
            )}
          </Field>
          <Button type="submit" size="lg" block icon="arrow-right" disabled={sending} aria-disabled={sending}>
            {sending ? "Envoi du code…" : "Recevoir mon code"}
          </Button>
        </form>
      )}
    </div>
  );
}

function CodeStep({
  sent,
  next,
  send,
  sending,
  onChangeEmail,
}: {
  sent: SignInState;
  next: string | null;
  send: (form: FormData) => void;
  sending: boolean;
  onChangeEmail: () => void;
}) {
  const [checked, check, checking] = useActionState<SignInState, FormData>(verifySignInCode, sent);
  const problem: AuthProblem | undefined = checked.problem ?? sent.problem;
  const wait = useCooldown(sent.sentAt);

  return (
    <div className="flex flex-col gap-5">
      <p role="status" className="flex gap-3 rounded-sm border-2 border-ok/60 bg-ok/10 p-4 leading-snug">
        <Icon name="mail" size={20} className="mt-0.5 shrink-0 text-ok" />
        <span>
          <strong>Regarde ta boîte de l&apos;école.</strong> Si l&apos;adresse{" "}
          <span className="break-all font-bold">{sent.email}</span> est éligible, un code à 6 chiffres vient d&apos;y
          être envoyé. Il est valable 10 minutes.
        </span>
      </p>

      <form action={check} className="flex flex-col gap-5" noValidate>
        <input type="hidden" name="email" value={sent.email} />
        {next && <input type="hidden" name="next" value={next} />}
        <Field label="Code reçu par e-mail" error={problem ? AUTH_MESSAGES[problem] : undefined}>
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
        <Button type="submit" size="lg" block icon="arrow-right" disabled={checking} aria-disabled={checking}>
          {checking ? "Vérification…" : "Me connecter"}
        </Button>
      </form>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 type-small">
        <form action={send}>
          <input type="hidden" name="email" value={sent.email} />
          <input type="hidden" name="resend" value="1" />
          <button
            type="submit"
            disabled={wait > 0 || sending}
            className="font-bold underline underline-offset-4 disabled:cursor-not-allowed disabled:text-subtle disabled:no-underline"
          >
            {wait > 0 ? `Renvoyer le code (${wait} s)` : sending ? "Envoi…" : "Renvoyer le code"}
          </button>
        </form>
        <button type="button" onClick={onChangeEmail} className="font-bold text-muted underline underline-offset-4 hover:text-fg">
          Changer d&apos;adresse
        </button>
      </div>
    </div>
  );
}

/** Seconds left before another code may be requested. */
function useCooldown(sentAt: number | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!sentAt) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t - sentAt >= RESEND_COOLDOWN_S * 1000) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [sentAt]);
  if (!sentAt) return 0;
  const elapsed = Math.max(0, Math.floor((now - sentAt) / 1000));
  return Math.max(0, RESEND_COOLDOWN_S - elapsed);
}
