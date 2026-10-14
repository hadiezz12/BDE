"use client";

import { useId } from "react";
import type { NotificationKind, NotificationPreferences } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { DemoForm } from "@/components/manage/DemoActions";
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_KIND_DETAIL,
  NOTIFICATION_KIND_ICON,
  NOTIFICATION_KIND_TITLE,
} from "./account-facts";

/**
 * Per kind of notification: show it in the space, send it by mail, or both.
 * Each kind is a labelled group of two real checkboxes. PHASE 1: saving keeps
 * the ticks and says that nothing is stored.
 */
export function NotificationPreferencesForm({
  preferences,
  email,
  className,
}: {
  preferences: NotificationPreferences;
  /** Where the mails go. */
  email: string;
  className?: string;
}) {
  return (
    <DemoForm
      aria-label="Préférences de notification"
      className={className}
      notice="rien n'est enregistré pour l'instant. Tes cases restent cochées tant que tu ne recharges pas la page."
    >
      <p className="type-small text-muted">
        « Dans mon espace » : la page Notifications. « Par mail » : un message sur{" "}
        <span className="font-mono text-[0.8125rem] text-fg">{email}</span>.
      </p>
      <div className="mt-4 border-b border-line">
        {NOTIFICATION_KINDS.map((kind) => (
          <KindRow key={kind} kind={kind} value={preferences[kind]} />
        ))}
      </div>
      <div className="mt-6">
        <Button type="submit" icon="check" iconPosition="start">
          Enregistrer mes préférences
        </Button>
      </div>
    </DemoForm>
  );
}

function KindRow({ kind, value }: { kind: NotificationKind; value: NotificationPreferences[NotificationKind] }) {
  const labelId = useId();
  const detailId = useId();
  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={detailId}
      className="grid gap-3 border-t border-line py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start sm:gap-8"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p id={labelId} className="flex items-center gap-2 font-bold">
          <Icon name={NOTIFICATION_KIND_ICON[kind]} size={16} className="text-accent-text" />
          {NOTIFICATION_KIND_TITLE[kind]}
        </p>
        <p id={detailId} className="max-w-xl type-small text-muted">
          {NOTIFICATION_KIND_DETAIL[kind]}
        </p>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 sm:flex-col sm:gap-y-0.5">
        <Checkbox name={`${kind}-espace`} label="Dans mon espace" defaultChecked={value.espace} />
        <Checkbox name={`${kind}-mail`} label="Par mail" defaultChecked={value.mail} />
      </div>
    </div>
  );
}
