"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { getAuthContext } from "@/lib/auth/context";
import { logDataError } from "@/lib/data/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { endOfParisDay } from "@/lib/governance/labels";
import { governanceErrorCode, governanceErrorMessage, type GovernanceErrorCode } from "@/lib/governance/messages";
import { normalizePostContent } from "@/lib/posts/content";
import { formatScheduled, parisLocalToInstant } from "@/lib/posts/schedule";
import type { GovernanceActionState } from "./governance";

/**
 * Actions of the publishing desk, the article pages and moderation (Phase 6).
 * Each one forwards to a database function (supabase/migrations/202610210924*
 * and 202610210925*) that identifies the caller, checks the right in the
 * post's own association (or the platform right), the editorial policy, the
 * approval of the exact revision and the moderation state, writes in one
 * transaction and audits. Ids in forms are untrusted: the database refuses
 * what the person may not do, and a refusal comes back as a sentence.
 */

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type RpcResult = { data: unknown; error: { code?: string; message?: string; details?: string } | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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
  // The feed, the article, the association page and the desk all read live data: render fresh.
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

// ---- Writing -------------------------------------------------------------------------------

/** Starts a post (type and optional title), then opens it in the editor. */
export async function createPost(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const organizationId = id(form, "organization_id");
  const asso = text(form, "organization_slug");
  const kind = text(form, "kind");
  if (!organizationId || !SLUG.test(asso)) return failure("organization_not_found");
  const result = await call("create_post", (s) =>
    s.rpc("create_post", { p_organization_id: organizationId, p_kind: kind, p_title: text(form, "title").slice(0, 140) }),
  );
  if (!result.ok) return result.state;
  redirect(routes.manageContentPost(asso, String(result.data)));
}

export type SaveResult =
  | { ok: true; revisionId: string; number: number; version: number; created: boolean; savedAt: number }
  | { ok: false; code: GovernanceErrorCode; message: string };

/**
 * Autosave. The editor sends the whole working content with the revision
 * and version it started from; the database refuses (draft_conflict) when
 * someone saved in between, so nobody's text is silently overwritten.
 * Saving a frozen version (sent for review, approved, live) starts a new one.
 */
export async function savePost(input: {
  postId: string;
  revisionId: string;
  version: number;
  content: unknown;
}): Promise<SaveResult> {
  if (!UUID.test(String(input?.postId)) || !UUID.test(String(input?.revisionId)) || !Number.isInteger(input?.version)) {
    return { ok: false, code: "post_not_found", message: governanceErrorMessage("post_not_found") };
  }
  const content = normalizePostContent(input.content);
  if (!content.ok) {
    const what: Record<typeof content.field, string> = {
      kind: "le type",
      title: "le titre (140 caractères au plus)",
      intro: "l'introduction (400 caractères au plus)",
      body: "le texte (trop long ou mal formé)",
      cover: "l'image de couverture",
      category: "la rubrique",
      tags: "les mots-clés (8 au plus)",
    };
    return { ok: false, code: "post_invalid", message: `Impossible d'enregistrer : vérifie ${what[content.field]}.` };
  }
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") {
    return { ok: false, code: "not_authenticated", message: governanceErrorMessage("not_authenticated") };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("save_post_revision", {
    p_post_id: input.postId,
    p_revision_id: input.revisionId,
    p_version: input.version,
    p_content: content.value as never,
  });
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError("save_post_revision", { code: error.code ?? "", message: "" });
    return { ok: false, code, message: governanceErrorMessage(code) };
  }
  const saved = data as { revision_id: string; number: number; version: number; new: boolean };
  // No revalidation here: autosave never changes what visitors see.
  return { ok: true, revisionId: saved.revision_id, number: saved.number, version: saved.version, created: saved.new, savedAt: Date.now() };
}

/** Deletes a post that was never online (drafts only), then back to the desk. */
export async function deletePostDraft(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const postId = id(form, "post_id");
  const asso = text(form, "organization_slug");
  if (!postId || !SLUG.test(asso)) return failure("post_not_found");
  const result = await call("delete_post_draft", (s) => s.rpc("delete_post_draft", { p_post_id: postId }));
  if (!result.ok) return result.state;
  redirect(`${routes.manageContent(asso)}?fait=supprime`);
}

// ---- Review --------------------------------------------------------------------------------

export async function submitPost(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "submit_post_revision",
    (s) => s.rpc("submit_post_revision", { p_post_id: text(form, "post_id"), p_revision_id: text(form, "revision_id") }),
    "Envoyé en relecture. Cette version ne change plus : quelqu'un qui peut approuver la relira.",
  );
}

export async function withdrawPost(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "withdraw_post_revision",
    (s) => s.rpc("withdraw_post_revision", { p_post_id: text(form, "post_id"), p_revision_id: text(form, "revision_id") }),
    "Retiré de la relecture : tu peux de nouveau le modifier.",
  );
}

export async function reviewPost(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const decision = text(form, "decision") === "approve" ? "approve" : "request_changes";
  const note = optional(form, "note");
  if (decision === "request_changes" && !note) {
    return failure("reason_required", "Dis ce qu'il faut changer : la note est lue par l'auteur ou l'autrice.");
  }
  return run(
    "review_post_revision",
    (s) =>
      s.rpc("review_post_revision", {
        p_post_id: text(form, "post_id"),
        p_revision_id: text(form, "revision_id"),
        p_decision: decision,
        p_note: note,
      }),
    decision === "approve"
      ? "Approuvé. Cette version exacte peut maintenant être publiée ou programmée."
      : "Modifications demandées. L'équipe voit ta note dans l'éditeur.",
  );
}

/** Takes an older version as the new working draft (nothing changes online). */
export async function restorePostRevision(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "restore_post_revision",
    (s) => s.rpc("restore_post_revision", { p_post_id: text(form, "post_id"), p_revision_id: text(form, "revision_id") }),
    "Version reprise comme brouillon. Rien n'a changé en ligne : relis-la, puis publie-la ou envoie-la en relecture.",
  );
}

// ---- Publication ---------------------------------------------------------------------------

export async function publishPost(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "publish_post",
    (s) => s.rpc("publish_post", { p_post_id: text(form, "post_id"), p_revision_id: text(form, "revision_id") }),
    "Publié : l'article est en ligne dans le fil et sur la page de l'asso.",
  );
}

/** Schedules a version for a Paris date and time (daylight saving handled, never guessed). */
export async function schedulePost(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const at = parisLocalToInstant(text(form, "date"), text(form, "time"));
  if (!at.ok) {
    return failure(
      "invalid_schedule",
      at.reason === "nonexistent"
        ? "Cette heure n'existe pas ce jour-là à Paris (passage à l'heure d'été : de 2 h à 3 h, les horloges sautent). Choisis 3 h ou plus tard."
        : "Choisis un jour et une heure valides.",
    );
  }
  return run(
    "schedule_post",
    (s) => s.rpc("schedule_post", { p_post_id: text(form, "post_id"), p_revision_id: text(form, "revision_id"), p_at: at.iso }),
    `Programmé pour ${formatScheduled(at.iso, at.ambiguous)}${
      at.ambiguous ? " — cette heure revient deux fois cette nuit-là : c'est la première, avant le changement d'heure" : ""
    }. Rien n'est en ligne avant.`,
  );
}

export async function cancelPostSchedule(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "cancel_post_schedule",
    (s) => s.rpc("cancel_post_schedule", { p_post_id: text(form, "post_id") }),
    "Programmation annulée. Rien n'a été publié.",
  );
}

export async function unpublishPost(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "unpublish_post",
    (s) => s.rpc("unpublish_post", { p_post_id: text(form, "post_id"), p_reason: optional(form, "reason") }),
    "Retiré du site. Le lien ne mène plus à l'article ; il revient à la prochaine publication.",
  );
}

export async function archivePost(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const archive = text(form, "archive") !== "0";
  return run(
    "archive_post",
    (s) => s.rpc("archive_post", { p_post_id: text(form, "post_id"), p_archive: archive }),
    archive
      ? "Archivé : il quitte le fil et la page de l'asso, mais son lien marche toujours."
      : "Sorti des archives : il revient dans le fil, à sa date de première publication.",
  );
}

export async function setPostPin(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const pinned = text(form, "pinned") === "1";
  return run(
    "set_post_pin",
    (s) => s.rpc("set_post_pin", { p_post_id: text(form, "post_id"), p_pinned: pinned }),
    pinned ? "Épinglé en tête de la page de l'asso." : "Désépinglé.",
  );
}

export async function changePostSlug(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const slug = text(form, "slug").toLowerCase();
  if (!SLUG.test(slug) || slug.length < 3 || slug.length > 100) return failure("slug_invalid");
  return run(
    "change_post_slug",
    (s) => s.rpc("change_post_slug", { p_post_id: text(form, "post_id"), p_slug: slug }),
    "Adresse changée. L'ancienne redirige vers la nouvelle.",
  );
}

export async function setEditorialSettings(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const mode = text(form, "review_mode") === "direct" ? "direct" : "approval";
  return run(
    "set_editorial_settings",
    (s) =>
      s.rpc("set_editorial_settings", {
        p_organization_id: text(form, "organization_id"),
        p_review_mode: mode,
        p_show_authors: form.get("show_authors") === "on",
      }),
    "Règles de publication enregistrées.",
  );
}

// ---- Campus-wide prominence (BDE leadership) -------------------------------------------------

export async function setPostProminence(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const prominence = ["featured", "important"].includes(text(form, "prominence")) ? text(form, "prominence") : "normal";
  const untilRaw = text(form, "until");
  const until = untilRaw ? endOfParisDay(untilRaw) : null;
  if (untilRaw && !until) return failure("invalid_period");
  return run(
    "set_post_prominence",
    (s) =>
      s.rpc("set_post_prominence", {
        p_post_id: text(form, "post_id"),
        p_prominence: prominence,
        p_until: until ?? undefined,
      }),
    prominence === "normal"
      ? "Retiré de la une."
      : prominence === "featured"
        ? "Mis à la une du fil."
        : "Affiché comme annonce importante du BDE.",
  );
}

// ---- Reports and moderation ------------------------------------------------------------------

const REPORT_REASONS = ["harassment", "discrimination", "misleading", "privacy", "image_rights", "spam", "other"];

/** A signed-in student reports a public article. The association never learns who. */
export async function reportPost(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const reason = text(form, "reason");
  const details = optional(form, "details");
  if (!REPORT_REASONS.includes(reason) || (details && details.length > 500)) return failure("report_invalid");
  return run(
    "report_post",
    (s) => s.rpc("report_post", { p_post_id: text(form, "post_id"), p_reason: reason, p_details: details }),
    "Merci, c'est envoyé. Le BDE examine chaque signalement ; l'asso ne sait pas qui l'a fait.",
  );
}

export async function dismissReport(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "dismiss_report",
    (s) => s.rpc("dismiss_report", { p_report_id: text(form, "report_id"), p_note: optional(form, "note") }),
    "Signalement classé sans suite.",
  );
}

export async function hidePost(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "hide_post",
    (s) => s.rpc("hide_post", { p_post_id: text(form, "post_id"), p_reason: text(form, "reason") }),
    "Article masqué. L'asso voit la raison dans son espace ; rien de ce qu'elle fait ne le remet en ligne.",
  );
}

export async function restorePostVisibility(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "restore_post_visibility",
    (s) => s.rpc("restore_post_visibility", { p_post_id: text(form, "post_id"), p_reason: text(form, "reason") }),
    "Article rétabli : il revient tel que l'asso l'avait laissé.",
  );
}

// ---- The rubrique catalog (BDE leadership) -----------------------------------------------------

export async function createPostCategory(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const slug = text(form, "slug").toLowerCase();
  if (!SLUG.test(slug) || slug.length > 40) return failure("slug_invalid");
  return run(
    "create_post_category",
    (s) =>
      s.rpc("create_post_category", {
        p_slug: slug,
        p_label: text(form, "label"),
        p_sort_order: Number.parseInt(text(form, "sort_order") || "100", 10) || 100,
      }),
    "Rubrique créée.",
  );
}

export async function updatePostCategory(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  return run(
    "update_post_category",
    (s) =>
      s.rpc("update_post_category", {
        p_category_id: text(form, "category_id"),
        p_label: text(form, "label"),
        p_sort_order: Number.parseInt(text(form, "sort_order") || "100", 10) || 100,
        p_archived: text(form, "archived") === "1",
      }),
    text(form, "archived") === "1" ? "Rubrique retirée (les articles qui l'ont la gardent)." : "Rubrique enregistrée.",
  );
}
