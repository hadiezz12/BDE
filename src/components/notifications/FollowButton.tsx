"use client";

import { useActionState } from "react";
import { cx } from "@/lib/cx";
import { followOrganization } from "@/app/actions/notifications";
import { Icon } from "@/components/ui/Icon";

/**
 * "Suivre" on an association's page: the person's own choice to hear about
 * its new articles, events and recruitments (follow_organization, recorded
 * with its source). A toggle button (aria-pressed); the page re-renders from
 * the database after each answer. E-mails for followed associations stay off
 * unless the person turns them on in their settings.
 */
export function FollowButton({ organizationId, following, name }: { organizationId: string; following: boolean; name: string }) {
  const [state, action, pending] = useActionState(followOrganization, { status: "idle" });
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="organization_id" value={organizationId} />
      <input type="hidden" name="follow" value={following ? "0" : "1"} />
      <button
        type="submit"
        aria-pressed={following}
        disabled={pending}
        className={cx(
          "inline-flex min-h-12 items-center gap-2 rounded-sm border-2 px-4 type-button",
          following ? "border-fg bg-fg text-bg hover:bg-fg/85" : "border-line-strong hover:border-fg",
        )}
      >
        <Icon name={following ? "check" : "bell"} size={18} />
        {pending ? "Un instant…" : following ? "Tu suis cette asso" : "Suivre"}
        <span className="sr-only"> {name}</span>
      </button>
      <p role="status" className={cx("max-w-xs text-[0.8rem]", state.status === "error" ? "text-danger" : "text-muted")}>
        {state.status === "idle" ? "" : state.message}
      </p>
    </form>
  );
}
