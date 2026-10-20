"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { getAuthContext } from "@/lib/auth/context";
import { safeNextPath } from "@/lib/auth/next-path";
import { logDataError } from "@/lib/data/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { governanceErrorCode, governanceErrorMessage, type GovernanceErrorCode } from "@/lib/governance/messages";
import {
  parseAppearance,
  parseCategories,
  parseContact,
  parseIdentity,
  parsePillars,
  parsePresentation,
  slugError,
  type FieldErrors,
} from "@/lib/associations/validation";

/**
 * Actions of the association page editor (Phase 5). Like the governance
 * actions, each one only forwards to a database function that checks the
 * caller's rights in that association, writes in one transaction and audits.
 * The ids and "base" values in the form are untrusted conveniences: the
 * database refuses what the person may not do, and refuses a save that would
 * overwrite someone else's newer edit of the same field.
 */

export interface PageActionState {
  status: "idle" | "done" | "error";
  message?: string;
  code?: GovernanceErrorCode;
  fieldErrors?: FieldErrors;
  at?: number;
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type RpcResult = { data: unknown; error: { code?: string; message?: string; details?: string } | null };

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

/** Field names of draft_conflict / page_incomplete details, in words. */
const FIELD_LABEL: Record<string, string> = {
  name: "le nom",
  short_name: "le nom court",
  accent: "la couleur",
  kind_label: "le type d'association",
  tagline: "l'accroche",
  description: "la présentation",
  meeting_info: "« où et quand »",
  pillars: "les points forts",
  contact_email: "le mail de contact",
  social_links: "les réseaux",
  founded_year: "l'année de création",
  category_ids: "les catégories",
  logo_media_id: "le logo",
  cover_media_id: "la couverture",
  cover_focal: "le cadrage de la couverture",
  gallery: "la galerie",
  team: "l'équipe présentée",
};

function failure(code: GovernanceErrorCode, details?: string): PageActionState {
  let message = governanceErrorMessage(code);
  const fields = (details ?? "")
    .split(",")
    .map((f) => FIELD_LABEL[f])
    .filter(Boolean);
  if (code === "draft_conflict" && fields.length) {
    message = `Quelqu'un de l'équipe a modifié ${fields.join(", ")} entre-temps. Recharge la page pour voir sa version : ce que tu as tapé reste dans le formulaire jusque-là.`;
  }
  if (code === "page_incomplete" && fields.length) {
    message = `Pour publier, il manque ${fields.join(", ")}.`;
  }
  return { status: "error", code, message, at: Date.now() };
}

async function run(
  where: string,
  call: (supabase: Supabase) => PromiseLike<RpcResult>,
  done: string,
): Promise<PageActionState & { data?: unknown }> {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return failure("not_authenticated");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await call(supabase);
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError(where, { code: error.code ?? "", message: "" });
    return failure(code, error.details);
  }
  revalidatePath("/", "layout");
  return { status: "done", message: done, at: Date.now(), data };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** Goes on to the next step of the setup wizard (a same-site path only). */
function continueTo(form: FormData) {
  const next = safeNextPath(text(form, "next"));
  if (next) redirect(next);
}

// ---- The draft, section by section ---------------------------------------------

/**
 * Saves one section of the draft. `section` decides which fields are read;
 * `base` holds what the editor loaded for those fields (the database refuses
 * a field someone else changed since); `known` lists ids the form may use
 * (categories, images) to give clear messages before the database checks.
 */
export async function saveDraftSection(_prev: PageActionState, form: FormData): Promise<PageActionState> {
  const section = text(form, "section");
  const known = String(form.get("known") ?? "").split(",").filter(Boolean);
  let parsed: { values: Record<string, unknown>; errors: FieldErrors };
  if (section === "identity") {
    const identity = parseIdentity(form);
    const categories = form.has("categories_present") ? parseCategories(form, known) : { values: {}, errors: {} };
    parsed = { values: { ...identity.values, ...categories.values }, errors: { ...identity.errors, ...categories.errors } };
  } else if (section === "presentation") {
    const presentation = parsePresentation(form);
    const pillars = parsePillars(form);
    parsed = { values: { ...presentation.values, ...pillars.values }, errors: { ...presentation.errors, ...pillars.errors } };
  } else if (section === "contact") {
    parsed = parseContact(form);
  } else if (section === "appearance") {
    parsed = parseAppearance(form, known);
  } else {
    return failure("profile_invalid");
  }
  if (Object.keys(parsed.errors).length > 0) {
    return {
      status: "error",
      message: "Certains champs sont à corriger (voir en rouge).",
      fieldErrors: parsed.errors,
      at: Date.now(),
    };
  }
  const base = parseJson(text(form, "base"));
  const result = await run(
    "save_association_draft",
    (s) =>
      s.rpc("save_association_draft", {
        p_organization_id: text(form, "organization_id"),
        p_base: (base && typeof base === "object" ? base : {}) as never,
        p_patch: parsed.values as never,
      }),
    "Brouillon enregistré. La page publique ne change qu'à la publication.",
  );
  if (result.status === "done") continueTo(form);
  return result;
}

/** The gallery of the draft: ordered images with optional captions. */
export async function saveGallery(_prev: PageActionState, form: FormData): Promise<PageActionState> {
  const items = parseJson(text(form, "items"));
  const base = parseJson(text(form, "base"));
  if (!Array.isArray(items)) return failure("gallery_invalid");
  const result = await run(
    "set_association_gallery",
    (s) =>
      s.rpc("set_association_gallery", {
        p_organization_id: text(form, "organization_id"),
        p_items: items as never,
        p_base: (Array.isArray(base) ? base : []) as never,
      }),
    "Galerie enregistrée dans le brouillon.",
  );
  if (result.status === "done") continueTo(form);
  return result;
}

/** How the team is presented (order, title shown, hidden): never anyone's rights. */
export async function saveTeamPresentation(_prev: PageActionState, form: FormData): Promise<PageActionState> {
  const entries = parseJson(text(form, "entries"));
  const base = parseJson(text(form, "base"));
  if (!Array.isArray(entries)) return failure("team_invalid");
  const result = await run(
    "set_association_team_presentation",
    (s) =>
      s.rpc("set_association_team_presentation", {
        p_organization_id: text(form, "organization_id"),
        p_entries: entries as never,
        p_base: (Array.isArray(base) ? base : []) as never,
      }),
    "Présentation de l'équipe enregistrée dans le brouillon.",
  );
  if (result.status === "done") continueTo(form);
  return result;
}

// ---- Publication -------------------------------------------------------------------

/** Publishes the revision that was previewed (second factor required). */
export async function publishPage(_prev: PageActionState, form: FormData): Promise<PageActionState> {
  const revision = Number(text(form, "revision"));
  const slug = text(form, "organization_slug");
  const result = await run(
    "publish_association_page",
    (s) =>
      s.rpc("publish_association_page", {
        p_organization_id: text(form, "organization_id"),
        p_expected_revision: Number.isInteger(revision) ? revision : -1,
      }),
    "C'est en ligne : la page publique montre maintenant cette version.",
  );
  if (result.status === "done" && /^[a-z0-9-]+$/.test(slug) && text(form, "after") === "page") {
    redirect(`${routes.association(slug)}?publiee=1`);
  }
  return result;
}

export async function unpublishPage(_prev: PageActionState, form: FormData): Promise<PageActionState> {
  return run(
    "unpublish_association_page",
    (s) =>
      s.rpc("unpublish_association_page", {
        p_organization_id: text(form, "organization_id"),
        p_reason: text(form, "reason") || undefined,
      }),
    "La page est retirée du site. Elle revient à la prochaine publication.",
  );
}

/** A new address; the old one keeps redirecting. */
export async function changeSlug(_prev: PageActionState, form: FormData): Promise<PageActionState> {
  const slug = text(form, "slug").toLowerCase();
  const problem = slugError(slug);
  if (problem) return { status: "error", message: problem, fieldErrors: { slug: problem }, at: Date.now() };
  const result = await run(
    "change_organization_slug",
    (s) => s.rpc("change_organization_slug", { p_organization_id: text(form, "organization_id"), p_slug: slug }),
    "Adresse changée. L'ancienne redirige vers la nouvelle.",
  );
  if (result.status === "done") redirect(`${routes.managePagePublication(slug)}?adresse=1`);
  return result;
}

// ---- Images ------------------------------------------------------------------------

export async function updateMediaAlt(_prev: PageActionState, form: FormData): Promise<PageActionState> {
  const alt = text(form, "alt").replace(/\s+/g, " ").slice(0, 200);
  return run(
    "update_association_media",
    (s) => s.rpc("update_association_media", { p_media_id: text(form, "media_id"), p_alt_text: alt }),
    "Description enregistrée.",
  );
}

/** Takes an unused image out of the library, then deletes its file. */
export async function removeMedia(_prev: PageActionState, form: FormData): Promise<PageActionState> {
  const result = await run(
    "remove_association_media",
    (s) => s.rpc("remove_association_media", { p_media_id: text(form, "media_id") }),
    "Image retirée de la médiathèque.",
  );
  if (result.status === "done" && typeof result.data === "string") {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.storage.from("association-media").remove([result.data]);
    // The row says "removed" already: a file left behind is invisible and listed for cleanup.
    if (error) logDataError("association_media.remove", { code: "storage", message: "" });
  }
  return { status: result.status, message: result.message, code: result.code, at: result.at };
}

// ---- Each member's own public presentation -------------------------------------------

export async function saveMyPublicProfile(_prev: PageActionState, form: FormData): Promise<PageActionState> {
  const bio = String(form.get("bio") ?? "").replace(/\s+/g, " ").trim();
  if (bio.length > 280) {
    return { status: "error", message: "280 caractères au plus.", fieldErrors: { bio: "280 caractères au plus." }, at: Date.now() };
  }
  return run(
    "set_my_public_team_profile",
    (s) =>
      s.rpc("set_my_public_team_profile", {
        p_membership_id: text(form, "membership_id"),
        p_hidden: form.get("visible") !== "on",
        p_show_photo: form.get("show_photo") === "on",
        p_bio: bio || undefined,
      }),
    "Ta présentation publique est enregistrée. Elle s'applique tout de suite sur la page publiée.",
  );
}

// ---- Invitations --------------------------------------------------------------------

export async function renewInvitation(_prev: PageActionState, form: FormData): Promise<PageActionState> {
  return run(
    "renew_invitation",
    (s) => s.rpc("renew_invitation", { p_invitation_id: text(form, "invitation_id") }),
    "Invitation prolongée de 14 jours.",
  );
}

// ---- BDE: moderation and the category catalog --------------------------------------------

export async function withholdPage(_prev: PageActionState, form: FormData): Promise<PageActionState> {
  return run(
    "withhold_association_page",
    (s) =>
      s.rpc("withhold_association_page", { p_organization_id: text(form, "organization_id"), p_reason: text(form, "reason") }),
    "Page retirée du site, avec ta raison. L'asso la voit dans ses réglages.",
  );
}

export async function releasePage(_prev: PageActionState, form: FormData): Promise<PageActionState> {
  return run(
    "release_association_page",
    (s) =>
      s.rpc("release_association_page", { p_organization_id: text(form, "organization_id"), p_reason: text(form, "reason") }),
    "Page rétablie : l'asso peut de nouveau la publier.",
  );
}

export async function createCategory(_prev: PageActionState, form: FormData): Promise<PageActionState> {
  const label = text(form, "label").replace(/\s+/g, " ");
  const slug = text(form, "slug").toLowerCase();
  return run(
    "create_association_category",
    (s) =>
      s.rpc("create_association_category", {
        p_slug: slug,
        p_label: label,
        p_sort_order: Number(text(form, "sort_order")) || 100,
      }),
    "Catégorie ajoutée.",
  );
}

export async function updateCategory(_prev: PageActionState, form: FormData): Promise<PageActionState> {
  return run(
    "update_association_category",
    (s) =>
      s.rpc("update_association_category", {
        p_category_id: text(form, "category_id"),
        p_label: text(form, "label").replace(/\s+/g, " "),
        p_sort_order: Number(text(form, "sort_order")) || 100,
        p_archived: form.get("archived") === "on",
      }),
    "Catégorie enregistrée.",
  );
}
