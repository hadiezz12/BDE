/**
 * Shapes of the recruitment functions' payloads
 * (supabase/migrations/20261026090*), their mapping to the UI's types, and
 * the plain-language facts of campaigns and applications. Pure module
 * (relative imports with extensions only): the unit tests load it with plain
 * Node.
 *
 * Nothing here decides who may do what: states, eligibility, limits and
 * deadlines come from the database; these helpers only word them.
 */

import type {
  AccentKey,
  ApplicationCampaign,
  ApplicationItem,
  ApplicationStatus,
  CampaignItem,
  CampaignStatus,
  DocumentKind,
  FormSummary,
  RecruitmentPosition,
  RecruitmentStep,
} from "../types";
import { toPhoto, type MediaPayload } from "../associations/model.ts";
import { organizationRef, type OrganizationCardPayload } from "../posts/model.ts";
import { paragraphs } from "../events/model.ts";
import type { FormSchema } from "./form.ts";
import type { CandidateClarification, CandidateInterview, CandidateOutcome, CandidateStage } from "./candidate.ts";

// ---- Payloads ------------------------------------------------------------------------------------

/** private.campaign_state */
export type CampaignState = "draft" | "unpublished" | "cancelled" | "closed" | "paused" | "upcoming" | "open";

export interface FormSummaryPayload {
  questions: number;
  required: number;
  documents: { label: string; type: "file" | "cv"; required: boolean; file_types: DocumentKind[] }[];
}

/** private.position_card (+ position_detail) */
export interface PositionPayload {
  id: string;
  slug: string;
  title: string;
  team: string | null;
  summary: string | null;
  openings: number | null;
  closes_at: string | null;
  closes_early: boolean;
  eligible_years: number[] | null;
  accepting: boolean;
  retired: boolean;
  description?: string | null;
  missions?: string | null;
  expectations?: string | null;
  commitment?: string | null;
  form?: FormSummaryPayload;
}

export interface ContactPayload {
  name: string | null;
  role: string | null;
  email: string | null;
}

/** private.campaign_card (+ public_recruitment_campaign's extra fields) */
export interface CampaignCardPayload {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  academic_year: string | null;
  cover: MediaPayload | null;
  organization: OrganizationCardPayload;
  opens_at: string;
  closes_at: string;
  timezone: string;
  state: CampaignState;
  paused_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  max_applications: number;
  eligible_years: number[] | null;
  eligibility_note: string | null;
  archived: boolean;
  first_published_at: string | null;
  updated_at: string;
  positions: PositionPayload[];
  description?: string | null;
  process?: { label: string; detail?: string; date?: string }[];
  faq?: { question: string; answer: string }[];
  contact?: ContactPayload | null;
}

export type PublicCampaignState =
  | { state: "ok"; campaign: CampaignCardPayload }
  | { state: "moved"; slug: string }
  | { state: "not_found" };

export type PublicPositionState =
  | { state: "ok"; campaign: CampaignCardPayload; position: PositionPayload }
  | { state: "moved"; slug: string }
  | { state: "not_found" };

export interface RecruitmentFacets {
  current: number;
  open: number;
  upcoming: number;
  closing_soon: number;
  closed: number;
  open_positions: number;
  organizations: { slug: string; name: string; short_name: string | null; accent: AccentKey; count: number }[];
  academic_years: string[];
}

export interface RecruitmentPrivacy {
  notice: string | null;
  contact: string | null;
  draft_months: number | null;
  withdrawn_months: number | null;
  submitted_months: number | null;
  updated_at: string;
}

/** A campaign the candidate can no longer open (hidden or unpublished): the bare facts. */
interface UnavailableCampaignPayload {
  id: string;
  slug: null;
  title: string;
  organization: OrganizationCardPayload;
  state: CampaignState;
  closes_at: string | null;
  cancellation_reason: string | null;
  unavailable: true;
}

export type ApplicationDbStatus = "draft" | "submitted" | "withdrawn";

/** One item of public.my_applications() */
export interface MyApplicationsItemPayload {
  application: {
    id: string;
    status: ApplicationDbStatus;
    reference: string | null;
    created_at: string;
    updated_at: string;
    last_saved_at: string | null;
    submitted_at: string | null;
    withdrawn_at: string | null;
    refusal: string | null;
    progress: { required: number; missing: number; complete: boolean } | null;
    /** What the candidate is told about where it stands (Phase 9; never the team pipeline). */
    stage: CandidateStage;
  };
  campaign: CampaignCardPayload | UnavailableCampaignPayload;
  position: { id: string; slug: string; title: string; team: string | null; closes_at: string | null };
}

export interface ApplicationDocument {
  id: string;
  question_id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  status: "ready";
  created_at: string;
}

/** What the association receives with the answers (the profile, or as it was at submission). */
export interface CandidatePayload {
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  email: string | null;
  program: string | null;
  study_year: number | null;
}

/** public.my_application(id) */
export interface MyApplicationPayload {
  application: MyApplicationsItemPayload["application"] & {
    version: number;
    answers: Record<string, unknown>;
    withdrawal_reason: string | null;
    privacy_acknowledged_at: string | null;
    form_version: number;
    form_changed: boolean;
    eligibility: string | null;
  };
  form: FormSchema;
  documents: ApplicationDocument[];
  campaign: (CampaignCardPayload | UnavailableCampaignPayload) & { contact: ContactPayload | null };
  position: MyApplicationsItemPayload["position"];
  candidate: CandidatePayload;
  history: { action: ApplicationHistoryAction; at: string; details: Record<string, unknown> | null }[];
  privacy: RecruitmentPrivacy;
  /** Phase 9: the live interview, the questions asked, the released outcome. */
  interview: CandidateInterview | null;
  clarifications: CandidateClarification[];
  outcome: CandidateOutcome | null;
}

export type ApplicationHistoryAction =
  | "started"
  | "submitted"
  | "withdrawn"
  | "document_added"
  | "document_replaced"
  | "document_removed"
  | "form_updated"
  | "review_started"
  | "interview_invited"
  | "interview_scheduled"
  | "interview_rescheduled"
  | "interview_cancelled"
  | "interview_completed"
  | "clarification_requested"
  | "clarification_extended"
  | "clarification_answered"
  | "clarification_cancelled"
  | "decision_released"
  | "offer_accepted"
  | "offer_declined"
  | "offer_expired"
  | "offer_withdrawn";

// ---- Mapping --------------------------------------------------------------------------------------

/** The last stretch of an open campaign, said louder. */
export const LAST_CHANCE_MS = 48 * 3_600_000;

/** The visitor-facing status of a campaign: the database's state, plus "last chance". */
export function campaignStatus(state: CampaignState, closesAt: string | null, now = new Date()): CampaignStatus {
  switch (state) {
    case "open":
      return closesAt && Date.parse(closesAt) - now.getTime() <= LAST_CHANCE_MS ? "derniere-chance" : "ouverte";
    case "upcoming":
      return "a-venir";
    case "paused":
      return "en-pause";
    case "cancelled":
      return "annulee";
    default:
      return "cloturee";
  }
}

/** One item per line, trimmed; bullets typed by hand ("- ", "• ") dropped. */
export function lines(text: string | null | undefined): string[] {
  return (text ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-•*·]\s+)/, "").trim())
    .filter(Boolean);
}

function toFormSummary(f: FormSummaryPayload | undefined): FormSummary | undefined {
  if (!f) return undefined;
  return {
    questions: f.questions,
    required: f.required,
    documents: (f.documents ?? []).map((d) => ({ label: d.label, type: d.type, required: d.required, fileTypes: d.file_types ?? [] })),
  };
}

export function toPosition(p: PositionPayload, campaignClosesAt: string): RecruitmentPosition {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    team: p.team ?? undefined,
    openings: p.openings ?? undefined,
    summary: p.summary ?? undefined,
    description: paragraphs(p.description),
    missions: lines(p.missions),
    expectations: lines(p.expectations),
    commitment: p.commitment ?? undefined,
    closesAt: p.closes_at ?? campaignClosesAt,
    closesEarly: p.closes_early,
    eligibleYears: p.eligible_years ?? undefined,
    accepting: p.accepting,
    form: toFormSummary(p.form),
  };
}

/** Places across positions, only when every position said how many (never a guess). */
export function totalSeats(positions: Pick<RecruitmentPosition, "openings">[]): number | null {
  if (positions.length === 0 || positions.some((p) => p.openings === undefined)) return null;
  return positions.reduce((n, p) => n + (p.openings ?? 0), 0);
}

export function toCampaignItem(c: CampaignCardPayload, { preview = false, now = new Date() } = {}): CampaignItem {
  const positions = (c.positions ?? []).map((p) => toPosition(p, c.closes_at));
  const contact = c.contact && (c.contact.name || c.contact.email)
    ? { name: c.contact.name ?? undefined, role: c.contact.role ?? undefined, email: c.contact.email ?? undefined }
    : undefined;
  return {
    id: c.id,
    slug: c.slug,
    associationId: c.organization.id,
    association: organizationRef(c.organization, preview),
    title: c.title,
    intro: c.summary ?? "",
    description: paragraphs(c.description),
    academicYear: c.academic_year ?? undefined,
    opensAt: c.opens_at,
    closesAt: c.closes_at,
    status: campaignStatus(c.state, c.closes_at, now),
    cancellationReason: c.cancellation_reason ?? undefined,
    maxApplications: c.max_applications,
    eligibleYears: c.eligible_years ?? undefined,
    eligibilityNote: c.eligibility_note ?? undefined,
    archived: c.archived,
    positions,
    process: (c.process ?? []).map((s): RecruitmentStep => ({ label: s.label, detail: s.detail ?? "", date: s.date || undefined })),
    faq: c.faq ?? [],
    cover: toPhoto(c.cover, `Visuel du recrutement ${c.title}`, null, preview),
    contact,
    updatedAt: c.updated_at,
    seats: totalSeats(positions),
  };
}

export const APPLICATION_STATUS: Record<ApplicationDbStatus, ApplicationStatus> = {
  draft: "brouillon",
  submitted: "envoyee",
  withdrawn: "retiree",
};

function toApplicationCampaign(c: CampaignCardPayload | UnavailableCampaignPayload, now: Date): ApplicationCampaign {
  return {
    id: c.id,
    slug: c.slug ?? undefined,
    title: c.title,
    association: organizationRef(c.organization),
    status: campaignStatus(c.state, c.closes_at, now),
    closesAt: c.closes_at ?? "",
    cancellationReason: c.cancellation_reason ?? undefined,
  };
}

export function toApplicationItem(p: MyApplicationsItemPayload, now = new Date()): ApplicationItem {
  const a = p.application;
  return {
    id: a.id,
    status: APPLICATION_STATUS[a.status],
    reference: a.reference ?? undefined,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
    lastSavedAt: a.last_saved_at ?? undefined,
    submittedAt: a.submitted_at ?? undefined,
    withdrawnAt: a.withdrawn_at ?? undefined,
    refusal: a.refusal ?? undefined,
    progress: a.progress ?? undefined,
    campaign: toApplicationCampaign(p.campaign, now),
    position: {
      id: p.position.id,
      slug: p.position.slug,
      title: p.position.title,
      team: p.position.team ?? undefined,
      closesAt: p.position.closes_at ?? p.campaign.closes_at ?? "",
    },
  };
}

// ---- Facts and words --------------------------------------------------------------------------------

export function isOpen(status: CampaignStatus): boolean {
  return status === "ouverte" || status === "derniere-chance";
}

/** Over for good: nothing more to apply for. */
export function isOver(status: CampaignStatus): boolean {
  return status === "cloturee" || status === "annulee";
}

/** "2e et 3e année", "1re année", "Toutes les années". */
export function yearsLabel(years: number[] | undefined | null): string {
  if (!years || years.length === 0) return "Toutes les années";
  const words = [...years].sort((a, b) => a - b).map((y) => (y === 1 ? "1re" : `${y}e`));
  const list = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} et ${words[words.length - 1]}`;
  return `${list} année`;
}

/** Why a draft cannot go now / why a student cannot start: the database's code, in words. */
export const REFUSAL_LABEL: Record<string, string> = {
  campaign_not_found: "Ce recrutement n'est plus en ligne.",
  campaign_cancelled: "L'association a annulé ce recrutement.",
  campaign_paused: "L'association a mis ce recrutement en pause : les envois reprendront quand elle le rouvrira.",
  campaign_not_open: "Les candidatures ne sont pas encore ouvertes.",
  campaign_closed: "La date limite est passée : ce brouillon ne peut plus être envoyé.",
  position_closed: "Ce poste ne prend plus de candidature.",
  profile_incomplete: "Termine d'abord ton profil (prénom et nom).",
  not_eligible: "Ce poste est réservé à d'autres années d'études (selon l'année indiquée dans ton profil).",
};

export function refusalLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return REFUSAL_LABEL[code] ?? "Cette candidature ne peut pas être envoyée pour l'instant.";
}

export const HISTORY_LABEL: Record<ApplicationHistoryAction, string> = {
  started: "Brouillon commencé",
  submitted: "Candidature envoyée",
  withdrawn: "Candidature retirée",
  document_added: "Document ajouté",
  document_replaced: "Document remplacé",
  document_removed: "Document retiré",
  form_updated: "Passage au nouveau formulaire",
  review_started: "Candidature en cours d'examen",
  interview_invited: "Invitation à un entretien",
  interview_scheduled: "Entretien réservé",
  interview_rescheduled: "Entretien déplacé",
  interview_cancelled: "Entretien annulé",
  interview_completed: "Entretien passé",
  clarification_requested: "Question de l'association",
  clarification_extended: "Délai de réponse prolongé",
  clarification_answered: "Réponse envoyée",
  clarification_cancelled: "Question retirée par l'association",
  decision_released: "Réponse de l'association",
  offer_accepted: "Proposition acceptée",
  offer_declined: "Proposition déclinée",
  offer_expired: "Proposition expirée",
  offer_withdrawn: "Proposition retirée par l'association",
};

/**
 * Retention as the BDE decided it (private.purge_recruitment_data applies
 * it every night), or that it is still to be decided: never a guess.
 */
export function retentionLines(p: Pick<RecruitmentPrivacy, "draft_months" | "withdrawn_months" | "submitted_months">): string[] {
  const months = (n: number) => (n > 1 ? `${n} mois` : "1 mois");
  return [
    p.submitted_months
      ? `Candidatures envoyées : effacées ${months(p.submitted_months)} après la clôture du recrutement.`
      : "Candidatures envoyées : durée de conservation pas encore fixée par le BDE.",
    p.withdrawn_months
      ? `Candidatures retirées : effacées ${months(p.withdrawn_months)} après le retrait.`
      : "Candidatures retirées : durée de conservation pas encore fixée par le BDE.",
    p.draft_months
      ? `Brouillons jamais envoyés : effacés ${months(p.draft_months)} après la clôture du recrutement.`
      : "Brouillons jamais envoyés : durée de conservation pas encore fixée par le BDE.",
  ];
}

/** Nothing is erased automatically until the BDE has decided every duration. */
export function retentionUndecided(p: Pick<RecruitmentPrivacy, "draft_months" | "withdrawn_months" | "submitted_months">): boolean {
  return !p.draft_months || !p.withdrawn_months || !p.submitted_months;
}

/** What a group of applications is called in the student's list. */
export type ApplicationFilter = "tous" | "brouillons" | "envoyees" | "retirees" | "closes";

export function matchesFilter(a: Pick<ApplicationItem, "status" | "campaign">, filter: ApplicationFilter): boolean {
  switch (filter) {
    case "brouillons":
      return a.status === "brouillon";
    case "envoyees":
      return a.status === "envoyee";
    case "retirees":
      return a.status === "retiree";
    case "closes":
      return isOver(a.campaign.status);
    default:
      return true;
  }
}

// ---- The directory's filters (URL) -----------------------------------------------------------------

/** public_recruitment_campaigns' views. */
export type CampaignView = "current" | "open" | "upcoming" | "closing_soon" | "closed" | "all";

export const VIEW_PARAM: Record<CampaignView, string> = {
  current: "en-cours",
  open: "ouverts",
  upcoming: "bientot",
  closing_soon: "derniere-semaine",
  closed: "clotures",
  all: "tous",
};

export const VIEW_LABEL: Record<CampaignView, string> = {
  current: "En cours",
  open: "Ouverts",
  upcoming: "Bientôt",
  closing_soon: "Ferment cette semaine",
  closed: "Clôturés",
  all: "Tous",
};

export interface RecruitmentFilters {
  view: CampaignView;
  /** Association slug. */
  association: string | null;
  /** "2026-2027". */
  year: string | null;
  q: string;
  /** Page offset (50 per page). */
  offset: number;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseRecruitmentFilters(sp: Record<string, string | string[] | undefined>): RecruitmentFilters {
  const v = first(sp.vue);
  const view = (Object.entries(VIEW_PARAM).find(([, p]) => p === v)?.[0] as CampaignView | undefined) ?? "current";
  const asso = first(sp.asso).trim().toLowerCase();
  const year = first(sp.annee).trim();
  const q = first(sp.q).replace(/\s+/g, " ").trim().slice(0, 80);
  const offset = Number.parseInt(first(sp.page), 10);
  return {
    view,
    association: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(asso) && asso.length <= 100 ? asso : null,
    year: /^20\d{2}-20\d{2}$/.test(year) ? year : null,
    q: q.length >= 2 ? q : "",
    offset: Number.isInteger(offset) && offset > 0 && offset <= 100 ? (offset - 1) * 50 : 0,
  };
}

export function isRefined(f: RecruitmentFilters): boolean {
  return f.view !== "current" || Boolean(f.association || f.year || f.q) || f.offset > 0;
}

/** The URL of these filters (default values left out). */
export function recruitmentParams(f: Partial<RecruitmentFilters>): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.view && f.view !== "current") out.vue = VIEW_PARAM[f.view];
  if (f.association) out.asso = f.association;
  if (f.year) out.annee = f.year;
  if (f.q) out.q = f.q;
  if (f.offset && f.offset > 0) out.page = String(Math.floor(f.offset / 50) + 1);
  return out;
}

export function recruitmentHref(f: Partial<RecruitmentFilters>, base = "/recruitment"): string {
  const qs = new URLSearchParams(recruitmentParams(f)).toString();
  return qs ? `${base}?${qs}` : base;
}
