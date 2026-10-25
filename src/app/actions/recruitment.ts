"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { getAuthContext } from "@/lib/auth/context";
import { withNext } from "@/lib/auth/next-path";
import { logDataError } from "@/lib/data/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { governanceErrorCode, governanceErrorMessage, type GovernanceErrorCode } from "@/lib/governance/messages";
import { parseCampaignStep, parsePosition, type CampaignStep, type FieldErrors, type Fields } from "@/lib/recruitment/input";
import { formProblem, type FormSchema } from "@/lib/recruitment/form";
import type { AnswerError } from "@/lib/recruitment/form";
import type { GovernanceActionState } from "./governance";

/**
 * Actions of recruitment (Phase 8): the association's desk and campaign
 * wizard (campaigns, positions, the versioned form, publication), the BDE's
 * moderation and privacy settings, and the candidate's own application.
 * Each one forwards to a database function (supabase/migrations/20261026090*)
 * that identifies the caller, checks the right in the campaign's own
 * association (or the candidate's ownership), takes the locks, writes in one
 * transaction and audits. Ids in forms are untrusted: the database refuses
 * what the person may not do. Documents go through the upload route.
 */

export interface RecruitmentActionState extends GovernanceActionState {
  fieldErrors?: FieldErrors;
  /** The campaign's new version after a save (the next save must send it). */
  version?: number;
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type RpcResult = { data: unknown; error: { code?: string; message?: string; details?: string } | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const STEPS: CampaignStep[] = ["infos", "deroule", "regles"];
/** Where "save and continue" may lead (the wizard's steps). */
const NEXT_STEPS = ["infos", "deroule", "postes", "formulaire", "regles", "apercu", "publication"];

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const optional = (form: FormData, name: string) => text(form, name) || undefined;
const id = (form: FormData, name: string) => {
  const v = text(form, name);
  return UUID.test(v) ? v : null;
};

function failure(code: GovernanceErrorCode, message?: string): GovernanceActionState {
  return { status: "error", code, message: message ?? governanceErrorMessage(code), at: Date.now() };
}

async function call(
  where: string,
  rpc: (supabase: Supabase) => PromiseLike<RpcResult>,
): Promise<{ ok: true; data: unknown } | { ok: false; state: GovernanceActionState }> {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return { ok: false, state: failure("not_authenticated") };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await rpc(supabase);
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError(where, { code: error.code ?? "", message: "" });
    return { ok: false, state: failure(code) };
  }
  // The directory, campaign pages, association pages, the home page and the
  // student's own pages all read live data: render fresh.
  revalidatePath("/", "layout");
  return { ok: true, data };
}

async function run(
  where: string,
  rpc: (supabase: Supabase) => PromiseLike<RpcResult>,
  done: string | ((data: unknown) => string),
): Promise<GovernanceActionState> {
  const result = await call(where, rpc);
  if (!result.ok) return result.state;
  return { status: "done", message: typeof done === "string" ? done : done(result.data), at: Date.now() };
}

function fieldsOf(form: FormData): Fields {
  const out: Fields = {};
  const lists = new Set(["step_label", "step_detail", "step_date", "faq_question", "faq_answer", "eligible_years"]);
  for (const key of new Set(form.keys())) {
    const values = form.getAll(key).map(String);
    out[key] = values.length > 1 || lists.has(key) ? values : values[0];
  }
  return out;
}

/** Back to a step of the wizard with a confirmation (?fait=…: the form that acted may disappear). */
function backTo(form: FormData, step: string, done: string): void {
  const campaignId = id(form, "campaign_id");
  const asso = text(form, "organization_slug");
  if (campaignId && SLUG.test(asso)) redirect(`${routes.manageCampaign(asso, campaignId, step)}&fait=${done}`);
}

// ---- The desk ------------------------------------------------------------------------------------

/** Starts a campaign (a draft with its title and an empty form), then opens the wizard. */
export async function createCampaign(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const organizationId = id(form, "organization_id");
  const asso = text(form, "organization_slug");
  if (!organizationId || !SLUG.test(asso)) return failure("organization_not_found");
  const title = text(form, "title").replace(/\s+/g, " ").slice(0, 120);
  if (title.length < 3) return failure("campaign_invalid", "Donne un titre d'au moins 3 caractères (« Recrutement 2027 »…).");
  const result = await call("create_recruitment_campaign", (s) =>
    s.rpc("create_recruitment_campaign", { p_organization_id: organizationId, p_title: title }),
  );
  if (!result.ok) return result.state;
  redirect(routes.manageCampaign(asso, String(result.data), "infos"));
}

/** Next year's campaign from this one: positions and the live form, no date, no application. */
export async function duplicateCampaign(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const campaignId = id(form, "campaign_id");
  const asso = text(form, "organization_slug");
  if (!campaignId || !SLUG.test(asso)) return failure("campaign_not_found");
  const title = text(form, "title").replace(/\s+/g, " ").slice(0, 120);
  if (title.length < 3) return failure("campaign_invalid", "Donne un titre d'au moins 3 caractères à la copie.");
  const result = await call("duplicate_recruitment_campaign", (s) =>
    s.rpc("duplicate_recruitment_campaign", { p_campaign_id: campaignId, p_title: title }),
  );
  if (!result.ok) return result.state;
  redirect(`${routes.manageCampaign(asso, String(result.data), "infos")}&fait=duplique`);
}

// ---- The wizard ------------------------------------------------------------------------------------

/** Saves one step (infos, déroulé, règles). The version guards against a teammate's newer save. */
export async function saveCampaignStep(_prev: RecruitmentActionState, form: FormData): Promise<RecruitmentActionState> {
  const campaignId = id(form, "campaign_id");
  const asso = text(form, "organization_slug");
  const step = text(form, "step") as CampaignStep;
  const version = Number.parseInt(text(form, "version"), 10);
  if (!campaignId || !SLUG.test(asso) || !STEPS.includes(step) || !Number.isInteger(version)) return failure("campaign_not_found");
  const parsed = parseCampaignStep(step, fieldsOf(form));
  if (!parsed.ok) {
    return {
      status: "error",
      code: "campaign_invalid",
      message: "Certains champs sont à corriger (voir ci-dessous).",
      fieldErrors: parsed.errors,
      at: Date.now(),
    };
  }
  const result = await call("save_recruitment_campaign", (s) =>
    s.rpc("save_recruitment_campaign", { p_campaign_id: campaignId, p_version: version, p_patch: parsed.patch as never }),
  );
  if (!result.ok) return result.state;
  const saved = result.data as { version: number };
  const next = text(form, "next");
  if (NEXT_STEPS.includes(next)) redirect(routes.manageCampaign(asso, campaignId, next));
  return { status: "done", message: "Enregistré.", version: saved.version, at: Date.now() };
}

export async function addPosition(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const campaignId = id(form, "campaign_id");
  const title = text(form, "title").replace(/\s+/g, " ").slice(0, 80);
  if (!campaignId) return failure("campaign_not_found");
  if (!title) return failure("position_invalid", "Donne un intitulé au poste (« Trésorerie », « Communication »…).");
  const result = await call("add_recruitment_position", (s) => s.rpc("add_recruitment_position", { p_campaign_id: campaignId, p_title: title }));
  if (!result.ok) return result.state;
  backTo(form, "postes", `poste-ajoute&poste=${String(result.data)}`);
  return { status: "done", message: "Poste ajouté.", at: Date.now() };
}

export async function savePosition(_prev: RecruitmentActionState, form: FormData): Promise<RecruitmentActionState> {
  const positionId = id(form, "position_id");
  if (!positionId) return failure("position_not_found");
  const parsed = parsePosition(fieldsOf(form), {
    opensAt: optional(form, "campaign_opens_at") ?? null,
    closesAt: optional(form, "campaign_closes_at") ?? null,
  });
  if (!parsed.ok) {
    return {
      status: "error",
      code: "position_invalid",
      message: "Certains champs du poste sont à corriger (voir ci-dessous).",
      fieldErrors: parsed.errors,
      at: Date.now(),
    };
  }
  return run(
    "save_recruitment_position",
    (s) => s.rpc("save_recruitment_position", { p_position_id: positionId, p_patch: parsed.patch as never }),
    "Poste enregistré.",
  );
}

export async function movePosition(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const positionId = id(form, "position_id");
  const direction = text(form, "direction") === "up" ? -1 : 1;
  if (!positionId) return failure("position_not_found");
  return run(
    "move_recruitment_position",
    (s) => s.rpc("move_recruitment_position", { p_position_id: positionId, p_direction: direction }),
    direction < 0 ? "Poste monté d'un cran." : "Poste descendu d'un cran.",
  );
}

/** Deletes a position nobody applied to; one with applications is closed (retired) instead. */
export async function removePosition(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const positionId = id(form, "position_id");
  if (!positionId) return failure("position_not_found");
  const result = await call("remove_recruitment_position", (s) => s.rpc("remove_recruitment_position", { p_position_id: positionId }));
  if (!result.ok) return result.state;
  backTo(form, "postes", result.data === "retired" ? "poste-ferme" : "poste-supprime");
  return { status: "done", message: "", at: Date.now() };
}

export type FormSaveResult =
  | { ok: true; editVersion: number; savedAt: number }
  | { ok: false; code: GovernanceErrorCode; message: string };

/**
 * Saves the draft form from the builder (called directly, not as a form
 * action). The builder sends the edit version it loaded: a teammate's newer
 * save is never overwritten (draft_conflict). The published version never
 * changes: everything goes to the draft until "Publier cette version".
 */
export async function saveRecruitmentForm(campaignId: string, editVersion: number, schema: FormSchema, positionIds: string[]): Promise<FormSaveResult> {
  if (!UUID.test(campaignId) || !Number.isInteger(editVersion)) return { ok: false, code: "campaign_not_found", message: governanceErrorMessage("campaign_not_found") };
  const problem = formProblem(schema, positionIds.filter((p) => UUID.test(p)));
  if (problem) return { ok: false, code: "form_invalid", message: problem };
  const result = await call("save_recruitment_form", (s) =>
    s.rpc("save_recruitment_form", { p_campaign_id: campaignId, p_edit_version: editVersion, p_schema: schema as never }),
  );
  if (!result.ok) return { ok: false, code: result.state.code ?? "unexpected", message: result.state.message ?? "" };
  const saved = result.data as { edit_version: number };
  return { ok: true, editVersion: saved.edit_version, savedAt: Date.now() };
}

export async function discardFormDraft(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const campaignId = id(form, "campaign_id");
  if (!campaignId) return failure("campaign_not_found");
  const result = await call("discard_recruitment_form_draft", (s) => s.rpc("discard_recruitment_form_draft", { p_campaign_id: campaignId }));
  if (!result.ok) return result.state;
  backTo(form, "formulaire", "brouillon-abandonne");
  return { status: "done", message: "", at: Date.now() };
}

/** Publishes the draft form as the next version (second factor). Candidates with a draft are told. */
export async function publishForm(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const campaignId = id(form, "campaign_id");
  if (!campaignId) return failure("campaign_not_found");
  const result = await call("publish_recruitment_form", (s) => s.rpc("publish_recruitment_form", { p_campaign_id: campaignId }));
  if (!result.ok) return result.state;
  const r = result.data as { number: number };
  backTo(form, "formulaire", `version-${r.number}`);
  return { status: "done", message: "", at: Date.now() };
}

// ---- Publication -----------------------------------------------------------------------------------

export async function publishCampaign(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const campaignId = id(form, "campaign_id");
  if (!campaignId) return failure("campaign_not_found");
  const result = await call("publish_recruitment_campaign", (s) => s.rpc("publish_recruitment_campaign", { p_campaign_id: campaignId }));
  if (!result.ok) return result.state;
  backTo(form, "publication", "publie");
  return { status: "done", message: "", at: Date.now() };
}

export async function unpublishCampaign(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const campaignId = id(form, "campaign_id");
  if (!campaignId) return failure("campaign_not_found");
  const result = await call("unpublish_recruitment_campaign", (s) =>
    s.rpc("unpublish_recruitment_campaign", { p_campaign_id: campaignId, p_reason: optional(form, "reason") }),
  );
  if (!result.ok) return result.state;
  backTo(form, "publication", "retire");
  return { status: "done", message: "", at: Date.now() };
}

/** Pause, close now, or resume (scheduled: the dates decide again). */
export async function setCampaignStatus(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const campaignId = id(form, "campaign_id");
  const status = text(form, "status");
  if (!campaignId || !["scheduled", "paused", "closed"].includes(status)) return failure("campaign_not_found");
  const result = await call("set_recruitment_status", (s) => s.rpc("set_recruitment_status", { p_campaign_id: campaignId, p_status: status }));
  if (!result.ok) return result.state;
  backTo(form, "publication", status === "paused" ? "pause" : status === "closed" ? "cloture" : "reprise");
  return { status: "done", message: "", at: Date.now() };
}

/** Cancels for good (second factor, a reason the candidates read); applications are kept. */
export async function cancelCampaign(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const campaignId = id(form, "campaign_id");
  if (!campaignId) return failure("campaign_not_found");
  const result = await call("cancel_recruitment_campaign", (s) =>
    s.rpc("cancel_recruitment_campaign", { p_campaign_id: campaignId, p_reason: text(form, "reason") }),
  );
  if (!result.ok) return result.state;
  const told = Math.max(0, Number(result.data) || 0);
  backTo(form, "publication", `annule-${told}`);
  return { status: "done", message: "", at: Date.now() };
}

export async function archiveCampaign(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const campaignId = id(form, "campaign_id");
  const archived = text(form, "archived") === "1";
  if (!campaignId) return failure("campaign_not_found");
  return run(
    "archive_recruitment_campaign",
    (s) => s.rpc("archive_recruitment_campaign", { p_campaign_id: campaignId, p_archived: archived }),
    archived ? "Archivé : il quitte la liste des recrutements en cours, sa page reste lisible." : "Sorti des archives.",
  );
}

/** Deletes a campaign that was never online, then back to the desk. */
export async function deleteCampaignDraft(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const campaignId = id(form, "campaign_id");
  const asso = text(form, "organization_slug");
  if (!campaignId || !SLUG.test(asso)) return failure("campaign_not_found");
  const result = await call("delete_recruitment_draft", (s) => s.rpc("delete_recruitment_draft", { p_campaign_id: campaignId }));
  if (!result.ok) return result.state;
  redirect(`${routes.manageRecruitment(asso)}?fait=supprime`);
}

export async function changeCampaignSlug(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const slug = text(form, "slug").toLowerCase();
  if (!SLUG.test(slug) || slug.length < 3 || slug.length > 100) return failure("slug_invalid");
  return run(
    "change_recruitment_slug",
    (s) => s.rpc("change_recruitment_slug", { p_campaign_id: text(form, "campaign_id"), p_slug: slug }),
    "Adresse changée. L'ancienne redirige vers la nouvelle.",
  );
}

// ---- The BDE ---------------------------------------------------------------------------------------

export async function hideCampaign(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "hide_recruitment_campaign",
    (s) => s.rpc("hide_recruitment_campaign", { p_campaign_id: text(form, "campaign_id"), p_reason: text(form, "reason") }),
    "Masqué : il n'apparaît plus sur le site et ne prend plus de candidature. Les candidatures déjà envoyées sont gardées.",
  );
}

export async function restoreCampaign(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "restore_recruitment_campaign",
    (s) => s.rpc("restore_recruitment_campaign", { p_campaign_id: text(form, "campaign_id"), p_reason: text(form, "reason") }),
    "Rétabli : il réapparaît sur le site.",
  );
}

/** The privacy notice candidates read before sending, and the retention the nightly purge applies. */
export async function setRecruitmentSettings(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const months = (name: string): number | null | "bad" => {
    const v = text(form, name);
    if (!v) return null;
    const n = Number.parseInt(v, 10);
    return Number.isInteger(n) && n >= 1 && n <= 60 && String(n) === v ? n : "bad";
  };
  const draft = months("draft_months");
  const withdrawn = months("withdrawn_months");
  const submitted = months("submitted_months");
  if (draft === "bad" || withdrawn === "bad" || submitted === "bad")
    return failure("campaign_invalid", "Une durée de conservation est un nombre de mois entre 1 et 60 (ou vide : pas encore décidée).");
  const notice = text(form, "privacy_notice").replace(/\r\n?/g, "\n");
  const contact = text(form, "privacy_contact");
  if (notice.length > 6000) return failure("campaign_invalid", "La notice fait 6 000 caractères au plus.");
  if (contact && (contact.length < 3 || contact.length > 254)) return failure("campaign_invalid", "Le contact fait de 3 à 254 caractères.");
  return run(
    "set_recruitment_settings",
    (s) =>
      // Every argument is sent, null included: an empty field means "not decided yet".
      s.rpc("set_recruitment_settings", {
        p_privacy_notice: notice || null,
        p_privacy_contact: contact || null,
        p_draft_months: draft,
        p_withdrawn_months: withdrawn,
        p_submitted_months: submitted,
      } as never),
    "Enregistré. Les candidat·es lisent la nouvelle notice avant d'envoyer ; les durées s'appliquent dès la nuit prochaine.",
  );
}

// ---- Articles ----------------------------------------------------------------------------------------

export async function setPostCampaign(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const postId = id(form, "post_id");
  const campaignId = text(form, "campaign_id");
  if (!postId) return failure("post_not_found");
  if (campaignId && !UUID.test(campaignId)) return failure("campaign_not_found");
  return run(
    "set_post_campaign",
    (s) => s.rpc("set_post_campaign", { p_post_id: postId, p_campaign_id: (campaignId || null) as never }),
    campaignId ? "Recrutement relié : l'article l'affiche, toujours à jour." : "Recrutement retiré de l'article.",
  );
}

// ---- Candidates ------------------------------------------------------------------------------------

/**
 * "Candidater" on a position: opens the student's draft (a new one, or the
 * one they already have). The database decides whether the position takes
 * applications now and whether the student may apply (profile, study year,
 * the campaign's limit). Visitors are sent to sign in first.
 */
export async function startApplication(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const positionId = id(form, "position_id");
  const back = text(form, "back");
  if (!positionId) return failure("position_not_found");
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") redirect(withNext(routes.login, back.startsWith("/recruitment/") ? back : routes.recruitment));
  const result = await call("start_application", (s) => s.rpc("start_application", { p_position_id: positionId }));
  if (!result.ok) {
    if (result.state.code === "profile_incomplete") redirect(withNext(routes.accountOnboarding, back.startsWith("/recruitment/") ? back : null));
    return result.state;
  }
  const r = result.data as { application_id: string; status: string; already: boolean };
  redirect(r.status === "draft" ? routes.accountApplication(r.application_id) : `${routes.accountApplication(r.application_id)}?fait=deja`);
}

export type AnswersSaveResult =
  | { ok: true; version: number; savedAt: string; errors: Record<string, AnswerError> }
  | { ok: false; code: GovernanceErrorCode; message: string };

/** Autosave of a draft (called directly by the editor). The version guards against a stale tab. */
export async function saveApplicationAnswers(applicationId: string, version: number, answers: Record<string, unknown>): Promise<AnswersSaveResult> {
  if (!UUID.test(applicationId) || !Number.isInteger(version)) return { ok: false, code: "application_not_found", message: governanceErrorMessage("application_not_found") };
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return { ok: false, code: "not_authenticated", message: governanceErrorMessage("not_authenticated") };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_application_answers", {
    p_application_id: applicationId,
    p_version: version,
    p_answers: answers as never,
  });
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError("save_application_answers", { code: error.code ?? "", message: "" });
    return { ok: false, code, message: governanceErrorMessage(code) };
  }
  const r = data as unknown as { version: number; saved_at: string; errors: Record<string, AnswerError> };
  return { ok: true, version: r.version, savedAt: r.saved_at, errors: r.errors ?? {} };
}

/** Moves a draft to the form's live version (answers that still mean the same are kept). */
export async function refreshApplicationForm(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const applicationId = id(form, "application_id");
  if (!applicationId) return failure("application_not_found");
  const result = await call("refresh_application_form", (s) => s.rpc("refresh_application_form", { p_application_id: applicationId }));
  if (!result.ok) return result.state;
  const r = result.data as { changed: boolean; dropped?: string[] };
  redirect(`${routes.accountApplication(applicationId)}?fait=${r.changed ? `formulaire-${(r.dropped ?? []).length}` : "formulaire-0"}`);
}

export async function removeApplicationDocument(documentId: string): Promise<{ ok: true; version: number } | { ok: false; message: string }> {
  if (!UUID.test(documentId)) return { ok: false, message: governanceErrorMessage("document_not_found") };
  const result = await call("remove_application_document", (s) => s.rpc("remove_application_document", { p_document_id: documentId }));
  if (!result.ok) return { ok: false, message: result.state.message ?? governanceErrorMessage("unexpected") };
  // The file itself is queued for deletion from Storage (database trigger + maintenance worker).
  const supabase = await createSupabaseServerClient();
  const doc = await supabase.from("application_documents").select("application_id").eq("id", documentId).maybeSingle();
  const app = doc.data
    ? await supabase.from("applications").select("version").eq("id", doc.data.application_id).maybeSingle()
    : { data: null };
  return { ok: true, version: app.data?.version ?? 0 };
}

export async function deleteApplicationDraft(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const applicationId = id(form, "application_id");
  if (!applicationId) return failure("application_not_found");
  const result = await call("delete_application_draft", (s) => s.rpc("delete_application_draft", { p_application_id: applicationId }));
  if (!result.ok) return result.state;
  redirect(`${routes.accountApplications}?fait=brouillon-supprime`);
}

/**
 * THE submission: the database checks the window, eligibility, the limit,
 * the form version, every answer and document, in one transaction. Twice
 * returns the same submission.
 */
export async function submitApplication(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const applicationId = id(form, "application_id");
  const version = Number.parseInt(text(form, "version"), 10);
  if (!applicationId || !Number.isInteger(version)) return failure("application_not_found");
  const acknowledged = text(form, "privacy") === "1";
  if (!acknowledged) return failure("privacy_not_acknowledged");
  const result = await call("submit_application", (s) =>
    s.rpc("submit_application", { p_application_id: applicationId, p_version: version, p_privacy_acknowledged: acknowledged }),
  );
  if (!result.ok) return result.state;
  redirect(`${routes.accountApplication(applicationId)}?fait=envoyee`);
}

export async function withdrawApplication(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const applicationId = id(form, "application_id");
  if (!applicationId) return failure("application_not_found");
  const reason = text(form, "reason").slice(0, 500);
  const result = await call("withdraw_application", (s) =>
    s.rpc("withdraw_application", { p_application_id: applicationId, p_reason: reason || undefined }),
  );
  if (!result.ok) return result.state;
  redirect(`${routes.accountApplication(applicationId)}?fait=retiree`);
}
