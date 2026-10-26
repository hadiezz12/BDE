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
    sections: visibleSections(org.permissions, Boolean(org.recruitment_committee)),
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

/**
 * Platform keys that open the BDE control center. Each of its pages checks
 * its own key (associations, moderation, featured posts), and every function
 * they call checks it again in the database.
 */
const PLATFORM_CENTER_KEYS = ["platform.organizations.manage", "platform.content.moderate", "platform.content.feature"];

export const canUsePlatform = (access: MyAccess | null) =>
  Boolean(access?.platform.some((key) => PLATFORM_CENTER_KEYS.includes(key)));
export const canUseContinuity = (access: MyAccess | null) => Boolean(access?.platform.includes("platform.recovery"));
/** Phase 9: someone who reviews applications somewhere (a committee seat or a reading key). */
export const canReviewApplications = (access: MyAccess | null) =>
  Boolean(access?.organizations.some((o) => o.recruitment_committee || o.permissions.includes("recruitment.applications.view")));
/** Phase 9: the privacy officer (data-rights requests about applications). */
export const canHandlePrivacy = (access: MyAccess | null) => Boolean(access?.platform.includes("platform.privacy.requests"));

/** Under "Centre de contrôle BDE": what this person can do there. */
function platformDetail(access: MyAccess): string {
  if (access.platform.includes("platform.organizations.manage")) return "Assos, présidences, passations";
  const parts: string[] = [];
  if (access.platform.includes("platform.content.moderate")) parts.push("Modération");
  if (access.platform.includes("platform.content.feature")) parts.push(parts.length ? "à la une" : "À la une");
  return parts.join(", ");
}

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
      detail: platformDetail(access),
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
  if (canReviewApplications(access)) {
    entries.push({
      key: "review",
      href: routes.manageReviewWork,
      label: "Mes évaluations",
      detail: "Candidatures à évaluer, entretiens, décisions",
      name: "Évaluations",
      accent: "rose",
      icon: "list",
    });
  }
  if (canHandlePrivacy(access)) {
    entries.push({
      key: "privacy",
      href: routes.managePrivacy,
      label: "Données des candidat·es",
      detail: "Demandes d'accès et d'effacement",
      name: "Données",
      accent: "bleu",
      icon: "lock",
    });
  }
  for (const org of access.organizations) {
    if (org.permissions.length === 0 && !org.recruitment_committee) continue;
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
