"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { logDataError } from "@/lib/data/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { governanceErrorCode, governanceErrorMessage, type GovernanceErrorCode } from "@/lib/governance/messages";
import { endOfParisDay, startOfParisDay } from "@/lib/governance/labels";
import { formatDateLong } from "@/lib/format";
import { routes } from "@/lib/routes";
import { JOB_WORDS, RETENTION_POLICY } from "@/lib/continuity/labels";
import type { GovernanceActionState } from "./governance";

/**
 * Actions of the continuity pages (Phase 11): the academic year and its
 * rollover, safe job retries, the institutional register, backup checks,
 * incidents, retention policies, handover checklists and the transfer of a
 * reviewer's work. Each one forwards to a database function that checks the
 * key (and the second factor where it matters) itself; ids and values in
 * forms are untrusted. No secret, no SQL, no "run anything" here.
 */

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const checked = (form: FormData, name: string) => ["on", "1", "true"].includes(text(form, name));
const date = (form: FormData, name: string) => (DATE.test(text(form, name)) ? text(form, name) : undefined);
const uuid = (form: FormData, name: string) => (UUID.test(text(form, name)) ? text(form, name) : null);

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
    return { ok: false as const, code, supabase };
  }
  for (const path of paths) revalidatePath(path);
  return { ok: true as const, data, supabase };
}

const PLATFORM = [routes.managePlatformContinuity, routes.managePlatform];

// ---- The academic year ------------------------------------------------------------------------------------

export async function saveAcademicYear(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const startsOn = date(form, "starts_on");
  const endsOn = date(form, "ends_on");
  const mandateStarts = startOfParisDay(text(form, "mandate_starts_on"));
  const mandateEnds = endOfParisDay(text(form, "mandate_ends_on"));
  const offsets = text(form, "reminder_offsets")
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number);
  if (!startsOn || !endsOn || !mandateStarts || !mandateEnds || offsets.some((n) => !Number.isInteger(n))) {
    return failure("academic_year_invalid");
  }
  const id = uuid(form, "year_id");
  const result = await call(
    "save_academic_year",
    (s) =>
      s.rpc("save_academic_year", {
        p_id: id as string,
        p_label: text(form, "label"),
        p_starts_on: startsOn,
        p_ends_on: endsOn,
        p_mandate_starts_at: mandateStarts,
        p_mandate_ends_at: mandateEnds,
        p_handover_starts_on: date(form, "handover_starts_on"),
        p_recruitment_opens_on: date(form, "recruitment_opens_on"),
        p_recruitment_closes_on: date(form, "recruitment_closes_on"),
        p_reminder_offsets: offsets.length ? offsets : undefined,
        p_notes: text(form, "notes") || undefined,
      }),
    [routes.managePlatformYear, ...PLATFORM],
  );
  if (!result.ok) return failure(result.code);
  return done(id ? "Année enregistrée." : "Année préparée. Ouvre sa liste de préparation pour la suite.");
}

export async function confirmYearCheck(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const yearId = uuid(form, "year_id");
  if (!yearId) return failure("academic_year_not_found");
  const isDone = text(form, "done") === "1";
  const result = await call(
    "confirm_academic_year_check",
    (s) =>
      s.rpc("confirm_academic_year_check", {
        p_year_id: yearId,
        p_check: text(form, "check"),
        p_done: isDone,
        p_note: text(form, "note") || undefined,
      }),
    [routes.managePlatformYear],
  );
  if (!result.ok) return failure(result.code);
  return done(isDone ? "Point confirmé." : "Confirmation retirée.");
}

export async function confirmRollover(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const yearId = uuid(form, "year_id");
  if (!yearId) return failure("academic_year_not_found");
  const result = await call(
    "confirm_academic_year_rollover",
    (s) => s.rpc("confirm_academic_year_rollover", { p_year_id: yearId, p_acknowledge_warnings: checked(form, "acknowledge") }),
    [routes.managePlatformYear, ...PLATFORM],
  );
  if (!result.ok) return failure(result.code);
  const r = result.data as { to?: string; already?: boolean };
  return done(
    r.already
      ? "Cette année est déjà l'année en cours."
      : `C'est fait : ${r.to ?? "la nouvelle année"} est l'année en cours. Aucun mandat, aucune donnée n'a changé.`,
  );
}

// ---- Jobs ----------------------------------------------------------------------------------------------------

export async function retryJob(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const job = text(form, "job");
  if (!(job in JOB_WORDS)) return failure("job_unknown");
  const result = await call("retry_scheduled_job", (s) => s.rpc("retry_scheduled_job", { p_key: job }), [routes.managePlatformOperations]);
  if (!result.ok) return failure(result.code);
  const r = result.data as { status: string; error: string | null };
  if (r.status === "succeeded") return done(`${JOB_WORDS[job]} : relancée, terminée sans erreur.`);
  if (r.status === "skipped") return done(`${JOB_WORDS[job]} : déjà en cours, rien n'a été lancé en double.`);
  return failure("unexpected", `${JOB_WORDS[job]} : relancée, mais elle a échoué (${r.error ?? "erreur"}). Préviens le ou la responsable technique.`);
}

// ---- The institutional register, backups, incidents ---------------------------------------------------------

export async function saveRecord(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  // These parameters have no default: an empty field is sent as null (it clears the value).
  const orNull = (value: string | undefined) => (value || null) as string;
  const result = await call(
    "save_institutional_record",
    (s) =>
      s.rpc("save_institutional_record", {
        p_key: text(form, "key"),
        p_provider: orNull(text(form, "provider")),
        p_owner: orNull(text(form, "owner")),
        p_contact: orNull(text(form, "contact")),
        p_renewal_on: orNull(date(form, "renewal_on")),
        p_status: text(form, "status"),
        p_notes: text(form, "notes") || undefined,
      }),
    [routes.managePlatformRegister, routes.managePlatformContinuity],
  );
  if (!result.ok) return failure(result.code);
  return done("Registre mis à jour.");
}

export async function recordBackup(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const checkedOn = date(form, "checked_on");
  if (!checkedOn) return failure("backup_check_invalid");
  const result = await call(
    "record_backup_verification",
    (s) =>
      s.rpc("record_backup_verification", {
        p_kind: text(form, "kind"),
        p_outcome: text(form, "outcome"),
        p_environment: text(form, "environment"),
        p_checked_on: checkedOn,
        p_method: text(form, "method") || undefined,
        p_notes: text(form, "notes") || undefined,
      }),
    [routes.managePlatformRegister, routes.managePlatformContinuity],
  );
  if (!result.ok) return failure(result.code);
  return done("Vérification enregistrée, avec ton nom et la date.");
}

export async function openIncident(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const result = await call(
    "open_operational_incident",
    (s) =>
      s.rpc("open_operational_incident", {
        p_title: text(form, "title"),
        p_kind: text(form, "kind"),
        p_severity: text(form, "severity"),
        p_impact: text(form, "impact") || undefined,
      }),
    [routes.managePlatformOperations, routes.managePlatformContinuity],
  );
  if (!result.ok) return failure(result.code);
  return done("Incident ouvert. Tu en es la personne en charge ; préviens les personnes indiquées.");
}

export async function updateIncident(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const id = uuid(form, "incident_id");
  if (!id) return failure("incident_not_found");
  const status = text(form, "status");
  const result = await call(
    "update_operational_incident",
    (s) =>
      s.rpc("update_operational_incident", {
        p_id: id,
        p_status: status,
        p_note: text(form, "note"),
        p_severity: text(form, "severity") || undefined,
      }),
    [routes.managePlatformOperations, routes.managePlatformContinuity],
  );
  if (!result.ok) return failure(result.code);
  return done(status === "resolved" ? "Incident résolu." : "Incident mis à jour.");
}

// ---- Retention -------------------------------------------------------------------------------------------------

/**
 * Sets a policy. When it would delete records, the database wants the
 * previewed count repeated: the first click answers with that number, and
 * the person types it to confirm (nothing is deleted before the next night).
 */
export async function setRetention(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const key = text(form, "key");
  const raw = text(form, "months");
  const months = raw === "" ? null : Number(raw);
  if (months !== null && (!Number.isInteger(months) || months < 1 || months > 120)) return failure("retention_invalid");
  const confirm = text(form, "confirm_count");
  const confirmCount = /^\d+$/.test(confirm) ? Number(confirm) : undefined;
  const result = await call(
    "set_retention_policy",
    (s) =>
      s.rpc("set_retention_policy", {
        p_key: key,
        p_months: months as number,
        p_note: text(form, "note") || undefined,
        p_confirm_count: confirmCount,
      }),
    [routes.managePlatformRetention],
  );
  const label = RETENTION_POLICY[key]?.label ?? "Cette règle";
  if (!result.ok) {
    if (result.code === "retention_confirmation_required" && result.supabase) {
      const { data } = await result.supabase.rpc("preview_retention_policy", { p_key: key, p_months: months as number });
      const preview = data as { count: number; oldest: string | null } | null;
      if (preview) {
        return failure(
          "retention_confirmation_required",
          `${label} : avec ${months} mois, ${preview.count} élément${preview.count > 1 ? "s" : ""}` +
            `${preview.oldest ? ` (le plus ancien du ${formatDateLong(preview.oldest)})` : ""} seraient supprimés dès la prochaine nuit. ` +
            `Pour confirmer, écris ${preview.count} dans « Nombre à confirmer » et enregistre à nouveau.`,
        );
      }
    }
    return failure(result.code);
  }
  return done(
    months === null
      ? `${label} : plus de durée de conservation. Rien ne sera supprimé.`
      : `${label} : conservé ${months} mois. Le nettoyage passe chaque nuit.`,
  );
}

// ---- Handover ----------------------------------------------------------------------------------------------------

export async function setHandoverItem(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const organizationId = uuid(form, "organization_id");
  if (!organizationId) return failure("organization_not_found");
  const slug = text(form, "slug");
  const result = await call(
    "set_handover_item",
    (s) =>
      s.rpc("set_handover_item", {
        p_organization_id: organizationId,
        p_item_key: text(form, "item"),
        p_done: checked(form, "done"),
        p_note: text(form, "note") || undefined,
        p_assignee_user_id: uuid(form, "assignee") ?? undefined,
      }),
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? [routes.manageHandover(slug)] : [],
  );
  if (!result.ok) return failure(result.code);
  return done("Liste de passation mise à jour.");
}

export async function transferReviews(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const campaignId = uuid(form, "campaign_id");
  const from = uuid(form, "from_member");
  const to = uuid(form, "to_member");
  if (!campaignId || !from || !to || from === to) return failure("selection_invalid");
  const slug = text(form, "slug");
  const result = await call(
    "transfer_review_assignments",
    (s) =>
      s.rpc("transfer_review_assignments", {
        p_campaign_id: campaignId,
        p_from_member_id: from,
        p_to_member_id: to,
        p_reason: text(form, "reason"),
      }),
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ? [routes.manageHandover(slug)] : [],
  );
  if (!result.ok) return failure(result.code);
  // The committee and application pages live under the recruitment section.
  if (/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) revalidatePath(routes.manageRecruitment(slug), "layout");
  const r = result.data as { applications: number; slots: number; skipped: unknown[] };
  return done(
    `${r.applications} candidature${r.applications > 1 ? "s" : ""} et ${r.slots} créneau${r.slots > 1 ? "x" : ""} d'entretien confiés.` +
      (r.skipped.length ? ` ${r.skipped.length} n'ont pas pu l'être (conflit, périmètre ou disponibilité) et restent où elles étaient.` : ""),
  );
}

// ---- The privacy officer -------------------------------------------------------------------------------------------

/** Before an erasure: what the account still holds (organizations and dates only; recorded in the audit). */
export async function lookupResponsibilities(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const email = text(form, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return failure("selection_invalid");
  const result = await call("account_responsibilities", (s) => s.rpc("account_responsibilities", { p_email: email }), []);
  if (!result.ok) return failure(result.code);
  const r = result.data as {
    found: boolean;
    name?: string;
    assignments?: Array<{ organization: string; position: string; ends_at: string }>;
    transitions?: number;
    delegations?: number;
    committee?: number;
    handover_items?: number;
    platform_roles?: string[];
  };
  if (!r.found) return done("Aucun compte avec cette adresse.");
  const parts: string[] = [];
  for (const a of r.assignments ?? []) parts.push(`${a.position} · ${a.organization} (jusqu'au ${formatDateLong(a.ends_at)})`);
  if (r.transitions) parts.push(`${r.transitions} passation${r.transitions > 1 ? "s" : ""} en cours`);
  if (r.delegations) parts.push(`${r.delegations} délégation${r.delegations > 1 ? "s" : ""}`);
  if (r.committee) parts.push(`${r.committee} accès à un comité de recrutement`);
  if (r.handover_items) parts.push(`${r.handover_items} point${r.handover_items > 1 ? "s" : ""} de passation confié${r.handover_items > 1 ? "s" : ""}`);
  if (r.platform_roles?.length) parts.push(`rôle de plateforme : ${r.platform_roles.join(", ")}`);
  return done(
    parts.length
      ? `${r.name} tient encore : ${parts.join(" ; ")}. Fais d'abord passer ces responsabilités par les passations prévues, puis traite la demande.`
      : `${r.name} ne tient aucune responsabilité en cours.`,
  );
}
