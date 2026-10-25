"use client";

import { useActionState } from "react";
import { refreshApplicationForm } from "@/app/actions/recruitment";
import type { GovernanceActionState } from "@/app/actions/governance";
import { Button } from "@/components/ui/Button";

/** Moves the student's draft to the form's live version (refresh_application_form). */
export function RefreshForm({ applicationId }: { applicationId: string }) {
  const [state, action, pending] = useActionState<GovernanceActionState, FormData>(refreshApplicationForm, { status: "idle" });
  return (
    <form action={action} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="application_id" value={applicationId} />
      <Button type="submit" variant="secondary" size="sm" icon="arrow-right" disabled={pending} className="self-start">
        {pending ? "Un instant…" : "Passer à la nouvelle version"}
      </Button>
      {state.status === "error" && state.message && (
        <p role="alert" className="type-small font-semibold text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}
