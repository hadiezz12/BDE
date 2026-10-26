/**
 * The review workspace (Phase 9): the shapes of the reviewer functions'
 * payloads (supabase/migrations/2026102611*), their words, and the
 * transparent arithmetic of a score. Pure module (relative imports with
 * extensions only): the unit tests load it with plain Node.
 *
 * Nothing here decides who may do what: every power, scope, deadline and
 * transition is checked by the database. A score is decision support: no
 * function in this module turns a number into an outcome.
 */

import { toCsv, csvDate } from "../events/csv.ts";
import type { FormSchema } from "./form.ts";
import type { CandidatePayload } from "./model.ts";

// ---- Vocabulary -------------------------------------------------------------------------------------

/** What a campaign committee appointment (or an organization key) allows. */
export type Power =
  | "view"
  | "documents"
  | "review"
  | "view_team"
  | "committee"
  | "shortlist"
  | "interviews"
  | "propose"
  | "approve"
  | "release"
  | "export";

export const POWERS: readonly Power[] = [
  "view",
  "documents",
  "review",
  "view_team",
  "committee",
  "shortlist",
  "interviews",
  "propose",
  "approve",
  "release",
  "export",
];

export const POWER_LABEL: Record<Power, string> = {
  view: "Lire les candidatures",
  documents: "Ouvrir les CV et documents",
  review: "Évaluer",
  view_team: "Voir les évaluations et la discussion de l'équipe",
  committee: "Composer le comité",
  shortlist: "Faire avancer, poser des questions",
  interviews: "Organiser les entretiens",
  propose: "Proposer des décisions",
  approve: "Valider les décisions",
  release: "Annoncer les décisions",
  export: "Exporter la liste",
};

export type CommitteeRole = "manager" | "reviewer" | "interviewer" | "reader";

/** Starting points for an appointment; the powers chosen are what count. */
export const ROLE_PRESETS: Record<CommitteeRole, { label: string; hint: string; powers: Power[] }> = {
  manager: {
    label: "Responsable du recrutement",
    hint: "Mène le recrutement : comité, évaluations, entretiens, décisions.",
    powers: ["view", "documents", "review", "view_team", "committee", "shortlist", "interviews", "propose", "approve", "release"],
  },
  reviewer: {
    label: "Évaluation",
    hint: "Lit les candidatures qui lui sont ouvertes et les évalue.",
    powers: ["view", "documents", "review"],
  },
  interviewer: {
    label: "Entretiens",
    hint: "Voit seulement les candidatures des entretiens qu'il ou elle fait passer.",
    powers: ["view"],
  },
  reader: {
    label: "Lecture",
    hint: "Lit, sans évaluer ni décider.",
    powers: ["view"],
  },
};

export type CommitteeScope = "campaign" | "positions" | "assigned";

export const SCOPE_LABEL: Record<CommitteeScope, string> = {
  campaign: "Tout le recrutement",
  positions: "Certains postes",
  assigned: "Seulement ce qui lui est confié",
};

/** The internal pipeline (never shown to the candidate as such). */
export type PipelineStage = "new" | "under_review" | "shortlisted" | "interview";

export const STAGE_LABEL: Record<PipelineStage, string> = {
  new: "Nouvelle",
  under_review: "En examen",
  shortlisted: "Présélectionnée",
  interview: "Entretien",
};

export type Recommendation = "shortlist" | "interview" | "offer" | "waitlist" | "reject" | "undecided";

export const RECOMMENDATIONS: readonly Recommendation[] = ["shortlist", "interview", "offer", "waitlist", "reject", "undecided"];

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  shortlist: "Présélectionner",
  interview: "Voir en entretien",
  offer: "Retenir",
  waitlist: "Liste d'attente",
  reject: "Ne pas retenir",
  undecided: "Sans avis tranché",
};

export type Outcome = "offer" | "reject" | "waitlist";

export const OUTCOME_LABEL: Record<Outcome, string> = {
  offer: "Retenir (proposer le poste)",
  reject: "Ne pas retenir",
  waitlist: "Liste d'attente",
};

/** A short word for lists. */
export const OUTCOME_SHORT: Record<Outcome, string> = {
  offer: "Retenue",
  reject: "Non retenue",
  waitlist: "Liste d'attente",
};

export type DecisionStatus = "proposed" | "finalized" | "released" | "returned" | "cancelled" | "superseded";

export const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = {
  proposed: "Proposée, à valider",
  finalized: "Validée, pas encore annoncée",
  released: "Annoncée",
  returned: "Renvoyée",
  cancelled: "Annulée",
  superseded: "Remplacée",
};

export type OfferStatus = "pending" | "accepted" | "declined" | "expired" | "withdrawn";

export const OFFER_STATUS_LABEL: Record<OfferStatus, string> = {
  pending: "En attente de réponse",
  accepted: "Acceptée par la personne",
  declined: "Déclinée par la personne",
  expired: "Délai de réponse dépassé",
  withdrawn: "Retirée",
};

export type ApprovalPolicy = "single" | "two" | "president";

export const APPROVAL_POLICY_LABEL: Record<ApprovalPolicy, string> = {
  single: "Une validation (une personne qui valide les décisions)",
  two: "Deux validations, par deux personnes différentes",
  president: "Une validation, plus celle de la présidence (deux personnes)",
};

export type InterviewMode = "in_person" | "online" | "phone";

export const MODE_LABEL: Record<InterviewMode, string> = {
  in_person: "Sur place",
  online: "En visio",
  phone: "Par téléphone",
};

export type InterviewStatus = "invited" | "scheduled" | "completed" | "no_show" | "cancelled";

export const INTERVIEW_STATUS_LABEL: Record<InterviewStatus, string> = {
  invited: "Invitée, créneau à choisir",
  scheduled: "Prévu",
  completed: "Passé",
  no_show: "Absente",
  cancelled: "Annulé",
};

// ---- Message templates --------------------------------------------------------------------------

export type TemplateKind = "interview_invitation" | "clarification" | "offer" | "rejection" | "waitlist";

export const TEMPLATE_KINDS: readonly TemplateKind[] = ["interview_invitation", "clarification", "offer", "rejection", "waitlist"];

export const TEMPLATE_LABEL: Record<TemplateKind, string> = {
  interview_invitation: "Invitation à un entretien",
  clarification: "Question complémentaire (introduction)",
  offer: "Proposition du poste",
  rejection: "Réponse négative",
  waitlist: "Liste d'attente",
};

/** The only words that may sit between braces; replaced as text, never run. */
export const TEMPLATE_PLACEHOLDERS = [
  { key: "prenom", hint: "le prénom de la personne" },
  { key: "association", hint: "le nom de l'asso" },
  { key: "recrutement", hint: "le titre du recrutement" },
  { key: "poste", hint: "le poste" },
  { key: "reference", hint: "la référence de la candidature" },
] as const;

const ALLOWED = new Set<string>(TEMPLATE_PLACEHOLDERS.map((p) => p.key));

/** Placeholders the database would refuse (same rule as private.template_placeholders_ok). */
export function unknownPlaceholders(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(/\{([^{}]*)\}/g)) if (!ALLOWED.has(m[1]) && !out.includes(m[1])) out.push(m[1]);
  return out;
}

/** The message as one candidate would read it (preview). */
export function renderTemplate(body: string, values: Partial<Record<(typeof TEMPLATE_PLACEHOLDERS)[number]["key"], string>>): string {
  return body.replace(/\{(prenom|association|recrutement|poste|reference)\}/g, (_, k: keyof typeof values) => values[k] ?? "");
}

// ---- Rubrics and scores -----------------------------------------------------------------------

export interface Criterion {
  id: string;
  label: string;
  description: string | null;
  /** Scores go from 1 to max. */
  max: number;
  weight: number;
  required: boolean;
}

export type Scores = Record<string, number>;

export interface ReviewTotal {
  points: number;
  out_of: number;
  percent: number;
  scored: number;
}

/**
 * Σ(score × weight) over Σ(max × weight), counting only the criteria scored
 * (the same rule as private.review_total). Null when nothing is scored.
 */
export function reviewTotal(criteria: readonly Criterion[], scores: Scores): ReviewTotal | null {
  let points = 0;
  let outOf = 0;
  let scored = 0;
  for (const c of criteria) {
    const v = scores[c.id];
    if (typeof v !== "number") continue;
    points += v * c.weight;
    outOf += c.max * c.weight;
    scored += 1;
  }
  if (scored === 0 || outOf === 0) return null;
  return { points, out_of: outOf, percent: Math.round((1000 * points) / outOf) / 10, scored };
}

/** "86,7 %" */
export function percentLabel(percent: number | null | undefined): string {
  return percent === null || percent === undefined ? "—" : `${percent.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
}

/** The basis of a score, spelled out (never a bare number). */
export function totalBasis(total: ReviewTotal | null): string {
  if (!total) return "Aucun critère noté.";
  const n = total.scored > 1 ? `${total.scored} critères notés` : "1 critère noté";
  return `${total.points} points pondérés sur ${total.out_of} possibles (${n}) : ${percentLabel(total.percent)}.`;
}

/** A criterion id from its label: lowercase letters, digits and _, unique in the grid. */
export function criterionId(label: string, taken: readonly string[]): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || "critere";
  let id = base;
  for (let i = 2; taken.includes(id); i++) id = `${base}_${i}`;
  return id;
}

/** What is wrong with a grid before it is sent (the database checks again). */
export function rubricProblem(criteria: readonly Criterion[]): string | null {
  if (criteria.length > 12) return "12 critères au plus.";
  const ids = new Set<string>();
  for (const c of criteria) {
    if (c.label.trim().length < 2 || c.label.trim().length > 80) return "Chaque critère a un nom de 2 à 80 caractères.";
    if (!Number.isInteger(c.max) || c.max < 2 || c.max > 10) return "Une note va de 1 à un maximum entre 2 et 10.";
    if (!Number.isInteger(c.weight) || c.weight < 1 || c.weight > 10) return "Un poids va de 1 à 10.";
    if ((c.description ?? "").length > 300) return "Une description fait 300 caractères au plus.";
    if (ids.has(c.id)) return "Deux critères ont le même identifiant.";
    ids.add(c.id);
  }
  return null;
}

/**
 * A starting grid the team can change entirely. Generic, role-relevant
 * criteria (the brief's own examples); nothing about who the person is.
 */
export const STARTER_CRITERIA: Criterion[] = [
  { id: "motivation", label: "Motivation", description: null, max: 5, weight: 1, required: true },
  { id: "experience", label: "Expérience utile pour le poste", description: null, max: 5, weight: 1, required: true },
  { id: "disponibilite", label: "Disponibilité", description: null, max: 5, weight: 1, required: true },
  { id: "communication", label: "Communication", description: null, max: 5, weight: 1, required: false },
];

// ---- Payloads ------------------------------------------------------------------------------------

export interface OrganizationCard {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  accent: string | null;
  kind: string;
}

/** public.my_recruitment_work() */
export interface WorkItem {
  campaign: { id: string; title: string; academic_year: string | null; state: string; closes_at: string | null; archived: boolean };
  organization: OrganizationCard;
  powers: Power[];
  member: { id: string; role: CommitteeRole; scope: CommitteeScope; ends_at: string } | null;
  assigned: number;
  to_review: number;
  interviews: number;
  to_approve: number | null;
  submitted: number | null;
}

/** public.recruitment_campaign_access(id) */
export interface CampaignAccess {
  id: string;
  title: string;
  state: string;
  published: boolean;
  archived: boolean;
  powers: Power[];
  editor: boolean;
  candidate: boolean;
}

/** public.recruitment_campaign_board(id) */
export interface CampaignBoard {
  campaign: {
    id: string;
    title: string;
    slug: string | null;
    academic_year: string | null;
    state: string;
    opens_at: string | null;
    closes_at: string | null;
    archived_at: string | null;
    required_reviews: number;
    approval_policy: ApprovalPolicy;
    sealed: boolean;
  };
  organization: OrganizationCard;
  powers: Power[];
  member: WorkItem["member"];
  counts: {
    received: number;
    withdrawn: number;
    new: number;
    under_review: number;
    shortlisted: number;
    interview: number;
    decision_pending: number;
    finalized: number;
    released: number;
    interviews_scheduled: number;
  };
  positions: {
    id: string;
    title: string;
    openings: number | null;
    retired: boolean;
    offers: number;
    total: number;
    not_assigned: number;
    awaiting: number;
    partial: number;
    complete: number;
  }[];
  mine: { assigned: number; reviewed: number; drafts: number };
  rubric: { number: number; criteria: number } | null;
  campaigns: { id: string; title: string; state: string }[];
}

export interface ListDecision {
  id: string;
  status: DecisionStatus;
  outcome: Outcome;
}

export interface ApplicationRow {
  id: string;
  reference: string;
  name: string;
  status: "submitted" | "withdrawn";
  program: string | null;
  study_year: number | string | null;
  position: { id: string; title: string };
  submitted_at: string;
  withdrawn_at: string | null;
  stage: PipelineStage;
  decision: ListDecision | null;
  reviews: { counted: number; required: number; mine: "draft" | "submitted" | null };
  assigned: string[];
  tags: { id: string; label: string }[];
  /** Average of the submitted reviews (team view only). */
  score: number | null;
}

/** public.recruitment_application_list(id, filters, limit, offset) */
export interface ApplicationList {
  total: number;
  limit: number;
  offset: number;
  rows: ApplicationRow[];
  tags: { id: string; label: string }[];
  reviewers: { id: string; name: string }[];
  positions: { id: string; title: string }[];
  required_reviews: number;
  powers: Power[];
}

export interface RubricVersion {
  number: number;
  kind: "application" | "interview";
  status: "published" | "superseded" | "draft";
  criteria: Criterion[];
}

export interface ReviewPayload {
  id: string;
  kind: "application" | "interview";
  interview_id: string | null;
  mine: boolean;
  reviewer_name: string;
  status: "draft" | "submitted";
  rubric_version_id: string | null;
  scores: Scores;
  recommendation: Recommendation | null;
  note: string | null;
  version: number;
  revision_count: number;
  submitted_at: string | null;
  amended_at: string | null;
  updated_at: string;
  total: ReviewTotal | null;
  conflicted: boolean;
}

export interface ClarificationPayload {
  id: string;
  question: string;
  asked_at: string;
  asked_by_name: string | null;
  due_at: string | null;
  original_due_at: string | null;
  extensions: { from: string | null; to: string; at: string; by_name: string; reason: string | null }[];
  status: "open" | "closed" | "answered" | "cancelled";
  allows_documents: boolean;
  answer: string | null;
  answered_at: string | null;
  cancel_reason: string | null;
  documents: { id: string; file_name: string; mime_type: string; size_bytes: number }[] | null;
}

export interface SlotPayload {
  id: string;
  starts_at: string;
  ends_at: string;
  mode: InterviewMode;
  location: string | null;
  meeting_link?: string | null;
  instructions?: string | null;
}

export interface InterviewPayload {
  id: string;
  status: InterviewStatus;
  invited_at: string;
  respond_by: string | null;
  message: string | null;
  invited_by_name: string | null;
  cancel_reason: string | null;
  completed_at: string | null;
  can_assess: boolean;
  slot: (SlotPayload & { interviewers: string[] }) | null;
}

export interface DecisionPayload {
  id: string;
  outcome: Outcome;
  status: DecisionStatus;
  rationale: string | null;
  message: string | null;
  proposed_by_name: string | null;
  mine: boolean;
  proposed_at: string;
  finalized_at: string | null;
  reviews_override_reason: string | null;
  capacity_override_reason: string | null;
  returned_at: string | null;
  return_reason: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  release_scheduled_at: string | null;
  released_at: string | null;
  released_by_name: string | null;
  offer_expires_at: string | null;
  waitlist_rank: number | null;
  approved_by_me: boolean;
  approvals: { name: string; as_president: boolean; at: string }[];
  offer: {
    id: string;
    status: OfferStatus;
    expires_at: string | null;
    responded_at: string | null;
    response_note: string | null;
    withdraw_reason: string | null;
    onboarding: { status: string; at: string; by_name: string | null } | null;
  } | null;
}

/** public.recruitment_application(id) */
export interface ApplicationDetail {
  application: {
    id: string;
    reference: string;
    status: "submitted" | "withdrawn";
    submitted_at: string;
    withdrawn_at: string | null;
    form_version: number;
  };
  campaign: {
    id: string;
    title: string;
    state: string;
    required_reviews: number;
    approval_policy: ApprovalPolicy;
    organization: OrganizationCard;
    president_name: string | null;
  };
  position: { id: string; title: string; openings: number | null; offers: number };
  can: Record<Power, boolean> & { invite_members: boolean };
  candidate: CandidatePayload;
  /** Null once withdrawn (the record stays, not the content). */
  form: FormSchema | null;
  answers: Record<string, unknown> | null;
  documents: { id: string; question_id: string; file_name: string; mime_type: string; size_bytes: number }[] | null;
  document_count: number;
  clarifications: ClarificationPayload[];
  pipeline: { stage: PipelineStage; changed_at: string; changed_by_name: string | null } | null;
  rubrics: Record<string, RubricVersion>;
  reviews: ReviewPayload[];
  summary: { counted: number; required: number; average: number | null; recommendations: Partial<Record<Recommendation, number>> | null };
  assignments: { id: string; member_id: string; name: string; assigned_at: string; review: "draft" | "submitted" | null }[] | null;
  conflicts:
    | { id: string; name: string; status: "open" | "reassigned" | "cleared"; note: string | null; declared_at: string; resolution: string | null; resolved_at: string | null }[]
    | null;
  tags: { id: string; label: string; on: boolean }[];
  comments: { id: string; author_name: string; mine: boolean; body: string | null; retracted: boolean; created_at: string; mentions: string[] }[] | null;
  mentionable: { id: string; name: string }[] | null;
  interviews: InterviewPayload[];
  free_slots: SlotPayload[] | null;
  decisions: DecisionPayload[];
  team_positions: { id: string; title: string }[] | null;
  activity: { action: string; at: string; actor_name: string | null; details: Record<string, unknown> }[];
  access: { actor_name: string; action: "application_opened" | "document_opened"; at: string; file_name: string | null }[] | null;
}

export interface CommitteeMember {
  id: string;
  user_id: string;
  membership_id: string;
  name: string;
  me: boolean;
  role: CommitteeRole;
  powers: Power[];
  scope: CommitteeScope;
  positions: string[];
  starts_at: string;
  ends_at: string;
  purpose: string | null;
  live: boolean;
  candidate: boolean;
  appointed_by_name: string | null;
  revoked_at: string | null;
  revoke_reason: string | null;
  assigned: number;
  reviewed: number;
}

/** public.recruitment_committee(id) */
export interface CommitteeBoard {
  campaign: CampaignBoard["campaign"] & { sealed_at: string | null };
  organization: OrganizationCard;
  president_name: string | null;
  powers: Power[];
  positions: { id: string; title: string; openings: number | null }[];
  members: CommitteeMember[];
  by_position: { name: string; positions: string[]; powers: Power[]; candidate: boolean }[];
  eligible: { membership_id: string; name: string; candidate: boolean; positions: string[] }[] | null;
  rubrics: Record<
    "application" | "interview",
    {
      live: { id: string; number: number; criteria: Criterion[]; published_at: string; reviews: number } | null;
      draft: { id: string; number: number; criteria: Criterion[]; edit_version: number } | null;
    }
  >;
  templates: Partial<Record<TemplateKind, string>>;
  tags: { id: string; label: string; used: number }[];
  conflicts:
    | { id: string; name: string; application_id: string; reference: string; status: "open" | "reassigned" | "cleared"; note: string | null; declared_at: string; resolution: string | null }[]
    | null;
  access: { actor_name: string; action: "application_opened" | "document_opened"; at: string; application_id: string; reference: string; file_name: string | null }[] | null;
}

/** public.recruitment_interview_board(id) */
export interface InterviewBoard {
  can: { manage: boolean };
  timezone: string;
  positions: { id: string; title: string }[];
  interviewers: { id: string; name: string }[] | null;
  slots: (SlotPayload & {
    cancelled_at: string | null;
    position: { id: string; title: string } | null;
    interviewers: { id: string; name: string }[];
    mine: boolean;
    booking: { interview_id: string; status: InterviewStatus; application_id: string; reference: string; name: string | null; position: string } | null;
  })[];
  waiting: { interview_id: string; application_id: string; reference: string; name: string; position: string; invited_at: string; respond_by: string | null }[] | null;
}

/** public.recruitment_decision_board(id) */
export interface DecisionBoard {
  campaign: { id: string; title: string; required_reviews: number; approval_policy: ApprovalPolicy; timezone: string };
  president_name: string | null;
  powers: Power[];
  positions: { id: string; title: string; openings: number | null; offers: number; accepted: number }[];
  decisions: {
    id: string;
    application_id: string;
    reference: string;
    name: string;
    application_status: "submitted" | "withdrawn";
    position: { id: string; title: string };
    outcome: Outcome;
    status: DecisionStatus;
    proposed_at: string;
    proposed_by_name: string | null;
    finalized_at: string | null;
    release_scheduled_at: string | null;
    released_at: string | null;
    waitlist_rank: number | null;
    reviews: number;
    approvals: number;
    approved_by_me: boolean;
    can_approve: boolean;
    can_release: boolean;
    offer: { id: string; status: OfferStatus; expires_at: string | null; responded_at: string | null; onboarding: boolean } | null;
  }[];
  ready: { application_id: string; reference: string; name: string; position: string; reviews: number }[] | null;
}

// ---- Where an application stands, for the team ------------------------------------------------

/** One phrase for a list row: the decision when there is one, else the stage. */
export function teamState(row: { status: string; stage: PipelineStage; decision: ListDecision | null }): string {
  if (row.status === "withdrawn") return "Retirée par la personne";
  if (row.decision) {
    if (row.decision.status === "released") return `Annoncée · ${OUTCOME_SHORT[row.decision.outcome]}`;
    if (row.decision.status === "finalized") return `Décision validée · ${OUTCOME_SHORT[row.decision.outcome]}`;
    return `Décision proposée · ${OUTCOME_SHORT[row.decision.outcome]}`;
  }
  return STAGE_LABEL[row.stage];
}

/** Review progress of one application, in words. */
export function reviewProgress(counted: number, required: number): string {
  if (required === 0) return counted === 0 ? "Aucune évaluation demandée" : `${counted} évaluation${counted > 1 ? "s" : ""}`;
  if (counted >= required) return `Évaluations complètes (${counted}/${required})`;
  return `${counted}/${required} évaluation${required > 1 ? "s" : ""}`;
}

// ---- The team's history of an application ----------------------------------------------------

export const ACTIVITY_LABEL: Record<string, string> = {
  reviewer_assigned: "Confiée à une personne du comité",
  reviewer_unassigned: "Retirée de la liste d'une personne",
  stage_changed: "Étape changée",
  review_started: "Évaluation commencée",
  review_submitted: "Évaluation soumise",
  review_amended: "Évaluation corrigée",
  interview_assessed: "Évaluation d'entretien soumise",
  conflict_declared: "Conflit d'intérêts déclaré",
  conflict_resolved: "Conflit d'intérêts réglé",
  interview_invited: "Invitée à un entretien",
  interview_scheduled: "Entretien réservé",
  interview_rescheduled: "Entretien déplacé",
  interview_details_changed: "Infos de l'entretien modifiées",
  interview_cancelled: "Entretien annulé",
  interview_completed: "Entretien passé",
  interview_no_show: "Absente à l'entretien",
  clarification_requested: "Question posée",
  clarification_extended: "Délai de réponse prolongé",
  clarification_cancelled: "Question retirée",
  clarification_answered: "Réponse reçue",
  decision_proposed: "Décision proposée",
  decision_approved: "Décision approuvée",
  decision_finalized: "Décision validée",
  decision_returned: "Décision renvoyée",
  decision_cancelled: "Décision annulée",
  decision_release_scheduled: "Annonce programmée",
  decision_release_unscheduled: "Annonce déprogrammée",
  decision_release_skipped: "Annonce programmée non faite (droit retiré ou candidature retirée)",
  decision_released: "Décision annoncée",
  offer_accepted: "Proposition acceptée",
  offer_declined: "Proposition déclinée",
  offer_expired: "Proposition expirée",
  offer_withdrawn: "Proposition retirée",
  membership_onboarding_initiated: "Invitation dans l'équipe envoyée",
  candidate_withdrew: "Candidature retirée par la personne",
};

export function activityLine(entry: { action: string; details: Record<string, unknown> }): string {
  const base = ACTIVITY_LABEL[entry.action] ?? entry.action.replace(/_/g, " ");
  const d = entry.details ?? {};
  if (entry.action === "stage_changed" && typeof d.to === "string" && d.to in STAGE_LABEL) {
    return `${base} : ${STAGE_LABEL[d.to as PipelineStage]}`;
  }
  if ((entry.action === "decision_proposed" || entry.action === "decision_released" || entry.action === "decision_finalized")
      && typeof d.outcome === "string" && d.outcome in OUTCOME_SHORT) {
    return `${base} : ${OUTCOME_SHORT[d.outcome as Outcome]}`;
  }
  if ((entry.action === "reviewer_assigned" || entry.action === "reviewer_unassigned") && typeof d.reviewer_name === "string") {
    return `${base} : ${d.reviewer_name}`;
  }
  return base;
}

// ---- The export -----------------------------------------------------------------------------------

export interface ExportRow {
  reference: string;
  last_name: string | null;
  first_name: string | null;
  program: string | null;
  study_year: string | null;
  position: string;
  submitted_at: string;
  status: "submitted" | "withdrawn";
  stage: PipelineStage;
  reviews: number;
  average: number | null;
  decision: string | null;
  offer: OfferStatus | null;
}

function decisionWords(code: string | null): string {
  if (!code) return "";
  const [status, outcome] = code.split(":");
  const o = OUTCOME_SHORT[outcome as Outcome] ?? outcome;
  return `${DECISION_STATUS_LABEL[status as DecisionStatus] ?? status} · ${o}`;
}

/** The applicant list as a CSV safe for spreadsheets (formula cells neutralised). Essential fields only. */
export function applicationsCsv(rows: readonly ExportRow[]): string {
  return toCsv([
    ["Référence", "Nom", "Prénom", "Programme", "Année", "Poste", "Envoyée le", "Statut", "Étape", "Évaluations", "Moyenne (%)", "Décision", "Proposition"],
    ...rows.map((r) => [
      r.reference,
      r.last_name,
      r.first_name,
      r.program,
      r.study_year,
      r.position,
      csvDate(r.submitted_at),
      r.status === "withdrawn" ? "Retirée" : "Envoyée",
      STAGE_LABEL[r.stage] ?? r.stage,
      r.reviews,
      r.average === null ? "" : String(r.average).replace(".", ","),
      decisionWords(r.decision),
      r.offer ? OFFER_STATUS_LABEL[r.offer] : "",
    ]),
  ]);
}

export function exportFileName(title: string, now = new Date()): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `candidatures-${slug || "recrutement"}-${now.toISOString().slice(0, 10)}.csv`;
}
