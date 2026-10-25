"use client";

import Link from "next/link";
import { useActionState } from "react";
import { startApplication } from "@/app/actions/recruitment";
import type { GovernanceActionState } from "@/app/actions/governance";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * "Candidater" for one position: opens the student's draft (a new one, or
 * the one they already have). The database decides whether the position
 * takes applications now and whether this student may apply (profile, study
 * year, the campaign's limit); a refusal shows right under the button.
 * Visitors are sent to sign in, then come back to this page.
 */
export function ApplyButton({
  positionId,
  back,
  variant = "assoc",
  size = "md",
  block,
  className,
  children,
}: {
  positionId: string;
  /** This page's path, to come back to after signing in. */
  back: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [state, action, pending] = useActionState<GovernanceActionState, FormData>(startApplication, { status: "idle" });
  return (
    <form action={action} className={cx("flex flex-col gap-2", block && "w-full", className)}>
      <input type="hidden" name="position_id" value={positionId} />
      <input type="hidden" name="back" value={back} />
      <Button type="submit" variant={variant} size={size} block={block} icon="arrow-right" disabled={pending} aria-disabled={pending}>
        {pending ? "Un instant…" : children}
      </Button>
      {state.status === "error" && state.message && (
        <p key={state.at} role="alert" className="flex items-start gap-1.5 type-small font-semibold text-danger">
          <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
          <span>
            {state.message}
            {state.code === "application_limit" && (
              <>
                {" "}
                <Link href={routes.accountApplications} className="underline underline-offset-2">
                  Mes candidatures
                </Link>
              </>
            )}
            {state.code === "not_eligible" && (
              <>
                {" "}
                <Link href={routes.accountProfile} className="underline underline-offset-2">
                  Mon profil
                </Link>
              </>
            )}
          </span>
        </p>
      )}
    </form>
  );
}
