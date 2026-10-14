"use client";

import { useState, type FormEvent } from "react";
import { cx } from "@/lib/cx";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";

/**
 * The intended sign-in: school e-mail, then a sign-in link by mail.
 * PHASE 1 DEMO — nothing is sent; on submit an inline notice says sign-in
 * comes in a later version and points to the demo profiles. The address the
 * student typed stays in the field.
 */
export function SignInForm({ className }: { className?: string }) {
  const [attempted, setAttempted] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAttempted(true);
  }

  return (
    <form onSubmit={onSubmit} className={cx("flex flex-col gap-5", className)}>
      <Field label="Adresse e-mail de l'école" hint="Pas de mot de passe : on t'envoie un lien de connexion par e-mail.">
        {({ id, describedBy }) => (
          <Input
            id={id}
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="prenom.nom@gem.exemple.fr"
            aria-describedby={describedBy}
          />
        )}
      </Field>
      <Button type="submit" size="lg" block icon="arrow-right">
        Recevoir mon lien
      </Button>
      <div role="status" aria-live="polite">
        {attempted && (
          <p className="flex gap-3 rounded-sm border-2 border-info/60 bg-info/10 p-4 leading-snug">
            <Icon name="info" size={20} className="mt-0.5 shrink-0 text-info" />
            <span>
              <strong>Version de démonstration : la connexion arrive dans une prochaine version.</strong> Rien n&apos;a
              été envoyé. En attendant, choisis un profil dans le mode démo juste en dessous.
            </span>
          </p>
        )}
      </div>
    </form>
  );
}
