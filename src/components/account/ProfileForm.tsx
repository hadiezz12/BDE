"use client";

import { useActionState } from "react";
import type { ProfileInput } from "@/lib/auth/profile-input";
import { updateProfile, type ProfileFormState } from "@/app/actions/account";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ProfileFields } from "./ProfileFields";

/**
 * "Tes infos": the editable profile, plus the school email read-only (it is
 * the sign-in identity; changing it is not offered).
 */
export function ProfileForm({
  initial,
  email,
  className,
}: {
  initial: Partial<ProfileInput>;
  email: string;
  className?: string;
}) {
  const [state, submit, pending] = useActionState<ProfileFormState, FormData>(updateProfile, { status: "idle" });
  return (
    <form action={submit} aria-label="Tes infos" className={className} noValidate>
      <div className="flex flex-col gap-8">
        <ProfileFields values={state.values ?? initial} errors={state.errors} />
        <Field label="Adresse e-mail de l'école" hint="C'est ton identifiant de connexion : elle ne se modifie pas ici.">
          {({ id, describedBy }) => (
            <Input id={id} value={email} readOnly aria-describedby={describedBy} className="bg-sunken text-muted" />
          )}
        </Field>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={pending} aria-disabled={pending} icon="check">
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
          <p role="status" className="type-small">
            {state.status === "saved" && !pending && (
              <span className="inline-flex items-center gap-1.5 font-bold text-ok">
                <Icon name="check" size={16} /> Enregistré.
              </span>
            )}
          </p>
        </div>
        {state.message && (
          <p role="alert" className="flex gap-3 rounded-sm border-2 border-danger/60 bg-danger/10 p-4 leading-snug">
            <Icon name="alert" size={20} className="mt-0.5 shrink-0 text-danger" />
            <span>{state.message}</span>
          </p>
        )}
      </div>
    </form>
  );
}
