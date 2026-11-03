"use server";

import { revalidatePath } from "next/cache";
import type { SavedKind } from "@/lib/types";
import { getAuthContext } from "@/lib/auth/context";
import { logDataError } from "@/lib/data/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { governanceErrorCode, governanceErrorMessage, type GovernanceErrorCode } from "@/lib/governance/messages";
import type { GovernanceActionState } from "./governance";

/**
 * Actions of Phase 12 for students: their saved items and interests (their
 * own rows only, through public.save_item and public.set_my_interests; the
 * BDE's spotlights are in ./spotlights). Ids in forms are untrusted; the
 * database checks everything again.
 */

export interface SaveActionState extends GovernanceActionState {
  /** The state the database confirmed (never assumed before it answered). */
  saved?: boolean;
}

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const KINDS: SavedKind[] = ["association", "post", "event", "campaign", "position"];

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

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
  // Saved marks, the student's space and the front page read live data: render fresh.
  revalidatePath("/", "layout");
  return { ok: true, data };
}

const SAVED_MESSAGE: Record<SavedKind, [string, string]> = {
  association: ["Asso enregistrée dans tes enregistrements.", "Asso retirée de tes enregistrements."],
  post: ["Article enregistré pour plus tard.", "Article retiré de tes enregistrements."],
  event: ["Événement enregistré. Ce n'est pas une inscription.", "Événement retiré de tes enregistrements."],
  campaign: ["Recrutement enregistré. Ce n'est pas une candidature.", "Recrutement retiré de tes enregistrements."],
  position: ["Poste enregistré. Ce n'est pas une candidature.", "Poste retiré de tes enregistrements."],
};

/** Save or unsave one public item (form: kind, id, saved = "1" | "0"). */
export async function saveItem(_prev: SaveActionState, form: FormData): Promise<SaveActionState> {
  const kind = text(form, "kind") as SavedKind;
  const id = text(form, "id");
  if (!KINDS.includes(kind) || !UUID.test(id)) return failure("item_invalid");
  const wanted = text(form, "saved") === "1";
  const result = await call("save_item", (s) => s.rpc("save_item", { p_kind: kind, p_id: id, p_saved: wanted }));
  if (!result.ok) return result.state;
  const saved = Boolean(result.data);
  return { status: "done", saved, message: SAVED_MESSAGE[kind][saved ? 0 : 1], at: Date.now() };
}

/** Replace my interests with the ticked categories (form: interest, repeated). */
export async function setMyInterests(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const slugs = [...new Set(form.getAll("interest").map(String))].filter((s) => SLUG.test(s));
  if (slugs.length > 8) return failure("interests_limit");
  const result = await call("set_my_interests", (s) => s.rpc("set_my_interests", { p_category_slugs: slugs }));
  if (!result.ok) return result.state;
  const n = Number(result.data ?? 0);
  return {
    status: "done",
    message: n === 0 ? "Plus aucun centre d'intérêt : rien ne te sera suggéré." : "Centres d'intérêt enregistrés.",
    at: Date.now(),
  };
}
