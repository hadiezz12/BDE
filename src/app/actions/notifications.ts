"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { logDataError } from "@/lib/data/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { governanceErrorCode, governanceErrorMessage, type GovernanceErrorCode } from "@/lib/governance/messages";
import type { GovernanceActionState } from "./governance";

/**
 * Actions of the notification centre (Phase 10): reading, archiving, the
 * person's choices, following an association, unsubscribing from a link,
 * messages to an audience and the delivery desk. Each one forwards to a
 * database function that identifies the caller and touches their own rows
 * only (or checks the association's or the BDE's key). Ids in forms are
 * untrusted: the database refuses what the person may not do.
 */

export interface BroadcastActionState extends GovernanceActionState {
  /** A draft just prepared: who it would reach, before the person confirms. */
  draft?: { id: string; recipients: number; email: number };
  /** After submitting: queued now, or waiting for a second BDE approval. */
  submitted?: { status: string; recipients: number | null };
}

export interface UnsubscribeState {
  status: "idle" | "done" | "already" | "expired" | "invalid" | "error";
  label?: string | null;
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
const checked = (form: FormData, name: string) => ["on", "1", "true"].includes(text(form, name));
const ids = (form: FormData) =>
  form
    .getAll("id")
    .map((v) => Number(v))
    .filter((n) => Number.isSafeInteger(n) && n > 0)
    .slice(0, 200);

function failure(code: GovernanceErrorCode): GovernanceActionState {
  return { status: "error", code, message: governanceErrorMessage(code), at: Date.now() };
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
  // The bell (in every header), the account pages and the workspace read live counts.
  revalidatePath("/", "layout");
  return { ok: true, data };
}

async function run(where: string, rpc: (supabase: Supabase) => PromiseLike<RpcResult>, done: string | ((data: unknown) => string)) {
  const result = await call(where, rpc);
  if (!result.ok) return result.state;
  return { status: "done" as const, message: typeof done === "string" ? done : done(result.data), at: Date.now() };
}

// ---- One's own notifications -------------------------------------------------------------------

/** Marks the given ones read (or all of them, without ids). */
export async function markNotificationsRead(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const selected = ids(form);
  return run(
    "mark_notifications_read",
    (s) => s.rpc("mark_notifications_read", selected.length ? { p_ids: selected } : {}),
    (n) => (selected.length === 1 ? "Marquée comme lue." : `${Number(n)} notification${Number(n) > 1 ? "s" : ""} marquée${Number(n) > 1 ? "s" : ""} comme lue${Number(n) > 1 ? "s" : ""}.`),
  );
}

/** Archives (or, with restore=1, brings back) the given ones. */
export async function archiveNotifications(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const selected = ids(form);
  if (selected.length === 0) return failure("selection_invalid");
  const restore = text(form, "restore") === "1";
  return run(
    "archive_notifications",
    (s) => s.rpc("archive_notifications", { p_ids: selected, p_archive: !restore }),
    restore ? "Remise dans tes notifications." : "Archivée. Tu la retrouves dans « Archivées ».",
  );
}

// ---- Choices -----------------------------------------------------------------------------------

export async function setNotificationPreference(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const topic = text(form, "topic");
  if (!/^[a-z_]{3,40}$/.test(topic)) return failure("topic_not_found");
  return run(
    "set_notification_preference",
    (s) => s.rpc("set_notification_preference", { p_topic: topic, p_in_app: checked(form, "in_app"), p_email: checked(form, "email") }),
    "Choix enregistré.",
  );
}

export async function setNotificationSettings(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "set_notification_settings",
    (s) =>
      s.rpc("set_notification_settings", {
        p_quiet_hours: checked(form, "quiet_hours"),
        p_quiet_start: text(form, "quiet_start"),
        p_quiet_end: text(form, "quiet_end"),
        p_timezone: "Europe/Paris",
      }),
    checked(form, "quiet_hours")
      ? "Heures calmes enregistrées. Les e-mails qui ne pressent pas attendront leur fin."
      : "Heures calmes désactivées.",
  );
}

export async function followOrganization(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const organizationId = text(form, "organization_id");
  if (!UUID.test(organizationId)) return failure("organization_not_found");
  const follow = text(form, "follow") !== "0";
  return run(
    "follow_organization",
    (s) =>
      s.rpc("follow_organization", {
        p_organization_id: organizationId,
        p_follow: follow,
        p_source: text(form, "source") === "settings" ? "settings" : "association_page",
      }),
    follow ? "Tu suis cette asso : ses nouveaux articles, événements et recrutements arriveront dans tes notifications." : "Tu ne suis plus cette asso.",
  );
}

export async function clearEmailSuppression(): Promise<GovernanceActionState> {
  return run(
    "clear_my_email_suppression",
    (s) => s.rpc("clear_my_email_suppression"),
    "C'est noté : les e-mails reprendront. S'ils échouent encore, vérifie ta boîte (pleine, désactivée ?) avec le service informatique.",
  );
}

/** The unsubscribe page's button (no session needed: the token is the proof). */
export async function unsubscribeWithToken(_prev: UnsubscribeState, form: FormData): Promise<UnsubscribeState> {
  const token = text(form, "t");
  if (!/^[0-9a-f]{64}$/.test(token)) return { status: "invalid" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("unsubscribe_with_token", { p_token: token });
  if (error) {
    logDataError("unsubscribe_with_token", { code: error.code ?? "", message: "" });
    return { status: "error" };
  }
  const d = data as unknown as { status: string; label?: string | null };
  const status = d.status === "done" || d.status === "already" || d.status === "expired" ? d.status : "invalid";
  return { status, label: d.label ?? null };
}

// ---- Messages to an audience -------------------------------------------------------------------

/** Prepares a draft and says how many people it would reach (nothing is sent yet). */
export async function createBroadcast(_prev: BroadcastActionState, form: FormData): Promise<BroadcastActionState> {
  const organizationId = text(form, "organization_id");
  if (!UUID.test(organizationId)) return failure("organization_not_found");
  const result = await call("create_notification_broadcast", (s) =>
    s.rpc("create_notification_broadcast", {
      p_organization_id: organizationId,
      p_audience: text(form, "audience"),
      p_title: text(form, "title"),
      p_body: String(form.get("body") ?? "").slice(0, 4000),
      p_link_path: text(form, "link_path") || undefined,
      p_email: checked(form, "email"),
      p_importance: checked(form, "important") ? "important" : "normal",
    }),
  );
  if (!result.ok) return result.state;
  const d = result.data as { id: string; recipients: number; email: number };
  return {
    status: "done",
    message: "Brouillon prêt. Vérifie à qui il partira, puis confirme l'envoi.",
    draft: { id: d.id, recipients: Number(d.recipients), email: Number(d.email) },
    at: Date.now(),
  };
}

export async function submitBroadcast(_prev: BroadcastActionState, form: FormData): Promise<BroadcastActionState> {
  const id = text(form, "id");
  if (!UUID.test(id)) return failure("broadcast_not_found");
  const result = await call("submit_notification_broadcast", (s) => s.rpc("submit_notification_broadcast", { p_id: id }));
  if (!result.ok) return result.state;
  const d = result.data as { status: string; recipients: number | null };
  return {
    status: "done",
    message:
      d.status === "pending_approval"
        ? "Envoyé pour approbation : une autre personne du bureau du BDE doit valider l'envoi par e-mail à tout le campus."
        : `C'est parti : le message est distribué à ${d.recipients ?? 0} personne${(d.recipients ?? 0) > 1 ? "s" : ""} dans la minute.`,
    submitted: d,
    at: Date.now(),
  };
}

export async function approveBroadcast(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const id = text(form, "id");
  if (!UUID.test(id)) return failure("broadcast_not_found");
  return run("approve_notification_broadcast", (s) => s.rpc("approve_notification_broadcast", { p_id: id }), "Approuvé : l'annonce part dans la minute.");
}

export async function cancelBroadcast(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const id = text(form, "id");
  if (!UUID.test(id)) return failure("broadcast_not_found");
  return run(
    "cancel_notification_broadcast",
    (s) => s.rpc("cancel_notification_broadcast", { p_id: id, p_reason: text(form, "reason") || undefined }),
    "Message annulé. Ce qui n'était pas encore parti ne partira pas.",
  );
}

// ---- The delivery desk (BDE) ---------------------------------------------------------------------

export async function retryDelivery(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const id = Number(text(form, "delivery_id"));
  if (!Number.isSafeInteger(id) || id <= 0) return failure("delivery_not_found");
  return run(
    "retry_notification_delivery",
    (s) => s.rpc("retry_notification_delivery", { p_delivery_id: id }),
    "Relancé : l'e-mail repart au prochain passage (dans la minute).",
  );
}
