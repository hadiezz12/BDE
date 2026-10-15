"use client";

import { useActionState } from "react";
import type { ProfileInput } from "@/lib/auth/profile-input";
import { completeOnboarding, type ProfileFormState } from "@/app/actions/account";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ProfileFields } from "./ProfileFields";

/** First visit: the short profile form, then the page the student was heading to. */
export function OnboardingForm({ initial, next }: { initial: Partial<ProfileInput>; next: string | null }) {
  const [state, submit, pending] = useActionState<ProfileFormState, FormData>(completeOnboarding, { status: "idle" });
  return (
    <form action={submit} className="flex flex-col gap-8" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <ProfileFields values={state.values ?? initial} errors={state.errors} />
      {state.message && (
        <p role="alert" className="flex gap-3 rounded-sm border-2 border-danger/60 bg-danger/10 p-4 leading-snug">
          <Icon name="alert" size={20} className="mt-0.5 shrink-0 text-danger" />
          <span>{state.message}</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg" icon="arrow-right" disabled={pending} aria-disabled={pending}>
          {pending ? "Enregistrement…" : "C'est parti"}
        </Button>
        <p className="type-small text-muted">Tu pourras tout modifier plus tard, et ajouter une photo, dans ton profil.</p>
      </div>
    </form>
  );
}
