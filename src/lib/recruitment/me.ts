import "server-only";
import { cache } from "react";
import { getAuthContext } from "@/lib/auth/context";
import { readGovernance } from "@/lib/governance/access";
import type { GovernanceErrorCode } from "@/lib/governance/messages";
import type { ApplicationItem } from "@/lib/types";
import { toApplicationItem, type MyApplicationPayload, type MyApplicationsItemPayload } from "./model";

/**
 * A student's own applications. Each read goes through the student's own
 * session: public.my_applications / my_application return the caller's rows
 * only (and refuse anyone else's with application_not_found, saying nothing
 * about whether it exists). Visitors get nothing, never an error.
 */

export const getMyApplications = cache(async (): Promise<ApplicationItem[]> => {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return [];
  const result = await readGovernance<MyApplicationsItemPayload[]>("my_applications", (s) => s.rpc("my_applications"));
  if (!result.ok) return [];
  const now = new Date();
  return (result.data ?? []).map((a) => toApplicationItem(a, now));
});

export const getMyApplication = cache(
  async (id: string): Promise<{ ok: true; data: MyApplicationPayload } | { ok: false; code: GovernanceErrorCode }> => {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return { ok: false, code: "application_not_found" };
    const ctx = await getAuthContext();
    if (ctx.status !== "authenticated") return { ok: false, code: "not_authenticated" };
    return readGovernance<MyApplicationPayload>("my_application", (s) => s.rpc("my_application", { p_application_id: id }));
  },
);

/** The student's application to one campaign that still counts (draft or submitted), if any. */
export function applicationsFor(applications: ApplicationItem[], campaignId: string): ApplicationItem[] {
  return applications.filter((a) => a.campaign.id === campaignId && a.status !== "retiree");
}
