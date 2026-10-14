import type { TeamInvite } from "@/lib/types";
import { formatDayShort, formatTime } from "@/lib/format";
import { dayDiff } from "@/lib/time";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DemoForm } from "@/components/manage/DemoActions";

/**
 * PHASE 1 — invite someone onto the bureau. The form keeps what was typed
 * and says plainly that nothing is sent (DemoForm); no fake "Invitation
 * envoyée". Server component: the fields render here, DemoForm is the only
 * client leaf.
 */
export function InviteForm({ associationName }: { associationName: string }) {
  return (
    <DemoForm
      aria-label={`Inviter quelqu'un au bureau de ${associationName}`}
      notice="aucune invitation n'est envoyée pour l'instant. Ce que tu as tapé reste dans le formulaire."
      className="rounded-md border border-line bg-raised px-4 py-5 sm:px-5"
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto] md:items-end">
        <Field label="Mail GEM">
          {({ id, describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              type="email"
              name="email"
              autoComplete="off"
              spellCheck={false}
              placeholder="prenom.nom@gem.exemple.fr"
              required
            />
          )}
        </Field>
        <Field label="Rôle au bureau">
          {({ id, describedBy }) => (
            <Input id={id} aria-describedby={describedBy} name="role" placeholder="Respo partenariats" required />
          )}
        </Field>
        <Button type="submit" icon="mail" iconPosition="start" className="md:min-h-12">
          Envoyer l&apos;invitation
        </Button>
      </div>
      <p className="mt-3 type-small text-subtle">
        Une fois l&apos;invitation acceptée, la personne apparaît dans le bureau avec son rôle et a accès à tout cet
        espace.
      </p>
    </DemoForm>
  );
}

/** "il y a 2 jours" · "hier" · "aujourd'hui à 19h10". */
function sentWords(iso: string, now: Date): string {
  const days = dayDiff(iso, now);
  if (days <= 0) return `aujourd'hui à ${formatTime(iso)}`;
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} jours`;
  return `le ${formatDayShort(iso)}`;
}

/** Invitations still waiting for an answer, as ruled lines. */
export function PendingInvites({ invites, now = new Date() }: { invites: TeamInvite[]; now?: Date }) {
  return (
    <ul className="border-b border-line">
      {invites.map((inv) => (
        <li
          key={inv.id}
          className="flex flex-col gap-1.5 border-t border-line py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <span className="break-all font-mono text-[0.9rem] font-bold">{inv.email}</span>
            <span className="type-small text-muted">
              {inv.role} · invitation de {inv.sentBy}, <time dateTime={inv.sentAt}>{sentWords(inv.sentAt, now)}</time>
            </span>
          </div>
          <StatusBadge tone="info">En attente</StatusBadge>
        </li>
      ))}
    </ul>
  );
}
