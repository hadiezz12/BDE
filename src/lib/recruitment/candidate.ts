/**
 * What a candidate is told about their application once it is sent (Phase 9):
 * the projection private.candidate_status builds (never the team's pipeline),
 * and what the association asks of them. Pure module: the unit tests load it
 * with plain Node.
 *
 * Until an outcome is released, a sent application is "received", then
 * "being examined": a shortlist, a proposed or validated decision, a score
 * or a note never reach this side.
 */

export type CandidateStageKey =
  | "draft"
  | "received"
  | "under_review"
  | "question"
  | "interview_to_book"
  | "interview_scheduled"
  | "offer"
  | "offer_accepted"
  | "offer_declined"
  | "offer_expired"
  | "offer_withdrawn"
  | "not_selected"
  | "waitlisted"
  | "withdrawn";

export interface CandidateStage {
  key: CandidateStageKey;
  since?: string | null;
  /** A date the candidate should act before (a question, an offer, a slot to choose). */
  deadline?: string | null;
  /** interview_scheduled: when. */
  at?: string | null;
}

export type CandidateTone = "neutral" | "info" | "ok" | "warn" | "danger";

export const CANDIDATE_STAGE: Record<CandidateStageKey, { label: string; tone: CandidateTone; action: string | null }> = {
  draft: { label: "Brouillon", tone: "neutral", action: null },
  received: { label: "Envoyée", tone: "info", action: null },
  under_review: { label: "En cours d'examen", tone: "info", action: null },
  question: { label: "Une question t'attend", tone: "warn", action: "Réponds à la question de l'association" },
  interview_to_book: { label: "Invitation à un entretien", tone: "warn", action: "Choisis un créneau" },
  interview_scheduled: { label: "Entretien prévu", tone: "info", action: null },
  offer: { label: "Proposition reçue", tone: "ok", action: "Accepte ou décline la proposition" },
  offer_accepted: { label: "Proposition acceptée", tone: "ok", action: null },
  offer_declined: { label: "Proposition déclinée", tone: "neutral", action: null },
  offer_expired: { label: "Proposition expirée", tone: "neutral", action: null },
  offer_withdrawn: { label: "Proposition retirée", tone: "neutral", action: null },
  not_selected: { label: "Non retenue", tone: "neutral", action: null },
  waitlisted: { label: "Liste d'attente", tone: "info", action: null },
  withdrawn: { label: "Retirée", tone: "neutral", action: null },
};

export interface CandidateSlot {
  id: string;
  starts_at: string;
  ends_at: string;
  mode: "in_person" | "online" | "phone";
  /** Only for in-person slots (the room helps choose); never a meeting link. */
  location: string | null;
}

/** my_application → interview */
export interface CandidateInterview {
  id: string;
  status: "invited" | "scheduled";
  message: string | null;
  respond_by: string | null;
  invited_at: string;
  /** Once booked: the full details, for this candidate only. */
  slot: (CandidateSlot & { meeting_link: string | null; instructions: string | null }) | null;
  can_change: boolean;
  slots: CandidateSlot[];
}

/** my_application → clarifications */
export interface CandidateClarification {
  id: string;
  question: string;
  asked_at: string;
  due_at: string | null;
  status: "open" | "closed" | "answered";
  answer: string | null;
  answered_at: string | null;
  allows_documents: boolean;
  documents: { id: string; file_name: string; mime_type: string; size_bytes: number; status: "ready" }[];
}

/** my_application → outcome (released decisions only) */
export interface CandidateOutcome {
  outcome: "offer" | "reject" | "waitlist";
  released_at: string;
  message: string | null;
  offer: { id: string; status: "pending" | "accepted" | "declined" | "expired" | "withdrawn"; expires_at: string | null; responded_at: string | null } | null;
}

/** Group free slots by day for the picker (Paris time), in order. */
export function slotsByDay(slots: readonly CandidateSlot[]): { day: string; slots: CandidateSlot[] }[] {
  const fmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long" });
  const out: { day: string; slots: CandidateSlot[] }[] = [];
  for (const s of [...slots].sort((a, b) => a.starts_at.localeCompare(b.starts_at))) {
    const day = fmt.format(new Date(s.starts_at));
    const last = out.at(-1);
    if (last && last.day === day) last.slots.push(s);
    else out.push({ day, slots: [s] });
  }
  return out;
}
