"use client";

import { useActionState, useRef, useState } from "react";
import { cx } from "@/lib/cx";
import { clearEmailSuppression, followOrganization, setNotificationPreference, setNotificationSettings } from "@/app/actions/notifications";
import type { NotificationTopicChoice } from "@/lib/notifications/data";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

function Status({ state }: { state: { status: string; message?: string } }) {
  return (
    <p role="status" className={cx("text-[0.82rem]", state.status === "error" ? "text-danger" : "text-muted")}>
      {state.status === "idle" ? "" : state.message}
    </p>
  );
}

/**
 * One topic: where it arrives. Essential topics are fixed (a registration,
 * an application, the account's security, something waiting for an answer);
 * operational ones always stay in the notification centre and only their
 * e-mail can be turned off; optional ones can be turned off entirely. Each
 * change is saved at once (and recorded by the database).
 */
export function TopicPreference({ topic }: { topic: NotificationTopicChoice }) {
  const [state, action, pending] = useActionState(setNotificationPreference, { status: "idle" });
  const form = useRef<HTMLFormElement>(null);
  const fixed = topic.class === "essential";
  const inAppFixed = topic.class !== "optional";
  const submit = () => form.current?.requestSubmit();

  return (
    <form ref={form} action={action} className="grid gap-x-6 gap-y-3 border-t border-line py-5 sm:grid-cols-[minmax(0,1fr)_auto]">
      <input type="hidden" name="topic" value={topic.key} />
      <div className="flex min-w-0 flex-col gap-1">
        <h3 id={`topic-${topic.key}`} className="font-bold leading-snug">
          {topic.label}
          {fixed && <span className="ml-2 align-middle text-[0.72rem] font-bold uppercase tracking-[0.06em] text-muted">Toujours actif</span>}
        </h3>
        <p className="type-small text-muted">{topic.description}</p>
        <Status state={pending ? { status: "pending", message: "Enregistrement…" } : state} />
      </div>
      <fieldset aria-labelledby={`topic-${topic.key}`} className="flex flex-wrap items-start gap-x-5 gap-y-2" disabled={pending}>
        <legend className="sr-only">Où recevoir « {topic.label} »</legend>
        <label className={cx("inline-flex min-h-11 items-center gap-2.5", inAppFixed ? "text-muted" : "cursor-pointer")}>
          <input
            type="checkbox"
            name="in_app"
            defaultChecked={topic.in_app}
            disabled={inAppFixed}
            onChange={submit}
            className="size-5 accent-[var(--accent)]"
          />
          Sur le site
          {inAppFixed && <input type="hidden" name="in_app" value="on" />}
        </label>
        <label className={cx("inline-flex min-h-11 items-center gap-2.5", fixed ? "text-muted" : "cursor-pointer")}>
          <input
            type="checkbox"
            name="email"
            defaultChecked={topic.email}
            disabled={fixed}
            onChange={submit}
            className="size-5 accent-[var(--accent)]"
          />
          Par e-mail
        </label>
      </fieldset>
    </form>
  );
}

export function QuietHoursForm({ initial }: { initial: { quiet_hours: boolean; quiet_start: string; quiet_end: string } }) {
  const [state, action, pending] = useActionState(setNotificationSettings, { status: "idle" });
  const [on, setOn] = useState(initial.quiet_hours);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="inline-flex min-h-11 cursor-pointer items-center gap-2.5 font-bold">
        <input type="checkbox" name="quiet_hours" defaultChecked={initial.quiet_hours} onChange={(e) => setOn(e.target.checked)} className="size-5 accent-[var(--accent)]" />
        Pas d&apos;e-mail qui peut attendre pendant mes heures calmes
      </label>
      <div className={cx("flex flex-wrap items-end gap-4", !on && "opacity-60")}>
        <label className="flex flex-col gap-1.5">
          <span className="type-label text-muted">De</span>
          <input
            type="time"
            name="quiet_start"
            defaultValue={initial.quiet_start}
            required
            className="min-h-11 rounded-sm border-2 border-line-strong bg-bg px-3 font-mono focus:border-fg"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="type-label text-muted">À</span>
          <input
            type="time"
            name="quiet_end"
            defaultValue={initial.quiet_end}
            required
            className="min-h-11 rounded-sm border-2 border-line-strong bg-bg px-3 font-mono focus:border-fg"
          />
        </label>
        <span className="pb-3 type-small text-muted">heure de Paris</span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {pending ? "Un instant…" : "Enregistrer"}
        </Button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function UnfollowButton({ organizationId, name }: { organizationId: string; name: string }) {
  const [state, action, pending] = useActionState(followOrganization, { status: "idle" });
  if (state.status === "done") {
    return (
      <p role="status" className="type-small text-muted">
        Tu ne suis plus {name}.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="organization_id" value={organizationId} />
      <input type="hidden" name="follow" value="0" />
      <input type="hidden" name="source" value="settings" />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Ne plus suivre ${name}`}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-sm px-2 text-[0.85rem] font-bold text-muted hover:bg-fg/8 hover:text-fg"
      >
        <Icon name="close" size={15} />
        {pending ? "…" : "Ne plus suivre"}
      </button>
      {state.status === "error" && <span className="text-[0.8rem] text-danger">{state.message}</span>}
    </form>
  );
}

export function ClearSuppressionButton() {
  const [state, action, pending] = useActionState(clearEmailSuppression, { status: "idle" });
  return (
    <form action={action} className="flex flex-col gap-2">
      <div>
        <Button type="submit" variant="secondary" size="sm" disabled={pending || state.status === "done"}>
          {pending ? "Un instant…" : "Reprendre les e-mails"}
        </Button>
      </div>
      <Status state={state} />
    </form>
  );
}
