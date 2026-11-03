"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { logDataError } from "@/lib/data/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { endOfParisDay } from "@/lib/governance/labels";
import { governanceErrorCode, governanceErrorMessage, type GovernanceErrorCode } from "@/lib/governance/messages";
import type { GovernanceActionState } from "./governance";

/**
 * The BDE's spotlights on the campus front page (Phase 12), the same
 * featuring as articles and events: a recruitment "à la une" (three at
 * most), one association "à l'honneur" (public.set_campaign_prominence,
 * public.set_association_prominence: platform.content.feature, second
 * factor, limits, end date, audited). The database checks everything again.
 */

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type RpcResult = { data: unknown; error: { code?: string; message?: string } | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
  // The front page and the platform pages read live data: render fresh.
  revalidatePath("/", "layout");
  return { ok: true, data };
}

/** The end date of a spotlight: the chosen Paris day at 23:59, or none. */
function until(form: FormData): { ok: true; value: string | null } | { ok: false } {
  const raw = text(form, "until");
  if (!raw) return { ok: true, value: null };
  const value = endOfParisDay(raw);
  return value ? { ok: true, value } : { ok: false };
}

export async function setCampaignProminence(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const id = text(form, "campaign_id");
  if (!UUID.test(id)) return failure("campaign_not_found");
  const prominence = text(form, "prominence") === "featured" ? "featured" : "normal";
  const end = until(form);
  if (!end.ok) return failure("prominence_period");
  const result = await call("set_campaign_prominence", (s) =>
    s.rpc("set_campaign_prominence", { p_campaign_id: id, p_prominence: prominence, p_until: end.value ?? undefined }),
  );
  if (!result.ok) {
    // Here it means the campaign is not open or about to open any more.
    if (result.state.code === "campaign_not_open") {
      return failure("campaign_not_open", "Seul un recrutement en ligne, ouvert ou sur le point d'ouvrir, peut passer à la une.");
    }
    return result.state;
  }
  return {
    status: "done",
    message: prominence === "featured" ? "Recrutement mis à la une du campus." : "Recrutement retiré de la une.",
    at: Date.now(),
  };
}

export async function setAssociationProminence(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const id = text(form, "organization_id");
  if (!UUID.test(id)) return failure("organization_not_found");
  const prominence = text(form, "prominence") === "featured" ? "featured" : "normal";
  const end = until(form);
  if (!end.ok) return failure("prominence_period");
  const result = await call("set_association_prominence", (s) =>
    s.rpc("set_association_prominence", { p_organization_id: id, p_prominence: prominence, p_until: end.value ?? undefined }),
  );
  if (!result.ok) {
    if (result.state.code === "prominence_limit") {
      return failure("prominence_limit", "Une seule asso à l'honneur à la fois : retire d'abord celle qui l'est.");
    }
    return result.state;
  }
  return {
    status: "done",
    message: prominence === "featured" ? "Asso mise à l'honneur sur la une du campus." : "L'asso n'est plus à l'honneur.",
    at: Date.now(),
  };
}
