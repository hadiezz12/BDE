import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError, toDataError } from "@/lib/data/errors";
import { readGovernance } from "./access";
import type {
  GovernanceEvent,
  GovernanceInbox,
  GovernanceOverview,
  MemberAccess,
  OrganizationGovernance,
  OrganizationTeam,
  PermissionDefinition,
  PlatformOrganization,
  PositionTemplate,
} from "./types";

/**
 * Loaders of the governance screens. Each one calls a database function
 * that checks the caller's rights itself and returns only what they may
 * see; a refusal comes back as `{ ok: false, code }`, never as data.
 * Memoised per request (React cache), never across requests.
 */

export const getOrganizationTeam = cache((organizationId: string) =>
  readGovernance<OrganizationTeam>("organization_team", (s) =>
    s.rpc("organization_team", { p_organization_id: organizationId }),
  ),
);

export const getMemberAccess = cache((membershipId: string) =>
  readGovernance<MemberAccess>("member_access", (s) => s.rpc("member_access", { p_membership_id: membershipId })),
);

export const getOrganizationGovernance = cache((organizationId: string) =>
  readGovernance<OrganizationGovernance>("organization_governance", (s) =>
    s.rpc("organization_governance", { p_organization_id: organizationId }),
  ),
);

export const getGovernanceOverview = cache(() =>
  readGovernance<GovernanceOverview>("governance_overview", (s) => s.rpc("governance_overview")),
);

export const getPlatformOrganizations = cache(() =>
  readGovernance<PlatformOrganization[]>("platform_organizations", (s) => s.rpc("platform_organizations")),
);

export const getGovernanceInbox = cache(() =>
  readGovernance<GovernanceInbox>("my_governance_inbox", (s) => s.rpc("my_governance_inbox")),
);

export const getGovernanceHistory = cache((organizationId: string | null, limit = 50) =>
  readGovernance<GovernanceEvent[]>("governance_history", (s) =>
    s.rpc("governance_history", organizationId ? { p_organization_id: organizationId, p_limit: limit } : { p_limit: limit }),
  ),
);

/** The permission catalog (labels, categories, flags), in display order. */
export const getPermissionCatalog = cache(async (): Promise<PermissionDefinition[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("permissions")
    .select("key, scope, category, label, description, is_grantable, is_delegable, is_sensitive, module_ready, sort_order")
    .order("sort_order");
  if (error) {
    logDataError("permissions", error);
    throw toDataError(error);
  }
  return data as PermissionDefinition[];
});

/** Templates a position can start from (the protected offices are left out). */
export const getPositionTemplates = cache(async (): Promise<PositionTemplate[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("position_templates")
    .select("key, label, description, office, sort_order, position_template_permissions(permission_key)")
    .is("office", null)
    .order("sort_order");
  if (error) {
    logDataError("position_templates", error);
    throw toDataError(error);
  }
  return data.map((t) => ({
    key: t.key,
    label: t.label,
    description: t.description,
    office: null,
    permissions: t.position_template_permissions.map((p) => p.permission_key),
  }));
});
