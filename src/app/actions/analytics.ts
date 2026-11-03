"use server";

import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { logDataError } from "@/lib/data/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { governanceErrorCode, governanceErrorMessage, type GovernanceErrorCode } from "@/lib/governance/messages";
import { isDayKey } from "@/lib/analytics/period";
import { routes } from "@/lib/routes";
import type { GovernanceActionState } from "./governance";

/**
 * Actions of the platform statistics (Phase 13): the small-group threshold
 * and a recompute of past days. Both forward to database functions that
 * check platform.analytics.configure and the second factor themselves, and
 * record the change in the audit. Values from the form are untrusted.
 */

const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

function failure(code: GovernanceErrorCode): GovernanceActionState {
  return { status: "error", code, message: governanceErrorMessage(code), at: Date.now() };
}

async function signedIn() {
  const ctx = await getAuthContext();
  return ctx.status === "authenticated";
}

export async function setAnalyticsThreshold(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const value = Number(text(form, "min_group_size"));
  if (!Number.isInteger(value) || value < 3 || value > 20) return failure("analytics_threshold_invalid");
  if (!(await signedIn())) return failure("not_authenticated");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_analytics_min_group_size", { p_value: value });
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError("set_analytics_min_group_size", { code: error.code ?? "", message: "" });
    return failure(code);
  }
  revalidatePath(routes.managePlatformAnalytics);
  return { status: "done", message: `Seuil réglé à ${value} : les petits groupes sous ${value} sont masqués partout, dès maintenant.`, at: Date.now() };
}

export async function recomputeAnalytics(_prev: GovernanceActionState, form: FormData): Promise<GovernanceActionState> {
  const from = text(form, "from");
  const to = text(form, "to");
  if (!isDayKey(from) || !isDayKey(to) || from > to) return failure("analytics_period_invalid");
  if (!(await signedIn())) return failure("not_authenticated");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("recompute_analytics", { p_from: from, p_to: to });
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError("recompute_analytics", { code: error.code ?? "", message: "" });
    return failure(code);
  }
  const result = (data ?? {}) as { replaced?: number; written?: number };
  revalidatePath(routes.managePlatformAnalytics);
  return {
    status: "done",
    message: `Recalcul fait du ${from} au ${to} : ${result.written ?? 0} ligne(s) de comptes écrites (${result.replaced ?? 0} remplacée(s)).`,
    at: Date.now(),
  };
}
