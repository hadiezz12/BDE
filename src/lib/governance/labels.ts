/**
 * Words for the governance screens. Pure module (no path-alias imports): the
 * unit tests load it with plain Node.
 *
 * Every label here names something the database decides; nothing in the
 * interface infers a right from these words.
 */

export type Office = "association_president" | "bde_president" | "bde_vice_president";

export const OFFICE_LABEL: Record<Office, string> = {
  association_president: "Présidence",
  bde_president: "Présidence du BDE",
  bde_vice_president: "Vice-présidence du BDE",
};

export type TransitionKind = "association_succession" | "association_appointment" | "bde_succession" | "bde_recovery";

export const TRANSITION_KIND_LABEL: Record<TransitionKind, string> = {
  association_succession: "Passation de présidence",
  association_appointment: "Nomination par le BDE",
  bde_succession: "Passation du BDE",
  bde_recovery: "Reprise d'urgence par le garant",
};

export type TransitionStatus = "open" | "completed" | "cancelled" | "expired";

export const TRANSITION_STATUS_LABEL: Record<TransitionStatus, string> = {
  open: "En cours",
  completed: "Validée",
  cancelled: "Annulée",
  expired: "Expirée",
};

export type OrganizationStatus = "setup" | "active" | "suspended" | "archived";

export const ORGANIZATION_STATUS_LABEL: Record<OrganizationStatus, string> = {
  setup: "En préparation",
  active: "Active",
  suspended: "Suspendue",
  archived: "Archivée",
};

export type MembershipStatus = "active" | "suspended" | "ended";

export const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, string> = {
  active: "Membre",
  suspended: "Suspendu·e",
  ended: "Parti·e",
};

export const PERMISSION_CATEGORY_LABEL: Record<string, string> = {
  team: "Équipe",
  roles: "Postes et délégations",
  governance: "Gouvernance",
  settings: "Page et réglages",
  content: "Contenus",
  events: "Événements",
  media: "Médias",
  recruitment: "Recrutement",
  insights: "Statistiques",
  platform: "Plateforme",
};

export const PERMISSION_CATEGORY_ORDER = [
  "team",
  "roles",
  "governance",
  "settings",
  "content",
  "events",
  "media",
  "recruitment",
  "insights",
  "platform",
];

/** Why someone has, or lacks, a key (private.explain_permission). */
export const EXPLANATION_LABEL: Record<string, string> = {
  position: "Par un poste",
  delegation: "Par une délégation temporaire",
  not_member: "Ne fait pas partie de l'asso",
  membership_suspended: "Membre suspendu·e : aucun droit",
  organization_suspended: "Asso suspendue : lecture seule",
  organization_archived: "Asso archivée : lecture seule",
  organization_setup: "Asso en préparation",
  mandate_not_started: "Mandat pas encore commencé",
  mandate_ended: "Mandat terminé",
  delegator_lost_permission: "La personne qui a délégué n'a plus ce droit",
  delegation_ended: "Délégation terminée",
  no_grant: "Aucun poste ne donne ce droit",
};

export const SOURCE_LABEL: Record<string, string> = {
  bootstrap: "Mise en place initiale",
  appointment: "Attribué par l'équipe",
  invitation: "Par invitation",
  succession: "Par passation",
  emergency: "Nommé·e par le BDE",
  recovery: "Reprise d'urgence",
};

export const APPROVAL_CAPACITY_LABEL: Record<string, string> = {
  bde_president: "Présidence du BDE",
  bde_vice_president: "Vice-présidence du BDE",
  guardian: "Garant·e de continuité (poste vacant)",
};

/** One line per audit action: "<actor> <phrase>". */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  governance_bootstrapped: "a mis en place la première direction du BDE",
  guardian_provisioned: "a nommé le ou la garant·e de continuité",
  organization_created: "a créé l'asso",
  organization_status_changed: "a changé le statut de l'asso",
  position_created: "a créé un poste",
  position_updated: "a modifié un poste",
  position_archived: "a retiré un poste",
  position_assigned: "a attribué un poste",
  position_revoked: "a mis fin à un poste",
  membership_status_changed: "a changé le statut d'un membre",
  member_invited: "a envoyé une invitation",
  invitation_revoked: "a annulé une invitation",
  invitation_accepted: "a accepté une invitation",
  invitation_declined: "a refusé une invitation",
  delegation_created: "a délégué des droits",
  delegation_revoked: "a mis fin à une délégation",
  association_succession_started: "a proposé sa succession",
  association_appointment_started: "a proposé une présidence (BDE)",
  bde_succession_started: "a proposé une passation du BDE",
  bde_succession_approved: "a approuvé la passation du BDE",
  bde_succession_approval_withdrawn: "a retiré son approbation",
  guardian_recovery_started: "a lancé une reprise d'urgence",
  leadership_candidacy_accepted: "a accepté la présidence proposée",
  leadership_candidacy_declined: "a refusé la présidence proposée",
  leadership_transition_completed: "a validé la passation",
  leadership_transition_cancelled: "a annulé une passation",
  association_president_removed: "a mis fin à une présidence en urgence",
  bde_office_removed: "a mis fin à un mandat du BDE en urgence",
  // Phase 5: the public page
  association_profile_updated: "a modifié le brouillon de la page",
  association_gallery_updated: "a modifié la galerie (brouillon)",
  association_public_team_updated: "a modifié la présentation de l'équipe (brouillon)",
  association_page_published: "a publié la page",
  association_page_unpublished: "a retiré la page du site",
  association_page_withheld: "a suspendu la page (modération BDE)",
  association_page_released: "a rétabli la page (modération BDE)",
  organization_slug_changed: "a changé l'adresse de la page",
  association_media_uploaded: "a ajouté une image",
  association_media_removed: "a retiré une image",
  public_team_profile_updated: "a changé sa présentation publique",
  invitation_renewed: "a prolongé une invitation",
  association_category_created: "a créé une catégorie d'assos",
  association_category_updated: "a modifié une catégorie d'assos",
  association_category_archived: "a retiré une catégorie d'assos",
  association_category_restored: "a rétabli une catégorie d'assos",
};

/** Confirmations shown by a page after an answer removed the card it came from (?fait=…). */
export const DONE_MESSAGES = {
  "passation-validee": "C'est fait : la passation est validée. Le nouveau mandat commence à la date prévue.",
  "accord-enregistre": "Accord enregistré. La passation aboutira dès que les autres étapes seront faites.",
  "proposition-refusee": "Tu as refusé : la passation est annulée.",
  "approbation-enregistree": "Approbation enregistrée. La passation aboutira quand toutes les étapes seront faites.",
  "passation-bde-validee": "Approbation enregistrée : la passation du BDE est validée.",
  "invitation-refusee": "Invitation refusée.",
} as const;

export type DoneCode = keyof typeof DONE_MESSAGES;

export function doneMessage(code: string | string[] | undefined): string | null {
  const key = Array.isArray(code) ? code[0] : code;
  return key && key in DONE_MESSAGES ? DONE_MESSAGES[key as DoneCode] : null;
}

/**
 * Default end of a mandate: the next 31 August, 23:59 in Paris (the academic
 * year ends there). A label only helps people pick a date: authorization
 * always compares the exact timestamp.
 */
export function academicYearEnd(now = new Date()): Date {
  const year = now.getUTCMonth() > 7 || (now.getUTCMonth() === 7 && now.getUTCDate() >= 31) ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  // 31 August 23:59 Paris = 21:59 UTC (summer time, UTC+2).
  return new Date(Date.UTC(year, 7, 31, 21, 59, 0));
}

/**
 * The end date a mandate form suggests: this academic year's end, or the
 * next one when this one ends within 30 days (stays within the 13-month
 * limit of a leadership mandate that starts now).
 */
export function defaultMandateEnd(now = new Date()): Date {
  const end = academicYearEnd(now);
  return end.getTime() - now.getTime() < 30 * 86_400_000 ? academicYearEnd(new Date(end.getTime() + 86_400_000)) : end;
}

/** Default end of a delegation: two weeks from now (92 days at most). */
export function defaultDelegationEnd(now = new Date()): Date {
  return new Date(now.getTime() + 14 * 86_400_000);
}

/** "2026–2027" for the academic year a date falls in. */
export function academicYearLabel(date: Date): string {
  const start = date.getUTCMonth() >= 8 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return `${start}–${start + 1}`;
}

/** yyyy-mm-dd for date inputs, in Paris. */
export function toDateInput(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** A yyyy-mm-dd from a date input read as the end of that day in Paris (23:59). */
export function endOfParisDay(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  // Paris is UTC+1 or UTC+2; pick the offset that keeps the wall-clock 23:59.
  for (const offset of [2, 1]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, 23 - offset, 59, 0));
    const wall = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(candidate);
    if (wall === "23:59") return candidate.toISOString();
  }
  return null;
}

/** A yyyy-mm-dd read as the start of that day in Paris (00:00). */
export function startOfParisDay(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  for (const offset of [2, 1]) {
    const candidate = new Date(Date.UTC(y, m - 1, d, -offset, 0, 0));
    const wall = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(candidate);
    if (wall === "00:00") return candidate.toISOString();
  }
  return null;
}
