import type { ReactNode } from "react";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ButtonLink } from "@/components/ui/Button";

/** A ruled callout above a section: read-only association, second factor needed… */
export function Notice({
  tone = "info",
  icon = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "warn" | "danger";
  icon?: IconName;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        // The action sits beside the text when the box is wide, below it when it is narrow (a
        // side panel, a phone): the text never gets squeezed to one word per line.
        "flex flex-wrap items-start gap-x-4 gap-y-3 rounded-md border bg-raised px-4 py-4 sm:px-5",
        tone === "info" && "border-info/40",
        tone === "warn" && "border-warn/50",
        tone === "danger" && "border-danger/50",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 basis-[18rem] items-start gap-3 sm:gap-4">
        <Icon
          name={icon}
          size={20}
          className={cx("shrink-0", tone === "info" && "text-info", tone === "warn" && "text-warn", tone === "danger" && "text-danger")}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="font-bold">{title}</p>
          {children && <div className="type-small text-muted">{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/**
 * Sensitive governance actions need a session verified with a second factor
 * (the database checks the session's aal2). Shown where such actions live,
 * to people whose session is not there yet.
 */
export function MfaNotice({ what }: { what: string }) {
  return (
    <Notice
      tone="warn"
      icon="lock"
      title="Double authentification requise pour certaines actions"
      action={
        <ButtonLink href={routes.accountSecurity} size="sm" variant="secondary" icon="arrow-right">
          Activer
        </ButtonLink>
      }
    >
      <p>
        {what} demande une application d&apos;authentification (code à 6 chiffres). Active-la une fois dans Sécurité&nbsp;:
        elle protège l&apos;asso si ton mot de passe ou ta boîte mail fuitent.
      </p>
    </Notice>
  );
}

/** Suspended or archived association, or suspended membership: everything reads, nothing changes. */
export function ReadOnlyNotice({ reason }: { reason: "organization_suspended" | "organization_archived" | "membership_suspended" }) {
  const text = {
    organization_suspended: {
      title: "Asso suspendue : lecture seule",
      body: "Le BDE a suspendu l'asso. L'équipe garde la lecture de son espace, mais plus rien ne peut y être modifié jusqu'à sa réactivation.",
    },
    organization_archived: {
      title: "Asso archivée : lecture seule",
      body: "L'asso a été archivée par le BDE. Son espace reste consultable par son équipe, sans modification possible.",
    },
    membership_suspended: {
      title: "Ton adhésion est suspendue",
      body: "Tant qu'elle est suspendue, tu n'as aucun droit dans l'asso. Rapproche-toi de sa présidence.",
    },
  }[reason];
  return (
    <Notice tone="warn" icon="lock" title={text.title}>
      <p>{text.body}</p>
    </Notice>
  );
}

/** The confirmation a page shows after an answer that removed its own card (?fait=…). */
export function DoneNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="status">
      <Notice tone="info" icon="check" title={message} />
    </div>
  );
}
