import Link from "next/link";
import { notificationPath, notificationText, type Payload } from "@notify/catalog.ts";
import { cx } from "@/lib/cx";
import { formatDateLong, formatTime } from "@/lib/format";
import type { BackupStatus, Issue, JobRow } from "@/lib/continuity/data";
import { BACKUP_KIND, BACKUP_STATUS, ENVIRONMENT, ISSUE_KIND, JOB_HEALTH, JOB_INFO, JOB_WORDS, SEVERITY } from "@/lib/continuity/labels";
import { retryJob } from "@/app/actions/continuity";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ActionForm } from "@/components/manage/governance/ActionForm";

export const when = (iso: string | null | undefined) => (iso ? `${formatDateLong(iso)} à ${formatTime(iso)}` : "—");

/**
 * Continuity problems, in the same words as their alerts (the shared
 * notification words), with what to do and where. `target` says who reads
 * them, so the link opens the page that reader can act on.
 */
export function IssueList({
  issues,
  target,
  empty,
}: {
  issues: Issue[];
  target: "platform" | "association" | "guardian" | "operations";
  empty: string;
}) {
  if (issues.length === 0) {
    return (
      <ManageEmpty icon="check" title="Rien à signaler">
        <p>{empty}</p>
      </ManageEmpty>
    );
  }
  return (
    <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
      {issues.map((issue) => {
        const payload = { ...issue.details, issue: issue.kind, target, organization_slug: issue.details.slug } as Payload;
        const text = notificationText("governance_issue_alert", payload);
        const href = notificationPath({ kind: "governance_issue_alert", payload });
        const severity = SEVERITY[issue.severity] ?? SEVERITY.info;
        return (
          <li key={issue.id} className="flex flex-col gap-1.5 px-4 py-3.5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusBadge tone={severity.tone}>{severity.label}</StatusBadge>
              <span className="type-label text-muted">{ISSUE_KIND[issue.kind as keyof typeof ISSUE_KIND] ?? issue.kind}</span>
            </div>
            <p className="font-semibold leading-snug">{text.title}</p>
            <p className="type-small text-muted">{text.body}</p>
            <p className="flex flex-wrap gap-x-4 gap-y-1 type-small text-muted">
              <span>Relevé le {when(issue.first_detected_at)}</span>
              {issue.notified_at && <span>· personnes prévenues</span>}
              {issue.escalated_at && <span>· transmis au niveau supérieur</span>}
              {href !== "/account/notifications" && (
                <Link href={href} className="font-semibold text-fg underline underline-offset-2">
                  Ouvrir
                </Link>
              )}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

/** The recurring jobs: health measured from the last success, never from their mere existence. */
export function JobsTable({ jobs, canRetry, schedulerAvailable }: { jobs: JobRow[]; canRetry: boolean; schedulerAvailable: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {!schedulerAvailable && (
        <p className="type-small text-muted">
          Cette base n&apos;a pas de planificateur (base locale) : la santé des tâches ne peut pas être vérifiée ici.
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[46rem] text-left type-small">
          <thead>
            <tr className="border-b-2 border-fg">
              <th scope="col" className="py-2 pr-4 type-label">Tâche</th>
              <th scope="col" className="py-2 pr-4 type-label">État</th>
              <th scope="col" className="py-2 pr-4 type-label">Dernière réussite</th>
              <th scope="col" className="py-2 pr-4 type-label">24 h</th>
              <th scope="col" className="py-2 type-label"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const health = JOB_HEALTH[job.health] ?? JOB_HEALTH.unverifiable;
              return (
                <tr key={job.key} className="border-b border-line align-top">
                  <td className="py-2.5 pr-4">
                    <p className="font-semibold">
                      {JOB_WORDS[job.key] ?? job.key}
                      {job.critical && <span className="ml-1.5 font-normal text-muted">· essentielle</span>}
                    </p>
                    <p className="text-muted">{JOB_INFO[job.key]?.every}. {JOB_INFO[job.key]?.help}</p>
                  </td>
                  <td className="py-2.5 pr-4">
                    <StatusBadge tone={health.tone}>{health.label}</StatusBadge>
                    {job.last_error && job.last_status === "failed" && (
                      <p className="mt-1 font-mono text-[0.78rem] text-muted">{job.last_error}</p>
                    )}
                    {job.consecutive_failures > 1 && <p className="mt-1 text-muted">{job.consecutive_failures} échecs de suite</p>}
                  </td>
                  <td className="py-2.5 pr-4">{job.last_succeeded_at ? when(job.last_succeeded_at) : "Jamais"}</td>
                  <td className="py-2.5 pr-4 font-mono">
                    {job.runs_24h.succeeded}✓ {job.runs_24h.failed > 0 && <span className="text-danger">{job.runs_24h.failed}✗ </span>}
                    {job.runs_24h.skipped > 0 && <span className="text-muted">{job.runs_24h.skipped}↷</span>}
                  </td>
                  <td className="py-2.5">
                    {canRetry && job.retryable && (
                      <ActionForm action={retryJob} hidden={{ job: job.key }} submitLabel="Relancer" variant="secondary" size="sm" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="type-small text-muted">✓ réussies · ✗ en échec · ↷ ignorées parce qu&apos;une exécution était déjà en cours.</p>
    </div>
  );
}

/** The declared backup and restore checks: a person's statement, dated and signed, never a guess. */
export function BackupList({ backups }: { backups: BackupStatus[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {backups.map((b) => {
        const status = BACKUP_STATUS[b.status] ?? BACKUP_STATUS.never;
        return (
          <li key={b.kind} className={cx("flex flex-col gap-1.5 rounded-md border bg-raised px-4 py-3", b.status === "verified" ? "border-line" : "border-warn/50")}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold">{BACKUP_KIND[b.kind]?.label ?? b.kind}</span>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </div>
            <p className="type-small text-muted">
              {b.checked_on
                ? `Déclaré le ${formatDateLong(b.checked_on)}${b.recorded_by_name ? ` par ${b.recorded_by_name}` : ""} · ${ENVIRONMENT[b.environment ?? ""] ?? b.environment}`
                : BACKUP_KIND[b.kind]?.help}
            </p>
            {b.method && <p className="type-small">{b.method}</p>}
          </li>
        );
      })}
    </ul>
  );
}
