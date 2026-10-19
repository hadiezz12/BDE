import type { IconName } from "@/components/ui/Icon";
import { routes } from "@/lib/routes";

/**
 * The sections of an association workspace, in nav order. The association
 * slug is part of every URL (see lib/routes.ts).
 *
 * A section appears when the person holds at least one of its keys right
 * now (my_access): navigation follows effective permissions, never a title
 * or an e-mail. Hiding a section is comfort only; the database refuses the
 * actions behind it on its own.
 *
 * `soon`: the module itself arrives in a later phase. Its keys already exist,
 * so a position can carry them, and the section says what it will hold.
 */
export type ManageSectionKey =
  | "home"
  | "team"
  | "roles"
  | "governance"
  | "content"
  | "events"
  | "recruitment"
  | "media"
  | "analytics"
  | "settings";

export interface ManageSection {
  key: ManageSectionKey;
  label: string;
  icon: IconName;
  href: (asso: string) => string;
  /** Any one of these keys opens the section; empty = every member. */
  requires: string[];
  soon?: true;
}

export const MANAGE_SECTIONS: ManageSection[] = [
  { key: "home", label: "Accueil", icon: "home", href: routes.manageHome, requires: [] },
  { key: "team", label: "Équipe", icon: "users", href: routes.manageTeam, requires: ["members.view"] },
  {
    key: "roles",
    label: "Postes et droits",
    icon: "lock",
    href: routes.manageRoles,
    requires: ["positions.manage", "positions.assign", "delegations.manage"],
  },
  {
    key: "governance",
    label: "Gouvernance",
    icon: "shield",
    href: routes.manageGovernance,
    requires: ["governance.view", "audit.view", "governance.succession"],
  },
  {
    key: "content",
    label: "Contenus",
    icon: "file",
    href: routes.manageContent,
    requires: ["posts.create", "posts.edit", "posts.publish"],
    soon: true,
  },
  {
    key: "events",
    label: "Événements",
    icon: "calendar",
    href: routes.manageEvents,
    requires: ["events.create", "events.edit", "events.publish"],
    soon: true,
  },
  {
    key: "recruitment",
    label: "Recrutement",
    icon: "megaphone",
    href: routes.manageRecruitment,
    requires: [
      "recruitment.campaigns.manage",
      "recruitment.questions.manage",
      "recruitment.applications.view",
      "recruitment.applications.review",
      "recruitment.applications.export",
    ],
    soon: true,
  },
  { key: "media", label: "Médias", icon: "image", href: routes.manageMedia, requires: ["media.manage"], soon: true },
  { key: "analytics", label: "Statistiques", icon: "chart", href: routes.manageAnalytics, requires: ["analytics.view"], soon: true },
  {
    key: "settings",
    label: "Réglages",
    icon: "sliders",
    href: routes.manageSettings,
    requires: ["organization.settings.update"],
    soon: true,
  },
];

export function sectionByKey(key: ManageSectionKey): ManageSection {
  return MANAGE_SECTIONS.find((s) => s.key === key)!;
}

/** May someone holding `permissions` open this section? */
export function canOpenSection(key: ManageSectionKey, permissions: readonly string[]): boolean {
  const section = sectionByKey(key);
  return section.requires.length === 0 || section.requires.some((k) => permissions.includes(k));
}

/** The sections to list for someone holding `permissions`. */
export function visibleSections(permissions: readonly string[]): ManageSectionKey[] {
  return MANAGE_SECTIONS.filter((s) => canOpenSection(s.key, permissions)).map((s) => s.key);
}

/** Which section a pathname belongs to ("home" only on the exact workspace URL). */
export function activeSection(pathname: string, asso: string): ManageSectionKey | null {
  const home = routes.manageHome(asso);
  if (pathname === home || pathname === `${home}/`) return "home";
  const match = MANAGE_SECTIONS.find(
    (s) => s.key !== "home" && (pathname === s.href(asso) || pathname.startsWith(`${s.href(asso)}/`)),
  );
  return match?.key ?? null;
}
