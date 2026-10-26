"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { logDataError } from "@/lib/data/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { endOfParisDay } from "@/lib/governance/labels";
import { governanceErrorCode, governanceErrorMessage, type GovernanceErrorCode } from "@/lib/governance/messages";
import { parisLocalToInstant } from "@/lib/posts/schedule";
import { POWERS, RECOMMENDATIONS, type Power } from "@/lib/recruitment/review";
import type { GovernanceActionState } from "./governance";

/**
 * Actions of the review workspace (Phase 9) and of the candidate's answers
 * (a slot, a question, an offer). Each one forwards to a database function
 * (supabase/migrations/2026102611*) that identifies the caller, asks
 * private.application_can (or campaign_can) at that very moment, takes the
 * locks, writes in one transaction, records the step and queues the
 * messages. Ids and lists in forms are untrusted: the database refuses what
 * the person may not do, and bulk operations are checked row by row.
 */

export interface ReviewActionState extends GovernanceActionState {
  /** A review's new version after a save (the next save sends it). */
  version?: number;
  reviewId?: string;
  /** What a bulk action could not do, row by row (already worded). */
  skipped?: string[];
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type RpcResult = { data: unknown; error: { code?: string; message?: string; details?: string } | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const id = (form: FormData, name: string) => {
  const v = text(form, name).toLowerCase();
  return UUID.test(v) ? v : null;
};
const ids = (form: FormData, name: string) =>
  [...new Set(form.getAll(name).map((v) => String(v).trim().toLowerCase()))].filter((v) => UUID.test(v)).slice(0, 500);

function failure(code: GovernanceErrorCode, message?: string): ReviewActionState {
  return { status: "error", code, message: message ?? governanceErrorMessage(code), at: Date.now() };
}

async function call(
  where: string,
  rpc: (supabase: Supabase) => PromiseLike<RpcResult>,
): Promise<{ ok: true; data: unknown } | { ok: false; state: ReviewActionState }> {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return { ok: false, state: failure("not_authenticated") };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await rpc(supabase);
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError(where, { code: error.code ?? "", message: "" });
    return { ok: false, state: failure(code) };
  }
  // Workspace pages and the candidate's own pages read live data.
  revalidatePath("/manage", "layout");
  revalidatePath("/account", "layout");
  return { ok: true, data };
}

async function run(
  where: string,
  rpc: (supabase: Supabase) => PromiseLike<RpcResult>,
  done: string | ((data: unknown) => string),
): Promise<ReviewActionState> {
  const result = await call(where, rpc);
  if (!result.ok) return result.state;
  return { status: "done", message: typeof done === "string" ? done : done(result.data), at: Date.now() };
}

/** A date and an hour typed in Paris time, or null (empty), or "invalid". */
function parisField(form: FormData, prefix: string): string | null | "invalid" {
  const date = text(form, `${prefix}_date`);
  const time = text(form, `${prefix}_time`) || "18:00";
  if (!date) return null;
  const at = parisLocalToInstant(date, time);
  return at.ok ? at.iso : "invalid";
}

const SKIP_WORDS: Record<string, string> = {
  application_not_found: "pas dans ton périmètre",
  application_withdrawn: "retirée par la personne",
  decision_made: "décision déjà validée",
  interview_pending: "entretien en cours",
  already_invited: "déjà invitée",
  already_assigned: "déjà confiée à cette personne",
  conflict: "conflit d'intérêts déclaré",
  own_application: "sa propre candidature",
  out_of_scope: "hors des postes de cette personne",
  no_reviewer_available: "personne de disponible",
  decision_not_found: "pas dans ton périmètre",
  decision_not_finalized: "pas encore validée",
  already_released: "déjà annoncée",
};

function skippedLines(data: unknown): string[] {
  const list = ((data as { skipped?: { reason: string }[] })?.skipped ?? []).map((s) => SKIP_WORDS[s.reason] ?? s.reason);
  const counts = new Map<string, number>();
  for (const r of list) counts.set(r, (counts.get(r) ?? 0) + 1);
  return [...counts].map(([r, n]) => `${n} × ${r}`);
}

// ---- The committee --------------------------------------------------------------------------------

function powersOf(form: FormData): Power[] {
  const chosen = form.getAll("powers").map(String);
  return POWERS.filter((p) => chosen.includes(p) || p === "view");
}

function appointmentEnd(form: FormData): string | null {
  return endOfParisDay(text(form, "ends_on"));
}

export async function appointMember(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const campaignId = id(form, "campaign_id");
  const membershipId = id(form, "membership_id");
  if (!campaignId) return failure("campaign_not_found");
  if (!membershipId) return failure("member_not_active", "Choisis la personne à nommer.");
  const ends = appointmentEnd(form);
  if (!ends) return failure("invalid_period", "Choisis jusqu'à quand la nomination vaut.");
  const scope = text(form, "scope");
  return run(
    "appoint_recruitment_member",
    (s) =>
      s.rpc("appoint_recruitment_member", {
        p_campaign_id: campaignId,
        p_membership_id: membershipId,
        p_role: text(form, "role"),
        p_powers: powersOf(form),
        p_scope: scope,
        p_position_ids: scope === "positions" ? ids(form, "position_ids") : undefined,
        p_ends_at: ends,
        p_purpose: text(form, "purpose") || undefined,
      }),
    "Nomination enregistrée. La personne a été prévenue ; elle a accès tout de suite, dans les limites choisies.",
  );
}

export async function updateMember(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const memberId = id(form, "member_id");
  if (!memberId) return failure("committee_member_not_found");
  const ends = appointmentEnd(form);
  if (!ends) return failure("invalid_period", "Choisis jusqu'à quand la nomination vaut.");
  const scope = text(form, "scope");
  return run(
    "update_recruitment_member",
    (s) =>
      s.rpc("update_recruitment_member", {
        p_member_id: memberId,
        p_role: text(form, "role"),
        p_powers: powersOf(form),
        p_scope: scope,
        p_position_ids: scope === "positions" ? ids(form, "position_ids") : undefined,
        p_ends_at: ends,
      }),
    "Nomination modifiée. Elle s'applique dès la prochaine page ouverte.",
  );
}

export async function revokeMember(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const memberId = id(form, "member_id");
  if (!memberId) return failure("committee_member_not_found");
  return run(
    "revoke_recruitment_member",
    (s) => s.rpc("revoke_recruitment_member", { p_member_id: memberId, p_reason: text(form, "reason") || undefined }),
    "Nomination terminée : l'accès s'arrête dès maintenant. Ses candidatures à évaluer sont à redonner.",
  );
}

export async function setReviewPolicy(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const campaignId = id(form, "campaign_id");
  if (!campaignId) return failure("campaign_not_found");
  const required = Number(text(form, "required_reviews"));
  return run(
    "set_recruitment_review_policy",
    (s) =>
      s.rpc("set_recruitment_review_policy", {
        p_campaign_id: campaignId,
        p_required_reviews: Number.isInteger(required) ? required : -1,
        p_approval_policy: text(form, "approval_policy"),
      }),
    "Règles enregistrées.",
  );
}

export async function saveRubric(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const campaignId = id(form, "campaign_id");
  if (!campaignId) return failure("campaign_not_found");
  let criteria: unknown;
  try {
    criteria = JSON.parse(text(form, "criteria") || "[]");
  } catch {
    return failure("rubric_invalid");
  }
  const editVersion = Number(text(form, "edit_version"));
  const result = await call("save_recruitment_rubric", (s) =>
    s.rpc("save_recruitment_rubric", {
      p_campaign_id: campaignId,
      p_kind: text(form, "kind"),
      p_edit_version: Number.isInteger(editVersion) && editVersion > 0 ? editVersion : (null as unknown as number),
      p_criteria: criteria as never,
    }),
  );
  if (!result.ok) return result.state;
  const out = result.data as { edit_version: number };
  return { status: "done", message: "Brouillon de la grille enregistré.", version: out.edit_version, at: Date.now() };
}

export async function publishRubric(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const campaignId = id(form, "campaign_id");
  if (!campaignId) return failure("campaign_not_found");
  return run(
    "publish_recruitment_rubric",
    (s) => s.rpc("publish_recruitment_rubric", { p_campaign_id: campaignId, p_kind: text(form, "kind") }),
    (d) => {
      const r = d as { number: number; reviews_on_previous: number };
      return r.reviews_on_previous > 0
        ? `Grille version ${r.number} publiée. Les ${r.reviews_on_previous} évaluations déjà faites gardent l'ancienne version.`
        : `Grille version ${r.number} publiée : les évaluations se font maintenant avec elle.`;
    },
  );
}

export async function discardRubric(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const campaignId = id(form, "campaign_id");
  if (!campaignId) return failure("campaign_not_found");
  return run(
    "discard_recruitment_rubric_draft",
    (s) => s.rpc("discard_recruitment_rubric_draft", { p_campaign_id: campaignId, p_kind: text(form, "kind") }),
    "Brouillon de la grille abandonné.",
  );
}

export async function saveTemplate(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const campaignId = id(form, "campaign_id");
  if (!campaignId) return failure("campaign_not_found");
  return run(
    "save_recruitment_template",
    (s) => s.rpc("save_recruitment_template", { p_campaign_id: campaignId, p_kind: text(form, "kind"), p_body: text(form, "body") }),
    text(form, "body") ? "Message type enregistré." : "Message type retiré : le message standard sera utilisé.",
  );
}

export async function createTag(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const campaignId = id(form, "campaign_id");
  if (!campaignId) return failure("campaign_not_found");
  return run(
    "create_recruitment_tag",
    (s) => s.rpc("create_recruitment_tag", { p_campaign_id: campaignId, p_label: text(form, "label") }),
    "Étiquette ajoutée.",
  );
}

export async function deleteTag(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const tagId = id(form, "tag_id");
  if (!tagId) return failure("tag_not_found");
  return run("delete_recruitment_tag", (s) => s.rpc("delete_recruitment_tag", { p_tag_id: tagId }), "Étiquette supprimée.");
}

export async function resolveConflict(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const conflictId = id(form, "conflict_id");
  if (!conflictId) return failure("conflict_not_found");
  return run(
    "resolve_recruitment_conflict",
    (s) =>
      s.rpc("resolve_recruitment_conflict", {
        p_conflict_id: conflictId,
        p_resolution: text(form, "resolution"),
        p_reason: text(form, "reason"),
      }),
    text(form, "resolution") === "cleared"
      ? "Conflit levé : la personne retrouve l'accès à cette candidature."
      : "Noté : la personne reste à l'écart de cette candidature. Confie-la à quelqu'un d'autre.",
  );
}

// ---- Work distribution and the pipeline ------------------------------------------------------------

export async function assignReviews(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const campaignId = id(form, "campaign_id");
  if (!campaignId) return failure("campaign_not_found");
  const applications = ids(form, "application_ids");
  const members = ids(form, "member_ids");
  if (applications.length === 0) return failure("selection_invalid", "Coche au moins une candidature.");
  if (members.length === 0) return failure("selection_invalid", "Choisis au moins une personne du comité.");
  const result = await call("assign_recruitment_reviews", (s) =>
    s.rpc("assign_recruitment_reviews", {
      p_campaign_id: campaignId,
      p_application_ids: applications,
      p_member_ids: members,
      p_mode: text(form, "mode") === "balanced" ? "balanced" : "each",
    }),
  );
  if (!result.ok) return result.state;
  const n = (result.data as { assigned: number }).assigned;
  const skipped = skippedLines(result.data);
  return {
    status: "done",
    message: `${n} attribution${n > 1 ? "s" : ""} faite${n > 1 ? "s" : ""}.${skipped.length ? ` Pas fait : ${skipped.join(", ")}.` : ""}`,
    skipped,
    at: Date.now(),
  };
}

export async function unassignReview(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const assignmentId = id(form, "assignment_id");
  if (!assignmentId) return failure("selection_invalid");
  return run(
    "unassign_recruitment_review",
    (s) => s.rpc("unassign_recruitment_review", { p_assignment_id: assignmentId }),
    "Retirée de la liste de cette personne.",
  );
}

export async function moveApplications(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const applications = ids(form, "application_ids");
  if (applications.length === 0) return failure("selection_invalid", "Coche au moins une candidature.");
  const stage = text(form, "stage");
  const result = await call("move_recruitment_applications", (s) =>
    s.rpc("move_recruitment_applications", { p_application_ids: applications, p_stage: stage }),
  );
  if (!result.ok) return result.state;
  const n = (result.data as { moved: number }).moved;
  const skipped = skippedLines(result.data);
  const where = stage === "shortlisted" ? "présélectionnée" : "en examen";
  return {
    status: "done",
    message: `${n} candidature${n > 1 ? "s" : ""} ${where}${n > 1 ? "s" : ""}.${skipped.length ? ` Pas fait : ${skipped.join(", ")}.` : ""}`,
    skipped,
    at: Date.now(),
  };
}

// ---- Reviews ----------------------------------------------------------------------------------------

function scoresOf(form: FormData): Record<string, number> | null {
  try {
    const raw = JSON.parse(text(form, "scores") || "{}") as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (!/^[a-z0-9_]{1,40}$/.test(k)) continue;
      if (typeof v === "number" && Number.isInteger(v)) out[k] = v;
    }
    return out;
  } catch {
    return null;
  }
}

/** Save one's draft; with intent=submit, submit it right after (the draft stays if submitting is refused). */
export async function saveReview(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const applicationId = id(form, "application_id");
  if (!applicationId) return failure("application_not_found");
  const scores = scoresOf(form);
  if (!scores) return failure("score_invalid");
  const recommendation = text(form, "recommendation");
  if (recommendation && !RECOMMENDATIONS.includes(recommendation as never)) return failure("recommendation_invalid");
  const version = Number(text(form, "version"));
  const saved = await call("save_recruitment_review", (s) =>
    s.rpc("save_recruitment_review", {
      p_application_id: applicationId,
      p_interview_id: id(form, "interview_id") ?? undefined,
      p_scores: scores,
      p_recommendation: recommendation || undefined,
      p_note: text(form, "note") || undefined,
      p_version: Number.isInteger(version) && version > 0 ? version : undefined,
    }),
  );
  if (!saved.ok) return saved.state;
  const review = saved.data as { id: string; version: number };
  if (text(form, "intent") !== "submit") {
    return { status: "done", message: "Brouillon enregistré. Personne d'autre ne le voit.", version: review.version, reviewId: review.id, at: Date.now() };
  }
  const submitted = await call("submit_recruitment_review", (s) =>
    s.rpc("submit_recruitment_review", { p_review_id: review.id, p_version: review.version }),
  );
  if (!submitted.ok) return { ...submitted.state, version: review.version, reviewId: review.id };
  return { status: "done", message: "Évaluation soumise. Elle ne change plus que par une correction motivée.", reviewId: review.id, at: Date.now() };
}

export async function amendReview(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const reviewId = id(form, "review_id");
  if (!reviewId) return failure("review_not_found");
  const scores = scoresOf(form);
  if (!scores) return failure("score_invalid");
  return run(
    "amend_recruitment_review",
    (s) =>
      s.rpc("amend_recruitment_review", {
        p_review_id: reviewId,
        p_scores: scores,
        p_recommendation: text(form, "recommendation"),
        p_note: text(form, "note"),
        p_reason: text(form, "reason"),
      }),
    "Correction enregistrée. La version précédente reste dans l'historique de l'évaluation.",
  );
}

export async function deleteReviewDraft(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const reviewId = id(form, "review_id");
  if (!reviewId) return failure("review_not_found");
  return run("delete_recruitment_review_draft", (s) => s.rpc("delete_recruitment_review_draft", { p_review_id: reviewId }), "Brouillon supprimé.");
}

export async function declareConflict(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const applicationId = id(form, "application_id");
  if (!applicationId) return failure("application_not_found");
  return run(
    "declare_recruitment_conflict",
    (s) => s.rpc("declare_recruitment_conflict", { p_application_id: applicationId, p_note: text(form, "note") || undefined }),
    "Conflit déclaré. Tu ne vois plus cette candidature ; la personne qui compose le comité la confiera à quelqu'un d'autre.",
  );
}

export async function setApplicationTag(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const applicationId = id(form, "application_id");
  const tagId = id(form, "tag_id");
  if (!applicationId || !tagId) return failure("tag_not_found");
  const on = text(form, "on") === "1";
  return run(
    "set_application_tag",
    (s) => s.rpc("set_application_tag", { p_application_id: applicationId, p_tag_id: tagId, p_on: on }),
    on ? "Étiquette posée." : "Étiquette retirée.",
  );
}

export async function postComment(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const applicationId = id(form, "application_id");
  if (!applicationId) return failure("application_not_found");
  const mentions = ids(form, "mentions").slice(0, 10);
  return run(
    "post_application_comment",
    (s) =>
      s.rpc("post_application_comment", {
        p_application_id: applicationId,
        p_body: text(form, "body"),
        p_mentions: mentions.length ? mentions : undefined,
      }),
    mentions.length ? "Message publié ; les personnes mentionnées sont prévenues." : "Message publié.",
  );
}

export async function retractComment(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const commentId = id(form, "comment_id");
  if (!commentId) return failure("comment_not_found");
  return run("retract_application_comment", (s) => s.rpc("retract_application_comment", { p_comment_id: commentId }), "Message retiré.");
}

// ---- Questions to the candidate ---------------------------------------------------------------------

export async function requestClarification(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const applicationId = id(form, "application_id");
  if (!applicationId) return failure("application_not_found");
  const due = parisField(form, "due");
  if (due === "invalid") return failure("invalid_period", "La date limite n'est pas valide.");
  return run(
    "request_clarification",
    (s) =>
      s.rpc("request_clarification", {
        p_application_id: applicationId,
        p_question: text(form, "question"),
        p_due_at: due ?? undefined,
        p_allows_documents: text(form, "allows_documents") === "1",
      }),
    "Question envoyée. La personne est prévenue et répond depuis son espace.",
  );
}

export async function extendClarification(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const clarificationId = id(form, "clarification_id");
  if (!clarificationId) return failure("clarification_not_found");
  const due = parisField(form, "due");
  if (!due || due === "invalid") return failure("invalid_period", "Choisis la nouvelle date limite.");
  return run(
    "extend_clarification",
    (s) => s.rpc("extend_clarification", { p_clarification_id: clarificationId, p_due_at: due, p_reason: text(form, "reason") || undefined }),
    "Délai prolongé. La personne est prévenue ; l'ancienne date reste dans l'historique.",
  );
}

export async function cancelClarification(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const clarificationId = id(form, "clarification_id");
  if (!clarificationId) return failure("clarification_not_found");
  return run(
    "cancel_clarification",
    (s) => s.rpc("cancel_clarification", { p_clarification_id: clarificationId, p_reason: text(form, "reason") || undefined }),
    "Question retirée.",
  );
}

// ---- Interviews ----------------------------------------------------------------------------------------

export async function createSlots(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const campaignId = id(form, "campaign_id");
  if (!campaignId) return failure("campaign_not_found");
  const date = text(form, "date");
  const times = text(form, "times")
    .split(/[\s,;]+/)
    .map((t) => t.replace("h", ":").replace(/^(\d):/, "0$1:"))
    .map((t) => (/^\d{2}$/.test(t) ? `${t}:00` : t))
    .filter(Boolean);
  if (!date || times.length === 0) return failure("slot_invalid", "Choisis un jour et au moins une heure de début (14:00, 14:30…).");
  const starts: string[] = [];
  for (const t of times.slice(0, 60)) {
    const at = parisLocalToInstant(date, t);
    if (!at.ok) return failure("slot_invalid", `L'heure « ${t} » n'est pas valide (format 14:30).`);
    starts.push(at.iso);
  }
  const result = await call("create_interview_slots", (s) =>
    s.rpc("create_interview_slots", {
      p_campaign_id: campaignId,
      p_position_id: id(form, "position_id") ?? (null as unknown as string),
      p_starts: starts,
      p_minutes: Number(text(form, "minutes")) || 30,
      p_mode: text(form, "mode"),
      p_location: text(form, "location") || undefined,
      p_meeting_link: text(form, "meeting_link") || undefined,
      p_instructions: text(form, "instructions") || undefined,
      p_member_ids: ids(form, "member_ids"),
    }),
  );
  if (!result.ok) return result.state;
  const out = result.data as { created: string[]; skipped: { reason: string }[] };
  const busy = out.skipped.filter((x) => x.reason === "interviewer_busy").length;
  const past = out.skipped.filter((x) => x.reason === "slot_in_past").length;
  const notes = [busy ? `${busy} non créé${busy > 1 ? "s" : ""} (une personne fait déjà passer un entretien à ce moment)` : "", past ? `${past} dans le passé` : ""]
    .filter(Boolean)
    .join(", ");
  return {
    status: out.created.length > 0 ? "done" : "error",
    code: out.created.length > 0 ? undefined : "slot_invalid",
    message: `${out.created.length} créneau${out.created.length > 1 ? "x" : ""} ouvert${out.created.length > 1 ? "s" : ""}.${notes ? ` ${notes}.` : ""}`,
    at: Date.now(),
  };
}

export async function updateSlot(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const slotId = id(form, "slot_id");
  if (!slotId) return failure("slot_not_found");
  return run(
    "update_interview_slot",
    (s) =>
      s.rpc("update_interview_slot", {
        p_slot_id: slotId,
        p_location: text(form, "location"),
        p_meeting_link: text(form, "meeting_link"),
        p_instructions: text(form, "instructions"),
        p_member_ids: ids(form, "member_ids"),
      }),
    "Créneau modifié. Si quelqu'un l'a réservé, la personne est prévenue.",
  );
}

export async function cancelSlot(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const slotId = id(form, "slot_id");
  if (!slotId) return failure("slot_not_found");
  return run(
    "cancel_interview_slot",
    (s) => s.rpc("cancel_interview_slot", { p_slot_id: slotId, p_reason: text(form, "reason") || undefined }),
    "Créneau annulé. Si quelqu'un l'avait réservé, la personne est prévenue et rechoisit un créneau.",
  );
}

export async function inviteToInterview(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const applications = ids(form, "application_ids");
  if (applications.length === 0) return failure("selection_invalid", "Coche au moins une candidature.");
  const respondBy = parisField(form, "respond_by");
  if (respondBy === "invalid") return failure("invalid_period", "La date de réponse n'est pas valide.");
  const result = await call("invite_to_interview", (s) =>
    s.rpc("invite_to_interview", {
      p_application_ids: applications,
      p_message: text(form, "message") || undefined,
      p_respond_by: respondBy ?? undefined,
    }),
  );
  if (!result.ok) return result.state;
  const n = (result.data as { invited: number }).invited;
  const skipped = skippedLines(result.data);
  return {
    status: n > 0 ? "done" : "error",
    code: n > 0 ? undefined : "selection_invalid",
    message: `${n} invitation${n > 1 ? "s" : ""} envoyée${n > 1 ? "s" : ""}.${skipped.length ? ` Pas fait : ${skipped.join(", ")}.` : ""}`,
    skipped,
    at: Date.now(),
  };
}

export async function rescheduleInterview(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const interviewId = id(form, "interview_id");
  if (!interviewId) return failure("interview_not_found");
  const slotId = id(form, "slot_id");
  return run(
    "reschedule_interview",
    (s) =>
      s.rpc("reschedule_interview", {
        p_interview_id: interviewId,
        p_slot_id: slotId ?? (null as unknown as string),
        p_reason: text(form, "reason") || undefined,
      }),
    slotId ? "Entretien déplacé. La personne est prévenue." : "Créneau libéré : la personne est prévenue et en choisit un autre.",
  );
}

export async function cancelInterview(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const interviewId = id(form, "interview_id");
  if (!interviewId) return failure("interview_not_found");
  return run(
    "cancel_interview",
    (s) => s.rpc("cancel_interview", { p_interview_id: interviewId, p_reason: text(form, "reason") }),
    "Entretien annulé. La personne est prévenue.",
  );
}

export async function completeInterview(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const interviewId = id(form, "interview_id");
  if (!interviewId) return failure("interview_not_found");
  const outcome = text(form, "outcome") === "no_show" ? "no_show" : "completed";
  return run(
    "complete_interview",
    (s) => s.rpc("complete_interview", { p_interview_id: interviewId, p_outcome: outcome }),
    outcome === "completed" ? "Entretien noté comme passé." : "Absence notée.",
  );
}

// ---- Decisions and offers --------------------------------------------------------------------------

export async function proposeDecision(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const applicationId = id(form, "application_id");
  if (!applicationId) return failure("application_not_found");
  return run(
    "propose_recruitment_decision",
    (s) =>
      s.rpc("propose_recruitment_decision", {
        p_application_id: applicationId,
        p_outcome: text(form, "outcome"),
        p_rationale: text(form, "rationale") || undefined,
        p_message: text(form, "message") || undefined,
      }),
    "Décision proposée. Elle attend sa validation ; la personne n'en sait rien tant qu'elle n'est pas annoncée.",
  );
}

export async function approveDecision(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const decisionId = id(form, "decision_id");
  if (!decisionId) return failure("decision_not_found");
  return run(
    "approve_recruitment_decision",
    (s) =>
      s.rpc("approve_recruitment_decision", {
        p_decision_id: decisionId,
        p_reviews_override_reason: text(form, "reviews_reason") || undefined,
        p_capacity_override_reason: text(form, "capacity_reason") || undefined,
      }),
    (d) => {
      const r = d as { status: string; already: boolean };
      if (r.status === "finalized") return "Décision validée. Elle reste interne jusqu'à son annonce.";
      return r.already ? "Tu avais déjà approuvé cette décision." : "Approbation enregistrée. Il manque encore une validation, selon les règles du recrutement.";
    },
  );
}

export async function returnDecision(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const decisionId = id(form, "decision_id");
  if (!decisionId) return failure("decision_not_found");
  return run(
    "return_recruitment_decision",
    (s) => s.rpc("return_recruitment_decision", { p_decision_id: decisionId, p_reason: text(form, "reason") }),
    "Décision renvoyée, avec ta raison. Une nouvelle proposition peut suivre.",
  );
}

export async function cancelDecision(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const decisionId = id(form, "decision_id");
  if (!decisionId) return failure("decision_not_found");
  return run(
    "cancel_recruitment_decision",
    (s) => s.rpc("cancel_recruitment_decision", { p_decision_id: decisionId, p_reason: text(form, "reason") }),
    "Décision annulée. Elle reste dans l'historique.",
  );
}

export async function setDecisionMessage(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const decisionId = id(form, "decision_id");
  if (!decisionId) return failure("decision_not_found");
  return run(
    "set_recruitment_decision_message",
    (s) => s.rpc("set_recruitment_decision_message", { p_decision_id: decisionId, p_message: text(form, "message") }),
    "Message enregistré : il partira avec la décision.",
  );
}

export async function releaseDecisions(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const decisions = ids(form, "decision_ids");
  if (decisions.length === 0) return failure("selection_invalid", "Coche au moins une décision validée.");
  const expires = parisField(form, "expires");
  const at = parisField(form, "at");
  if (expires === "invalid" || at === "invalid") return failure("invalid_period", "Une date n'est pas valide.");
  const result = await call("release_recruitment_decisions", (s) =>
    s.rpc("release_recruitment_decisions", {
      p_decision_ids: decisions,
      p_offer_expires_at: expires ?? undefined,
      p_at: at ?? undefined,
    }),
  );
  if (!result.ok) return result.state;
  const r = result.data as { released: number; scheduled: number };
  const skipped = skippedLines(result.data);
  const head = r.scheduled > 0
    ? `${r.scheduled} annonce${r.scheduled > 1 ? "s" : ""} programmée${r.scheduled > 1 ? "s" : ""}.`
    : `${r.released} décision${r.released > 1 ? "s" : ""} annoncée${r.released > 1 ? "s" : ""} : les personnes sont prévenues.`;
  return { status: r.released + r.scheduled > 0 ? "done" : "error", code: r.released + r.scheduled > 0 ? undefined : "selection_invalid",
    message: `${head}${skipped.length ? ` Pas fait : ${skipped.join(", ")}.` : ""}`, skipped, at: Date.now() };
}

export async function cancelScheduledRelease(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const decisionId = id(form, "decision_id");
  if (!decisionId) return failure("decision_not_found");
  return run(
    "cancel_scheduled_release",
    (s) => s.rpc("cancel_scheduled_release", { p_decision_id: decisionId }),
    "Annonce déprogrammée : la décision reste validée, à annoncer plus tard.",
  );
}

export async function orderWaitlist(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const campaignId = id(form, "campaign_id");
  if (!campaignId) return failure("campaign_not_found");
  // Either the ids in order, or a rank typed next to each one (rank_<id>).
  const ranked = [...form.entries()]
    .filter(([k]) => k.startsWith("rank_") && UUID.test(k.slice(5).toLowerCase()))
    .map(([k, v]) => ({ id: k.slice(5).toLowerCase(), rank: Number(v) }));
  if (ranked.some((r) => !Number.isInteger(r.rank) || r.rank < 1)) return failure("selection_invalid", "Un rang est un nombre entier à partir de 1.");
  const ordered = ranked.length
    ? ranked.sort((a, b) => a.rank - b.rank).map((r) => r.id)
    : form.getAll("decision_ids").map((v) => String(v).toLowerCase()).filter((v) => UUID.test(v));
  return run(
    "order_recruitment_waitlist",
    (s) => s.rpc("order_recruitment_waitlist", { p_campaign_id: campaignId, p_decision_ids: ordered }),
    "Ordre de la liste d'attente enregistré.",
  );
}

export async function withdrawOffer(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const offerId = id(form, "offer_id");
  if (!offerId) return failure("offer_not_found");
  return run(
    "withdraw_recruitment_offer",
    (s) => s.rpc("withdraw_recruitment_offer", { p_offer_id: offerId, p_reason: text(form, "reason") }),
    "Proposition retirée. La personne est prévenue.",
  );
}

export async function startOnboarding(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const offerId = id(form, "offer_id");
  if (!offerId) return failure("offer_not_found");
  const positionId = id(form, "position_id");
  const ends = positionId ? endOfParisDay(text(form, "ends_on")) : null;
  if (positionId && !ends) return failure("invalid_period", "Choisis la fin du mandat de ce poste.");
  return run(
    "start_recruitment_onboarding",
    (s) =>
      s.rpc("start_recruitment_onboarding", {
        p_offer_id: offerId,
        p_position_id: positionId ?? undefined,
        p_mandate_ends_at: ends ?? undefined,
      }),
    "Invitation envoyée. La personne doit l'accepter pour rejoindre l'équipe ; elle ne reçoit aucun droit avant.",
  );
}

// ---- The candidate's answers ---------------------------------------------------------------------------

export async function bookSlot(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const interviewId = id(form, "interview_id");
  const slotId = id(form, "slot_id");
  if (!interviewId) return failure("interview_not_found");
  if (!slotId) return failure("slot_unavailable", "Choisis un créneau.");
  return run(
    "book_interview_slot",
    (s) => s.rpc("book_interview_slot", { p_interview_id: interviewId, p_slot_id: slotId }),
    "C'est réservé. Les détails de l'entretien sont juste au-dessus ; une confirmation est dans tes notifications.",
  );
}

export async function answerClarification(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const clarificationId = id(form, "clarification_id");
  if (!clarificationId) return failure("clarification_not_found");
  return run(
    "answer_clarification",
    (s) => s.rpc("answer_clarification", { p_clarification_id: clarificationId, p_answer: text(form, "answer") }),
    "Réponse envoyée à l'association. Ta candidature d'origine, elle, ne change pas.",
  );
}

export async function removeClarificationDocument(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const documentId = id(form, "document_id");
  if (!documentId) return failure("document_not_found");
  return run(
    "remove_clarification_document",
    (s) => s.rpc("remove_clarification_document", { p_document_id: documentId }),
    "Fichier retiré.",
  );
}

export async function respondToOffer(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const offerId = id(form, "offer_id");
  if (!offerId) return failure("offer_not_found");
  const accept = text(form, "accept") === "1";
  return run(
    "respond_to_recruitment_offer",
    (s) => s.rpc("respond_to_recruitment_offer", { p_offer_id: offerId, p_accept: accept, p_note: text(form, "note") || undefined }),
    accept
      ? "Tu as accepté. L'association est prévenue ; elle t'enverra l'invitation pour rejoindre son équipe."
      : "Tu as décliné. L'association est prévenue. Merci de lui avoir répondu.",
  );
}

// ---- Data rights (the privacy officer) --------------------------------------------------------------

export interface PrivacyReportState extends GovernanceActionState {
  report?: unknown;
  email?: string;
}

export async function privacyReport(_prev: PrivacyReportState, form: FormData): Promise<PrivacyReportState> {
  const email = text(form, "email").toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return failure("user_not_found", "Indique l'adresse e-mail de la personne.");
  const result = await call("privacy_candidate_report", (s) =>
    s.rpc("privacy_candidate_report", { p_email: email, p_reason: text(form, "reason") }),
  );
  if (!result.ok) return result.state;
  return { status: "done", message: "Rapport compilé (et noté dans l'historique).", report: result.data, email, at: Date.now() };
}

export async function privacyErase(_prev: ReviewActionState, form: FormData): Promise<ReviewActionState> {
  const applicationId = id(form, "application_id");
  if (!applicationId) return failure("application_not_found");
  if (text(form, "confirm") !== "EFFACER") return failure("reason_required", "Tape EFFACER pour confirmer : l'effacement est définitif.");
  return run(
    "privacy_erase_application",
    (s) => s.rpc("privacy_erase_application", { p_application_id: applicationId, p_reason: text(form, "reason") }),
    "Candidature effacée, avec tout ce qui la concernait ; ses fichiers partent au prochain passage du nettoyage.",
  );
}
