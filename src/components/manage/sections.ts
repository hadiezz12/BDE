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
  | "communications"
  | "analytics"
  | "continuity"
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
    requires: ["posts.create", "posts.edit", "posts.approve", "posts.publish", "posts.settings"],
  },
  {
    key: "events",
    label: "Événements",
    icon: "calendar",
    href: routes.manageEvents,
    requires: ["events.create", "events.edit", "events.publish", "events.attendees.view"],
  },
  {
    key: "recruitment",
    label: "Recrutement",
    icon: "megaphone",
    href: routes.manageRecruitment,
    // Phase 8: campaigns, positions, the form, publication. Phase 9: the
    // review keys, and a live committee appointment (see canOpenRecruitment).
    requires: [
      "recruitment.campaigns.manage",
      "recruitment.questions.manage",
      "recruitment.campaigns.publish",
      "recruitment.applications.view",
      "recruitment.committee.manage",
    ],
  },
  { key: "media", label: "Médias", icon: "image", href: routes.manageMedia, requires: ["media.manage"] },
  { key: "communications", label: "Messages", icon: "mail", href: routes.manageCommunications, requires: ["communications.send"] },
  { key: "analytics", label: "Statistiques", icon: "chart", href: routes.manageAnalytics, requires: ["analytics.view"], soon: true },
  {
    key: "continuity",
    label: "Passation",
    icon: "history",
    href: routes.manageHandover,
    // The same keys organization_continuity checks: the presidency, the team, or one handover area.
    requires: ["governance.view", "governance.succession", "members.manage", "posts.approve", "events.edit", "recruitment.committee.manage"],
  },
  {
    key: "settings",
    label: "Page publique",
    icon: "globe",
    href: routes.manageSettings,
    requires: ["organization.settings.update", "organization.page.publish"],
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

/**
 * The recruitment section also opens to someone appointed to one of the
 * association's recruitment committees (my_access → recruitment_committee),
 * who may hold no key at all: what they see is limited by the appointment.
 */
export function canOpenRecruitment(membership: { permissions: readonly string[]; recruitment_committee?: boolean }): boolean {
  return canOpenSection("recruitment", membership.permissions) || Boolean(membership.recruitment_committee);
}

/** The sections to list for someone holding `permissions` (and maybe a committee seat). */
export function visibleSections(permissions: readonly string[], recruitmentCommittee = false): ManageSectionKey[] {
  return MANAGE_SECTIONS.filter((s) => canOpenSection(s.key, permissions) || (s.key === "recruitment" && recruitmentCommittee)).map(
    (s) => s.key,
  );
}

/** Which section a pathname belongs to ("home" only on the exact workspace URL). */
export function activeSection(pathname: string, asso: string): ManageSectionKey | null {
  const home = routes.manageHome(asso);
  if (pathname === home || pathname === `${home}/`) return "home";
  // The setup wizard is part of the page editor.
  if (pathname.startsWith(routes.manageSetup(asso))) return "settings";
  const match = MANAGE_SECTIONS.find(
    (s) => s.key !== "home" && (pathname === s.href(asso) || pathname.startsWith(`${s.href(asso)}/`)),
  );
  return match?.key ?? null;
}
