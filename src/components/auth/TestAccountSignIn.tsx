"use client";

import { useActionState } from "react";
import { signInWithTestAccount, type TestSignInState } from "@/app/actions/auth";
import { TEST_ACCOUNT_DOMAIN } from "@/lib/auth/test-accounts";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";

/**
 * Development only (AUTH_TEST_ACCOUNTS=on): the fictional test accounts sign
 * in with a password, since they cannot receive a code. Dashed and labelled
 * so nobody mistakes it for the real way in; absent in production.
 */
export function TestAccountSignIn({ next }: { next: string | null }) {
  const [state, action, pending] = useActionState<TestSignInState, FormData>(signInWithTestAccount, { email: "" });
  return (
    <section
      aria-labelledby="comptes-test-titre"
      className="rounded-md border-2 border-dashed border-line-strong p-5 sm:p-6"
    >
      <p className="type-label text-info">Développement uniquement</p>
      <h2 id="comptes-test-titre" className="mt-2 type-card">
        Comptes de test
      </h2>
      <p className="mt-2 type-small text-muted">
        Pour essayer le site avec un compte fictif en @{TEST_ACCOUNT_DOMAIN}. Cet encadré n&apos;existe pas sur le site
        public.
      </p>
      <form action={action} className="mt-5 flex flex-col gap-4">
        {next && <input type="hidden" name="next" value={next} />}
        <Field label="Adresse du compte test">
          {({ id, describedBy }) => (
            <Input
              id={id}
              name="email"
              type="email"
              required
              defaultValue={state.email}
              placeholder={`Ex : membre@${TEST_ACCOUNT_DOMAIN}`}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby={describedBy}
            />
          )}
        </Field>
        <Field label="Mot de passe du compte test">
          {({ id, describedBy }) => (
            <Input
              id={id}
              name="password"
              type="password"
              required
              autoComplete="current-password"
              aria-describedby={describedBy}
            />
          )}
        </Field>
        {state.failed && (
          <p role="alert" className="type-small font-semibold text-danger">
            Adresse ou mot de passe incorrect pour un compte test.
          </p>
        )}
        <Button type="submit" variant="secondary" block disabled={pending} aria-disabled={pending}>
          {pending ? "Connexion…" : "Entrer avec le compte test"}
        </Button>
      </form>
    </section>
  );
}
