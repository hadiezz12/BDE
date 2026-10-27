"use client";

import Link from "next/link";
import { useActionState } from "react";
import { routes } from "@/lib/routes";
import { unsubscribeWithToken, type UnsubscribeState } from "@/app/actions/notifications";
import { Button } from "@/components/ui/Button";

/**
 * The one button of the unsubscribe page: it turns off the e-mails of one
 * topic for the person the link was made for (the token is the proof; no
 * sign-in). Asking first means a link scanner opening the page changes
 * nothing; only this POST does.
 */
export function UnsubscribeForm({ token, label }: { token: string; label: string }) {
  const [state, action, pending] = useActionState<UnsubscribeState, FormData>(unsubscribeWithToken, { status: "idle" });
  if (state.status === "done" || state.status === "already") {
    return (
      <div role="status" className="flex flex-col gap-3">
        <p className="type-lead font-bold">C&apos;est fait : tu ne recevras plus « {state.label ?? label} » par e-mail.</p>
        <p className="text-muted">
          Ces nouvelles restent visibles dans ton espace, rubrique Notifications. Tu peux revenir sur ce choix à tout moment dans{" "}
          <Link href={routes.accountNotificationSettings} className="link font-bold">
            tes réglages
          </Link>
          .
        </p>
      </div>
    );
  }
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="t" value={token} />
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Un instant…" : `Ne plus recevoir « ${label} » par e-mail`}
        </Button>
      </div>
      <p role="status" className="text-[0.9rem] text-danger">
        {state.status === "expired"
          ? "Ce lien a expiré. Change ce réglage depuis ton espace."
          : state.status === "invalid"
            ? "Ce lien n'est pas valable. Change ce réglage depuis ton espace."
            : state.status === "error"
              ? "Le service est momentanément indisponible. Réessaie dans un instant."
              : ""}
      </p>
    </form>
  );
}
