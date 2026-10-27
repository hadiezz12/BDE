import { formatDateLong, formatTime, plural } from "@/lib/format";
import type { Broadcast, BroadcastStatus } from "@/lib/notifications/data";
import { approveBroadcast, cancelBroadcast } from "@/app/actions/notifications";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { AUDIENCE_LABEL } from "./BroadcastComposer";

const STATUS: Record<BroadcastStatus, { label: string; tone: "neutral" | "warn" | "ok" | "danger" | "info" }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  pending_approval: { label: "À approuver", tone: "warn" },
  queued: { label: "En file", tone: "info" },
  dispatching: { label: "En cours d'envoi", tone: "info" },
  dispatched: { label: "Distribué", tone: "ok" },
  cancelled: { label: "Annulé", tone: "neutral" },
};

const when = (iso: string) => `${formatDateLong(iso)} à ${formatTime(iso)}`;

/**
 * The messages already prepared for an organization, newest first, with
 * how they went out: people notified, read on the site, e-mails accepted or
 * failed. Counts only: never who read, never an address. A message not out
 * yet can be cancelled (with a reason once submitted); a campus-wide e-mail
 * waiting for approval can be approved by another BDE officer.
 */
export function BroadcastHistory({ items }: { items: Broadcast[] }) {
  if (items.length === 0) {
    return <p className="type-small text-muted">Aucun message pour l&apos;instant. Ceux que tu prépares apparaîtront ici, avec leur avancement.</p>;
  }
  return (
    <ul className="flex flex-col border-b border-line">
      {items.map((b) => {
        const status = STATUS[b.status];
        const open = ["draft", "pending_approval", "queued", "dispatching"].includes(b.status);
        return (
          <li key={b.id} className="flex flex-col gap-2 border-t border-line py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              <span className="type-small text-muted">
                {AUDIENCE_LABEL[b.audience]}
                {b.email ? " · sur le site et par e-mail" : " · sur le site"}
                {b.importance === "important" ? " · important" : ""}
              </span>
            </div>
            <p className="font-bold leading-snug">{b.title}</p>
            <p className="line-clamp-3 whitespace-pre-line type-small text-muted">{b.body}</p>
            <p className="type-small text-muted">
              {b.created_by_name ? `Préparé par ${b.created_by_name}` : "Préparé"} le {when(b.created_at)}
              {b.approved_by_name && b.approved_at ? ` · approuvé par ${b.approved_by_name}` : ""}
              {b.dispatched_at ? ` · distribué le ${when(b.dispatched_at)}` : ""}
              {b.cancelled_at ? ` · annulé le ${when(b.cancelled_at)}${b.cancel_reason ? ` (${b.cancel_reason})` : ""}` : ""}
            </p>
            {b.recipients !== null && b.status !== "draft" && (
              <dl className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[0.8rem]">
                <div className="flex gap-1.5">
                  <dt className="text-muted">Destinataires</dt>
                  <dd>{b.recipients}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-muted">Notifiés</dt>
                  <dd>{b.stats.notified}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-muted">Lus sur le site</dt>
                  <dd>{b.stats.read}</dd>
                </div>
                {b.email && (
                  <>
                    <div className="flex gap-1.5">
                      <dt className="text-muted">E-mails partis</dt>
                      <dd>{b.stats.email_accepted}</dd>
                    </div>
                    {b.stats.email_queued > 0 && (
                      <div className="flex gap-1.5">
                        <dt className="text-muted">En attente</dt>
                        <dd>{b.stats.email_queued}</dd>
                      </div>
                    )}
                    {b.stats.email_failed > 0 && (
                      <div className="flex gap-1.5">
                        <dt className="text-muted">Non remis</dt>
                        <dd>{b.stats.email_failed}</dd>
                      </div>
                    )}
                  </>
                )}
              </dl>
            )}
            {(b.can_approve || open) && (
              <div className="flex flex-wrap items-start gap-3 pt-1">
                {b.can_approve && (
                  <ActionForm action={approveBroadcast} hidden={{ id: b.id }} submitLabel={`Approuver l'envoi à ${plural(b.recipients ?? 0, "personne")}`} size="sm" />
                )}
                {open && (
                  <Disclosure summary="Annuler ce message">
                    <ActionForm action={cancelBroadcast} hidden={{ id: b.id }} submitLabel="Annuler le message" variant="secondary" size="sm">
                      {b.status !== "draft" && (
                        <label className="flex flex-col gap-1.5">
                          <span className="type-small font-bold">Pourquoi (gardé dans l&apos;historique)</span>
                          <input name="reason" required minLength={3} maxLength={500} className="rounded-sm border-2 border-line-strong bg-bg px-3 py-2 focus:border-fg" />
                        </label>
                      )}
                    </ActionForm>
                  </Disclosure>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
