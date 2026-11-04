"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { logDataError } from "@/lib/data/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { governanceErrorCode, governanceErrorMessage, type GovernanceErrorCode } from "@/lib/governance/messages";
import { routes } from "@/lib/routes";
import { parisISO } from "@/lib/time";
import { DRAFT_VERSION, NOTICE_SECTIONS } from "@/lib/privacy/notice";
import { REQUEST_KIND_LABEL, type PrivacyRequestKind } from "@/lib/privacy/labels";
import type { GovernanceActionState } from "./governance";

/**
 * Actions of the privacy pages (Phase 14): a student's requests, and the
 * privacy officer's handling of them, holds, incidents, the notice approval
 * and the reconciliation after a restore. Each one forwards to a database
 * function that checks who may do it (the officer's key and the second
 * factor for everything on their side); ids and values from forms are
 * untrusted, and nothing destructive happens without the database's own
 * confirmation rules.
 */

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/;
const KINDS = Object.keys(REQUEST_KIND_LABEL) as PrivacyRequestKind[];

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const uuid = (form: FormData, name: string) => (UUID.test(text(form, name)) ? text(form, name) : null);
const date = (form: FormData, name: string) => (DATE.test(text(form, name)) ? text(form, name) : null);
/** A <input type="datetime-local"> read as Paris wall-clock time. */
const parisDateTime = (form: FormData, name: string) => {
  const m = text(form, name).match(DATETIME);
  return m ? parisISO(m[1], m[2]) : null;
};
const list = (form: FormData, name: string) => form.getAll(name).map(String).filter(Boolean);

function failure(code: GovernanceErrorCode, message?: string): GovernanceActionState {
  return { status: "error", code, message: message ?? governanceErrorMessage(code), at: Date.now() };
}

function done(message: string): GovernanceActionState {
  return { status: "done", message, at: Date.now() };
}

async function call(where: string, rpc: (supabase: Supabase) => PromiseLike<RpcResult>, paths: string[]) {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return { ok: false as const, code: "not_authenticated" as GovernanceErrorCode };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await rpc(supabase);
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError(where, { code: error.code ?? "", message: "" });
    return { ok: false as const, code };
  }
  for (const path of paths) revalidatePath(path);
  return { ok: true as const, data };
}

const MINE = [routes.accountPrivacy];
const DESK = [routes.managePrivacy];
const deskOf = (id: string) => [routes.managePrivacy, routes.managePrivacyRequest(id)];

// ---- The student ------------------------------------------------------------------------------------------

export async function submitPrivacyRequest(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const kind = text(form, "kind") as PrivacyRequestKind;
  if (!KINDS.includes(kind)) return failure("privacy_request_invalid");
  const details = text(form, "details");
  if (details.length > 2000) return failure("privacy_request_invalid");
  const r = await call("submit_privacy_request", (s) => s.rpc("submit_privacy_request", { p_kind: kind, p_details: details }), MINE);
  if (!r.ok) return failure(r.code);
  const reference = (r.data as { reference?: string })?.reference ?? "";
  return done(`Demande ${reference} envoyée. La réponse arrive dans un délai d'un mois ; tu la suis ci-dessous.`);
}

export async function withdrawPrivacyRequest(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const id = uuid(form, "request_id");
  if (!id) return failure("privacy_request_not_found");
  const r = await call("withdraw_privacy_request", (s) => s.rpc("withdraw_privacy_request", { p_request_id: id }), MINE);
  return r.ok ? done("Demande retirée.") : failure(r.code);
}

// ---- The privacy officer ----------------------------------------------------------------------------------

export async function verifyPrivacyIdentity(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const id = uuid(form, "request_id");
  const status = text(form, "identity_status");
  if (!id || !["verified", "failed", "pending"].includes(status)) return failure("privacy_request_invalid");
  const r = await call(
    "verify_privacy_request_identity",
    (s) => s.rpc("verify_privacy_request_identity", { p_request_id: id, p_status: status, p_note: text(form, "note") }),
    deskOf(id),
  );
  return r.ok ? done("Vérification d'identité enregistrée.") : failure(r.code);
}

export async function decidePrivacyRequest(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const id = uuid(form, "request_id");
  const decision = text(form, "decision");
  if (!id || !["approved", "partially_approved", "refused"].includes(decision)) return failure("privacy_request_invalid");
  const r = await call(
    "decide_privacy_request",
    (s) => s.rpc("decide_privacy_request", { p_request_id: id, p_decision: decision, p_reason: text(form, "reason") }),
    deskOf(id),
  );
  return r.ok ? done("Décision enregistrée ; la personne est prévenue.") : failure(r.code);
}

export async function extendPrivacyRequest(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const id = uuid(form, "request_id");
  const months = Number(text(form, "months"));
  if (!id || ![1, 2].includes(months)) return failure("privacy_request_invalid");
  const r = await call(
    "extend_privacy_request",
    (s) => s.rpc("extend_privacy_request", { p_request_id: id, p_months: months, p_reason: text(form, "reason") }),
    deskOf(id),
  );
  return r.ok ? done("Délai prolongé ; la personne est prévenue avec la raison.") : failure(r.code);
}

export async function addPrivacyNote(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const id = uuid(form, "request_id");
  if (!id) return failure("privacy_request_invalid");
  const visible = form.get("visible") === "on";
  const r = await call(
    "add_privacy_request_note",
    (s) => s.rpc("add_privacy_request_note", { p_request_id: id, p_note: text(form, "note"), p_visible: visible }),
    deskOf(id),
  );
  return r.ok ? done(visible ? "Message envoyé à la personne." : "Note interne enregistrée.") : failure(r.code);
}

export async function preparePrivacyExport(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const id = uuid(form, "request_id");
  if (!id) return failure("privacy_request_invalid");
  const r = await call(
    "prepare_privacy_export",
    (s) => s.rpc("prepare_privacy_export", { p_request_id: id, p_include_assessments: form.get("assessments") === "on" }),
    deskOf(id),
  );
  return r.ok ? done("Export préparé : la personne le télécharge depuis Mes données pendant 14 jours.") : failure(r.code);
}

export async function executePrivacyErasure(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const id = uuid(form, "request_id");
  if (!id) return failure("privacy_request_invalid");
  const r = await call(
    "execute_privacy_erasure",
    (s) =>
      s.rpc("execute_privacy_erasure", {
        p_request_id: id,
        p_end_responsibilities: form.get("end_responsibilities") === "on",
        p_confirm_reference: text(form, "confirm").toUpperCase(),
      }),
    deskOf(id),
  );
  if (!r.ok) return failure(r.code);
  const files = (r.data as { files_queued?: number })?.files_queued ?? 0;
  return done(
    files > 0
      ? `Effacement fait dans la base ; ${files} fichier(s) en cours de suppression du stockage. Termine la demande une fois le nettoyage fait.`
      : "Effacement fait. Tu peux terminer la demande.",
  );
}

export async function completePrivacyRequest(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const id = uuid(form, "request_id");
  if (!id) return failure("privacy_request_invalid");
  const r = await call(
    "complete_privacy_request",
    (s) => s.rpc("complete_privacy_request", { p_request_id: id, p_note: text(form, "note") }),
    deskOf(id),
  );
  return r.ok ? done("Demande terminée ; la personne est prévenue.") : failure(r.code);
}

export async function recordOfflinePrivacyRequest(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const kind = text(form, "kind") as PrivacyRequestKind;
  const received = date(form, "received_on");
  if (!KINDS.includes(kind) || !received) return failure("privacy_request_invalid");
  const r = await call(
    "record_offline_privacy_request",
    (s) =>
      s.rpc("record_offline_privacy_request", {
        p_email: text(form, "email").toLowerCase(),
        p_kind: kind,
        p_details: text(form, "details"),
        p_received_at: parisISO(received, "12:00"),
        p_identity_note: text(form, "identity_note"),
      }),
    DESK,
  );
  if (!r.ok) return failure(r.code);
  return done(`Demande ${(r.data as { reference?: string })?.reference ?? ""} enregistrée. Vérifie l'identité avant de décider.`);
}

export async function placeRetentionHold(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const subject = uuid(form, "subject_id");
  const review = date(form, "review_on");
  if (!subject || !review) return failure("retention_hold_invalid");
  const r = await call(
    "place_retention_hold",
    (s) =>
      s.rpc("place_retention_hold", {
        p_scope: text(form, "scope"),
        p_subject_id: subject,
        p_purpose: text(form, "purpose"),
        p_legal_basis: text(form, "legal_basis"),
        p_decided_by: text(form, "decided_by"),
        p_review_on: review,
      }),
    DESK,
  );
  return r.ok ? done("Conservation exceptionnelle enregistrée, jusqu'à sa date de revue.") : failure(r.code);
}

export async function releaseRetentionHold(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const id = uuid(form, "hold_id");
  if (!id) return failure("retention_hold_invalid");
  const r = await call(
    "release_retention_hold",
    (s) => s.rpc("release_retention_hold", { p_hold_id: id, p_reason: text(form, "reason") }),
    DESK,
  );
  return r.ok ? done("Conservation levée : les règles ordinaires s'appliquent de nouveau.") : failure(r.code);
}

export async function openPrivacyIncident(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const aware = parisDateTime(form, "aware_at");
  if (!aware) return failure("incident_invalid");
  const r = await call(
    "open_privacy_incident",
    (s) => s.rpc("open_privacy_incident", { p_title: text(form, "title"), p_impact: text(form, "impact"), p_aware_at: aware }),
    DESK,
  );
  return r.ok ? done("Incident ouvert. Le délai de 72 heures court depuis la découverte : évalue-le ci-dessous.") : failure(r.code);
}

export async function assessPrivacyIncident(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const id = uuid(form, "incident_id");
  if (!id) return failure("incident_not_found");
  const estimate = text(form, "affected_estimate");
  const r = await call(
    "assess_privacy_incident",
    (s) =>
      s.rpc("assess_privacy_incident", {
        p_incident_id: id,
        p_personal_data: text(form, "personal_data"),
        p_aware_at: parisDateTime(form, "aware_at") as string,
        p_categories: list(form, "categories"),
        p_affected_estimate: (/^\d+$/.test(estimate) ? Number(estimate) : null) as number,
        p_impact: list(form, "impact"),
        p_risk: text(form, "risk"),
        p_authority_decision: text(form, "authority_decision"),
        p_authority_notified_at: parisDateTime(form, "authority_notified_at") as string,
        p_individuals_decision: text(form, "individuals_decision"),
        p_individuals_informed_at: parisDateTime(form, "individuals_informed_at") as string,
        p_note: text(form, "note"),
      }),
    DESK,
  );
  return r.ok ? done("Évaluation enregistrée.") : failure(r.code);
}

/** Records the controller's approval of the current draft (its exact text, from the code). */
export async function recordPrivacyNoticeApproval(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const approved = date(form, "approved_on");
  const effective = date(form, "effective_on");
  if (!approved || !effective) return failure("privacy_notice_invalid");
  const version = text(form, "version") || DRAFT_VERSION;
  const r = await call(
    "record_privacy_notice_version",
    (s) =>
      s.rpc("record_privacy_notice_version", {
        p_version: version,
        p_language: "fr",
        p_sections: NOTICE_SECTIONS as unknown as never,
        p_approved_by: text(form, "approved_by"),
        p_reference: text(form, "reference"),
        p_approved_on: approved,
        p_effective_at: parisISO(effective, "00:00"),
      }),
    [...DESK, routes.privacy],
  );
  return r.ok ? done(`Version ${version} enregistrée ; elle s'affiche à partir du ${effective}.`) : failure(r.code);
}

export async function reconcileErasures(): Promise<GovernanceActionState> {
  const r = await call("reconcile_privacy_erasures", (s) => s.rpc("reconcile_privacy_erasures"), DESK);
  if (!r.ok) return failure(r.code);
  const n = (r.data as { reapplied?: number })?.reapplied ?? 0;
  return done(n === 0 ? "Rien à refaire : aucune donnée effacée n'est revenue." : `${n} effacement(s) refait(s) après la restauration.`);
}

// ---- Recruitment forms -----------------------------------------------------------------------------------

export async function recordFormPrivacyReview(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const campaign = uuid(form, "campaign_id");
  const asso = text(form, "asso");
  if (!campaign) return failure("campaign_not_found");
  const r = await call(
    "record_form_privacy_review",
    (s) => s.rpc("record_form_privacy_review", { p_campaign_id: campaign, p_justification: text(form, "justification") }),
    /^[a-z0-9-]+$/.test(asso) ? [routes.manageCampaign(asso, campaign)] : [],
  );
  return r.ok ? done("Justification enregistrée : la publication est possible, et la personne chargée des données en est informée.") : failure(r.code);
}
