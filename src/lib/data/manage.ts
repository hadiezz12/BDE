import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getAuthContext, type AssuranceLevel } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { SupabaseConfigError } from "@/lib/supabase/env";
import { getMyAccess } from "@/lib/governance/access";
import { toWorkspaceRef, workspaces, type WorkspaceRef } from "@/lib/governance/workspace";
import type { AccessOrganization, MyAccess } from "@/lib/governance/types";
import type { OrganizationStatus } from "@/lib/governance/labels";
import type { AccentKey } from "@/lib/types";
import { logDataError, toDataError } from "./errors";
import { getAssociation } from "./associations";

/**
 * Access to an association workspace (/manage/[asso]). The check lives here,
 * next to the data, because a layout does not stop its pages from rendering:
 * the [asso] layout shows the gate, and every section page asks again through
 * getManageContext() before reading anything.
 *
 * Who may open it comes from the database (public.my_access): an open
 * membership of that organization. What each section shows comes from the
 * person's effective permissions there. Both are only the interface's
 * choice of what to display: every read and every action is checked again
 * by the database functions themselves.
 */

/** What anyone allowed to see the organization row may know about it. */
export interface WorkspaceOrganization {
  id: string;
  slug: string;
  name: string;
  shortName?: string;
  accent: AccentKey;
  kind: "bde" | "association";
  status: OrganizationStatus;
}

export interface ManageContext {
  organization: WorkspaceOrganization;
  /** The person's membership, positions and permissions here. */
  membership: AccessOrganization;
  workspace: WorkspaceRef;
  /** Every association workspace of the person (for the switcher). */
  managed: WorkspaceRef[];
  access: MyAccess;
  userId: string;
  aal: AssuranceLevel;
  /** Does the person hold this key here right now? (Display only.) */
  can: (key: string) => boolean;
}

export type ManageGate =
  | ({ status: "ok" } & ManageContext)
  | { status: "login"; organization: WorkspaceOrganization }
  | { status: "forbidden"; organization: WorkspaceOrganization; managed: WorkspaceRef[] };

/**
 * The organization with this slug, as the caller may see it (row level
 * security: public when active or archived, otherwise members and the
 * platform's governance only). `null` when it is unknown or hidden.
 */
export const getWorkspaceOrganization = cache(async (slug: string): Promise<WorkspaceOrganization | null> => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;
  let supabase;
  try {
    supabase = await createSupabaseServerClient();
  } catch (error) {
    if (error instanceof SupabaseConfigError) return null;
    throw error;
  }
  const { data, error } = await supabase
    .from("organizations")
    .select("id, slug, name, short_name, accent, kind, status")
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    logDataError("organizations.by_slug", error);
    throw toDataError(error);
  }
  if (!data) return null;
  return {
    id: data.id,
    slug: data.slug,
    name: data.name,
    shortName: data.short_name ?? undefined,
    accent: data.accent as AccentKey,
    kind: data.kind as "bde" | "association",
    status: data.status as OrganizationStatus,
  };
});

/** Every association workspace of the current person (empty for visitors). */
export const getManagedWorkspaces = cache(async (): Promise<WorkspaceRef[]> => workspaces(await getMyAccess()));

/**
 * Who may open /manage/[slug]. `null` when no visible organization has this
 * slug. Memoised per request, so the layout and the page share one lookup.
 */
export const getManageGate = cache(async (slug: string): Promise<ManageGate | null> => {
  const organization = await getWorkspaceOrganization(slug);
  if (!organization) return null;
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return { status: "login", organization };
  const access = await getMyAccess();
  const managed = workspaces(access);
  const membership = access?.organizations.find((o) => o.id === organization.id);
  if (!access || !membership) return { status: "forbidden", organization, managed };
  return {
    status: "ok",
    organization,
    membership,
    workspace: toWorkspaceRef(membership),
    managed,
    access,
    userId: ctx.userId,
    aal: ctx.aal,
    can: (key: string) => membership.permissions.includes(key),
  };
});

/**
 * For section pages under /manage/[asso]. Call it first, before any data:
 *   const ctx = await getManageContext(asso);
 *   if (!ctx) return null; // the layout is already showing the access gate
 * Unknown slug → notFound().
 */
export async function getManageContext(slug: string): Promise<ManageContext | null> {
  const gate = await getManageGate(slug);
  if (!gate) notFound();
  if (gate.status !== "ok") return null;
  return {
    organization: gate.organization,
    membership: gate.membership,
    workspace: gate.workspace,
    managed: gate.managed,
    access: gate.access,
    userId: gate.userId,
    aal: gate.aal,
    can: gate.can,
  };
}

/** The association's public page, when the site has one for it yet. */
export async function getPublicHref(slug: string): Promise<string | null> {
  return (await getAssociation(slug)) ? `/associations/${slug}` : null;
}
