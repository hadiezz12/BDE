import type { ReactNode } from "react";
import { routes } from "@/lib/routes";
import { formatDateLong, formatDayShort } from "@/lib/format";
import {
  academicYearLabel,
  APPROVAL_CAPACITY_LABEL,
  AUDIT_ACTION_LABEL,
  OFFICE_LABEL,
  SOURCE_LABEL,
  TRANSITION_KIND_LABEL,
  TRANSITION_STATUS_LABEL,
} from "@/lib/governance/labels";
import type { GovernanceEvent, GuardianSummary, OfficeSummary, OpenTransition, PastTransition } from "@/lib/governance/types";
import { approveBdeSuccession, cancelTransition, withdrawBdeApproval } from "@/app/actions/governance";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ButtonLink } from "@/components/ui/Button";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ActionForm } from "./ActionForm";
import { Disclosure } from "./Disclosure";

/** Who holds an office now, until when, and who is planned next. */
export function OfficeCard({ office, children }: { office: OfficeSummary; children?: ReactNode }) {
  const { holder, next } = office;
  return (
    <div className="flex flex-col gap-3 rounded-md border border-line bg-raised px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-label text-subtle">{OFFICE_LABEL[office.office]}</p>
        {holder ? <StatusBadge tone="ok">Active</StatusBadge> : <StatusBadge tone="danger">Vacante</StatusBadge>}
      </div>
      {holder ? (
        <div className="flex flex-col gap-0.5">
          <p className="type-card">
            {holder.name}
            {holder.is_you && <span className="font-normal text-muted"> (toi)</span>}
          </p>
          <p className="type-small text-muted">
            Mandat {academicYearLabel(new Date(holder.ends_at))} · jusqu&apos;au {formatDateLong(holder.ends_at)}
          </p>
          <p className="type-meta text-subtle">{SOURCE_LABEL[holder.source] ?? holder.source}</p>
        </div>
      ) : (
        <p className="type-small text-muted">Personne n&apos;occupe ce poste en ce moment.</p>
      )}
      {next && (
        <p className="border-t border-line pt-3 type-small">
          <span className="font-semibold">À partir du {formatDateLong(next.starts_at)}&nbsp;:</span> {next.name}
          {next.is_you && " (toi)"}, jusqu&apos;au {formatDateLong(next.ends_at)}
        </p>
      )}
      {children}
    </div>
  );
}

export function GuardianLine({ guardian }: { guardian: GuardianSummary | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-dashed border-line-strong bg-raised px-4 py-3 sm:px-5">
      <p className="type-label text-subtle">Garant·e de continuité</p>
      {guardian ? (
        <p className="type-small">
          <span className="font-bold">{guardian.name}</span>
          {guardian.is_you && " (toi)"} · jusqu&apos;au {formatDateLong(guardian.ends_at)}
          <span className="block text-muted">
            Ne gère rien au quotidien&nbsp;: peut seulement rétablir une présidence ou une vice-présidence du BDE vacante.
          </span>
        </p>
      ) : (
        <p className="type-small text-danger">
          Aucun·e garant·e en poste. Sa nomination se fait hors du site (docs/backend/governance.md).
        </p>
      )}
    </div>
  );
}

const STEP: Record<"done" | "waiting" | "refused", { tone: StatusTone; label: string }> = {
  done: { tone: "ok", label: "Fait" },
  waiting: { tone: "warn", label: "En attente" },
  refused: { tone: "danger", label: "Refusé" },
};

/**
 * The transition in progress, as a checklist anyone can read: who proposed
 * it, each approval needed and given, each person's acceptance, the dates.
 * Buttons appear only for the steps that belong to the viewer (the database
 * says which: can_approve, can_withdraw, can_cancel, can_respond).
 */
export function TransitionPanel({
  transition,
  readOnly = false,
  back,
}: {
  transition: OpenTransition;
  readOnly?: boolean;
  /** The page to come back to after an approval (its confirmation is shown there). */
  back?: string;
}) {
  const t = transition;
  const required = t.required_approvals ?? [];
  const steps: { key: string; label: string; state: keyof typeof STEP; detail?: string }[] = [
    ...required.map((capacity) => {
      const given = t.approvals.find((a) => a.capacity === capacity);
      return {
        key: `approval-${capacity}`,
        label: `Approbation · ${APPROVAL_CAPACITY_LABEL[capacity]}`,
        state: given ? ("done" as const) : ("waiting" as const),
        detail: given ? `${given.name}${given.is_you ? " (toi)" : ""}, le ${formatDayShort(given.approved_at)}` : undefined,
      };
    }),
    ...t.candidates.map((c) => ({
      key: `candidate-${c.office}`,
      label: `Accord · ${c.name}${c.is_you ? " (toi)" : ""} pour ${OFFICE_LABEL[c.office].toLowerCase()}`,
      state: c.accepted === true ? ("done" as const) : c.accepted === false ? ("refused" as const) : ("waiting" as const),
    })),
  ];

  return (
    <div className="flex flex-col gap-4 rounded-md border border-line-strong bg-raised px-4 py-5 sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <p className="type-label text-assoc-text">{TRANSITION_KIND_LABEL[t.kind]}</p>
          <p className="type-small text-muted">
            Proposée par {t.proposed_by_name}
            {t.proposed_by_is_you && " (toi)"} le {formatDayShort(t.created_at)}. Nouveau mandat du{" "}
            {formatDateLong(t.effective_at)} au {formatDateLong(t.mandate_ends_at)}.
          </p>
          {t.reason && <p className="type-small text-muted">Raison&nbsp;: {t.reason}</p>}
        </div>
        <StatusBadge tone="info">Expire le {formatDayShort(t.expires_at)}</StatusBadge>
      </div>

      <ol className="flex flex-col divide-y divide-line rounded-sm border border-line">
        {steps.map((s) => (
          <li key={s.key} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <span className="type-small font-semibold">{s.label}</span>
            <span className="flex items-center gap-2">
              {s.detail && <span className="type-meta text-subtle">{s.detail}</span>}
              <StatusBadge tone={STEP[s.state].tone}>{STEP[s.state].label}</StatusBadge>
            </span>
          </li>
        ))}
      </ol>
      <p className="type-small text-subtle">
        La passation se valide d&apos;elle-même à la dernière étape, en une seule fois&nbsp;: les anciens mandats
        s&apos;arrêtent à la date prévue et les nouveaux commencent au même instant.
      </p>

      {!readOnly && (t.can_respond || t.can_approve || t.can_withdraw || t.can_cancel) && (
        <div className="flex flex-col gap-3 border-t border-line pt-4">
          {t.can_respond && (
            <ButtonLink href={routes.accountInvitations} icon="arrow-right">
              Répondre à la proposition
            </ButtonLink>
          )}
          {t.can_approve && (
            <ActionForm action={approveBdeSuccession} hidden={{ transition_id: t.id, back }} submitLabel="Approuver la passation" submitIcon="check" />
          )}
          {t.can_withdraw && (
            <ActionForm action={withdrawBdeApproval} hidden={{ transition_id: t.id }} submitLabel="Retirer mon approbation" variant="secondary" size="sm" />
          )}
          {t.can_cancel && (
            <Disclosure summary="Annuler la passation" icon="close" tone="danger">
              <ActionForm action={cancelTransition} hidden={{ transition_id: t.id }} submitLabel="Annuler la passation" variant="danger">
                <p className="type-small text-muted">Rien ne change dans les mandats en cours.</p>
                <Field label="Raison" optional>
                  {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="reason" maxLength={500} />}
                </Field>
              </ActionForm>
            </Disclosure>
          )}
        </div>
      )}
    </div>
  );
}

export function TransitionHistory({ history }: { history: PastTransition[] }) {
  if (history.length === 0) {
    return (
      <ManageEmpty icon="clock" title="Aucune passation passée">
        <p>Chaque passation, validée, annulée ou expirée, restera listée ici.</p>
      </ManageEmpty>
    );
  }
  const tone: Record<PastTransition["status"], StatusTone> = { completed: "ok", cancelled: "neutral", expired: "neutral", open: "info" };
  return (
    <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
      {history.map((h) => (
        <li key={h.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold">{TRANSITION_KIND_LABEL[h.kind]}</span>
            <span className="type-small text-muted">
              {(h.candidates ?? []).map((c) => `${c.name} (${OFFICE_LABEL[c.office].toLowerCase()})`).join(", ")} · proposée par{" "}
              {h.proposed_by_name} le {formatDayShort(h.created_at)}
            </span>
            {h.cancel_reason && <span className="type-meta text-subtle">{h.cancel_reason}</span>}
          </div>
          <StatusBadge tone={tone[h.status]}>{TRANSITION_STATUS_LABEL[h.status]}</StatusBadge>
        </li>
      ))}
    </ul>
  );
}

/** Who did it: a person, or, with no person, the scheduled publisher, a report (never its author), or the set-up. */
function actorOf(e: GovernanceEvent): string {
  if (e.actor_name) return e.actor_name;
  if (e.authority === "scheduler") return "La programmation";
  if (e.action === "content_reported") return "Un article";
  return "La mise en place";
}

/** The append-only governance history, one sentence per event. */
export function AuditList({ events, showOrganization = false }: { events: GovernanceEvent[]; showOrganization?: boolean }) {
  if (events.length === 0) {
    return (
      <ManageEmpty icon="list" title="Rien dans l'historique pour l'instant">
        <p>Chaque invitation, poste, délégation et passation y laissera une ligne, qui ne pourra être ni modifiée ni effacée depuis le site.</p>
      </ManageEmpty>
    );
  }
  return (
    <ol className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
      {events.map((e) => (
        <li key={e.id} className="flex flex-col gap-0.5 px-4 py-2.5">
          <span className="type-small">
            <span className="font-semibold">{actorOf(e)}</span>{" "}
            {AUDIT_ACTION_LABEL[e.action] ?? e.action}
            {e.subject_name && e.subject_name !== e.actor_name && <> · {e.subject_name}</>}
            {showOrganization && e.organization && <> · {e.organization.name}</>}
          </span>
          <span className="flex flex-wrap gap-x-3 type-meta text-subtle">
            <time dateTime={e.occurred_at}>
              {formatDayShort(e.occurred_at)} {new Date(e.occurred_at).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" })}
            </time>
            {e.reason && (
              <span className="inline-flex items-center gap-1">
                <Icon name="info" size={12} />
                {e.reason}
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}
