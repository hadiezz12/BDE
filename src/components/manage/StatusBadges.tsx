import type { ApplicationStatus } from "@/lib/types";
import { APPLICATION_STATUS_LABEL } from "@/lib/format";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";

/**
 * Status markers for workspace tables, built on the quiet StatusBadge (dot +
 * words, never colour alone). Green = live, cyan = scheduled/in progress,
 * pink = needs the bureau's attention. Amber stays reserved for safety.
 */

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
