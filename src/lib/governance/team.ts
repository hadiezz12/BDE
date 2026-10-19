import type { OrganizationTeam, TeamMember, TeamPosition } from "./types";

/**
 * Pure helpers over the organization_team payload, for display choices
 * only (which positions to offer, which boxes to grey). The database applies
 * the same rules on its own when the form comes back.
 */

/** Keys the person holds here through a current position: the ceiling of what they may hand out. */
export function myPositionKeys(team: OrganizationTeam): string[] {
  const me = team.members.find((m) => m.is_you);
  const held = new Set(me?.assignments.filter((a) => !a.upcoming).map((a) => a.position_id));
  return [...new Set(team.positions.filter((p) => held.has(p.id)).flatMap((p) => p.permissions))];
}

/** Ordinary positions whose every right is within the ceiling (offices pass by a succession). */
export function assignablePositions(team: OrganizationTeam, ceiling: readonly string[]): TeamPosition[] {
  return team.positions.filter((p) => p.office === null && p.permissions.every((k) => ceiling.includes(k)));
}

/** "Présidence · Trésorerie", current mandates first. */
export function memberTitles(member: TeamMember): string {
  const current = member.assignments.filter((a) => !a.upcoming).map((a) => a.title);
  return current.length ? current.join(" · ") : "Membre";
}

/** Mandates ending within `days` days (for the "expire bientôt" counter). */
export function expiringAssignments(team: OrganizationTeam, days = 30, now = new Date()) {
  const limit = now.getTime() + days * 86_400_000;
  return team.members.flatMap((m) =>
    m.assignments.filter((a) => !a.upcoming && Date.parse(a.ends_at) <= limit).map((a) => ({ member: m, assignment: a })),
  );
}

/** Labels of these keys, in the catalog's order (never raw keys). */
export function permissionLabels(keys: readonly string[], catalog: readonly { key: string; label: string }[]): string[] {
  return catalog.filter((p) => keys.includes(p.key)).map((p) => p.label);
}
