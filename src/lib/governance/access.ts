import "server-only";
import { cache } from "react";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError, toDataError } from "@/lib/data/errors";
import { governanceErrorCode, type GovernanceErrorCode } from "./messages";
import type { AccessOrganization, MyAccess } from "./types";

/**
 * WHAT may the signed-in person do (authorization), as the database computes
 * it right now: public.my_access() evaluates every open membership, current
 * mandate and backed delegation at request time. Nothing is cached across
 * requests, so a revoked right disappears on the next page load, without
 * signing out.
 *
 * The interface uses this to choose what to show. It is never the check
 * itself: each action is refused by the database when the right is missing.
 */
export const getMyAccess = cache(async (): Promise<MyAccess | null> => {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_access");
  if (error) {
    logDataError("my_access", error);
    throw toDataError(error);
  }
  // null when a second factor is enrolled but this session has not used it.
  return (data as unknown as MyAccess | null) ?? null;
});

/** The caller's membership of the organization with this slug (open memberships only). */
export async function getAccessOrganization(slug: string): Promise<AccessOrganization | null> {
  const access = await getMyAccess();
  return access?.organizations.find((o) => o.slug === slug) ?? null;
}

export function hasPlatform(access: MyAccess | null, key: string): boolean {
  return Boolean(access?.platform.includes(key));
}

/**
 * Calls a read function and returns its payload, or the refusal code when
 * the database says no (the page then shows a state instead of crashing).
 */
export async function readGovernance<T>(
  name: string,
  call: (supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) => PromiseLike<{
    data: unknown;
    error: { code?: string; message?: string } | null;
  }>,
): Promise<{ ok: true; data: T } | { ok: false; code: GovernanceErrorCode }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await call(supabase);
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError(name, { code: error.code ?? "", message: "" });
    return { ok: false, code };
  }
  return { ok: true, data: data as T };
}
