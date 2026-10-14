import type { ApplicationStatus, PublicationStatus } from "@/lib/types";
import { APPLICATION_STATUS_LABEL, formatDayShort, formatTime } from "@/lib/format";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";

/**
 * Status markers for workspace tables, built on the quiet StatusBadge (dot +
 * words, never colour alone). Green = live, cyan = scheduled/in progress,
 * pink = needs the bureau's attention. Amber stays reserved for safety.
 */

export const PUBLICATION_STATUS_LABEL: Record<PublicationStatus, string> = {
  brouillon: "Brouillon",
  programme: "Programmé",
  publie: "Publié",
};

const PUBLICATION_TONE: Record<PublicationStatus, StatusTone> = {
  brouillon: "neutral",
  programme: "info",
  publie: "ok",
};

/** "Publié" · "Brouillon" · "Programmé · 16 oct. 18h" (pass `scheduledFor` for the date). */
export function PublicationStatusBadge({
  status,
  scheduledFor,
  className,
}: {
  status: PublicationStatus;
  scheduledFor?: string;
  className?: string;
}) {
  return (
    <StatusBadge tone={PUBLICATION_TONE[status]} className={className}>
      {PUBLICATION_STATUS_LABEL[status]}
      {status === "programme" && scheduledFor && (
        <span className="font-normal normal-case tracking-normal">
          · {formatDayShort(scheduledFor)} {formatTime(scheduledFor)}
        </span>
      )}
    </StatusBadge>
  );
}

const APPLICATION_TONE: Record<ApplicationStatus, StatusTone> = {
  brouillon: "neutral",
  envoyee: "accent",
  "en-revue": "info",
  entretien: "info",
  acceptee: "ok",
  refusee: "neutral",
  retiree: "neutral",
};

/** Same labels the student sees (APPLICATION_STATUS_LABEL); "Envoyée" is pink = not opened yet. */
export function ApplicationStatusBadge({ status, className }: { status: ApplicationStatus; className?: string }) {
  return (
    <StatusBadge tone={APPLICATION_TONE[status]} className={className}>
      {APPLICATION_STATUS_LABEL[status]}
    </StatusBadge>
  );
}
