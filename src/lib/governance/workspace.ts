import type { AccentKey } from "@/lib/types";
import type { IconName } from "@/components/ui/Icon";
import { routes } from "@/lib/routes";
import { visibleSections, type ManageSectionKey } from "@/components/manage/sections";
import { MEMBERSHIP_STATUS_LABEL, ORGANIZATION_STATUS_LABEL } from "./labels";
import type { AccessOrganization, MyAccess } from "./types";

/**
 * Workspace context derived from my_access: which associations to offer in
 * the switcher and the account menu, and which sections each one opens. The
 * selected association is interface context only (it lives in the URL); the
 * database validates every action against the organization it targets.
 */

export interface WorkspaceRef {
  id: string;
  slug: string;
  name: string;
  shortName?: string;
  accent: AccentKey;
  kind: "bde" | "association";
  /** "Présidence · Trésorerie", "Membre", "Suspendu·e"… */
  detail: string;
  sections: ManageSectionKey[];
  /** Read-only: suspended or archived association, or suspended membership. */
  readOnly: boolean;
}

export function toWorkspaceRef(org: AccessOrganization): WorkspaceRef {
  const titles = org.positions.map((p) => p.title);
  const detail =
    org.membership_status !== "active"
      ? MEMBERSHIP_STATUS_LABEL[org.membership_status]
      : org.status === "suspended" || org.status === "archived"
        ? `Asso ${ORGANIZATION_STATUS_LABEL[org.status].toLowerCase()}`
        : titles.length
          ? titles.join(" · ")
          : "Membre";
  return {
    id: org.id,
    slug: org.slug,
    name: org.name,
    shortName: org.short_name ?? undefined,
    accent: org.accent,
    kind: org.kind,
    detail,
    sections: visibleSections(org.permissions),
    readOnly: org.membership_status !== "active" || org.status === "suspended" || org.status === "archived",
  };
}

/** Every association workspace the person can open (open memberships). */
export function workspaces(access: MyAccess | null): WorkspaceRef[] {
  return (access?.organizations ?? []).map(toWorkspaceRef);
}

/** One line of "Gérer…" in the account menu and the workspace chooser. */
export interface ManageEntry {
  key: string;
  href: string;
  label: string;
  /** Under the label: positions, or what the page is for. */
  detail: string;
  name: string;
  shortName?: string;
  accent: AccentKey;
  /** Platform pages show an icon instead of an association mark. */
  icon?: IconName;
}

export const canUsePlatform = (access: MyAccess | null) => Boolean(access?.platform.includes("platform.organizations.manage"));
export const canUseContinuity = (access: MyAccess | null) => Boolean(access?.platform.includes("platform.recovery"));

/**
 * What the account menu offers: the BDE control center, the guardian's page,
 * then each association where the person has at least one right (a plain
 * member's workspace is still reachable from /manage).
 */
export function manageEntries(access: MyAccess | null): ManageEntry[] {
  if (!access) return [];
  const entries: ManageEntry[] = [];
  if (canUsePlatform(access)) {
    entries.push({
      key: "platform",
      href: routes.managePlatform,
      label: "Centre de contrôle BDE",
      detail: "Assos, présidences, passations",
      name: "BDE",
      accent: "rose",
      icon: "grid",
    });
  }
  if (canUseContinuity(access)) {
    entries.push({
      key: "continuity",
      href: routes.manageContinuity,
      label: "Continuité",
      detail: "Garant·e de continuité",
      name: "Continuité",
      accent: "bleu",
      icon: "shield",
    });
  }
  for (const org of access.organizations) {
    if (org.permissions.length === 0) continue;
    const ref = toWorkspaceRef(org);
    entries.push({
      key: org.id,
      href: routes.manageHome(org.slug),
      label: `Gérer ${org.short_name ?? org.name}`,
      detail: ref.detail,
      name: org.name,
      shortName: org.short_name ?? undefined,
      accent: org.accent,
    });
  }
  return entries;
}
