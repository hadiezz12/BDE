/**
 * What a refused governance action says to the person who tried it. Pure
 * module (no path-alias imports): the unit tests load it with plain Node.
 *
 * The database refuses with a short code (`raise exception 'office_occupied'
 * using errcode = 'P0001'`) or with a constraint error. The interface only
 * ever shows the French sentence below; the code stays in the server logs.
 * No sentence reveals more than the person could already see (who holds
 * which office in another association, whether an e-mail has an account…).
 */

export type GovernanceErrorCode =
  | "mfa_required"
  | "not_authenticated"
  | "insufficient_permission"
  | "permission_ceiling"
  | "permission_not_grantable"
  | "permission_not_delegable"
  | "reason_required"
  | "invalid_period"
  | "organization_not_found"
  | "organization_inactive"
  | "organization_invalid"
  | "slug_taken"
  | "invalid_status_change"
  | "bde_protected"
  | "position_not_found"
  | "position_archived"
  | "position_protected"
  | "position_invalid"
  | "position_title_taken"
  | "template_not_selectable"
  | "membership_not_found"
  | "membership_ended"
  | "member_not_active"
  | "member_suspended"
  | "already_member"
  | "self_assignment"
  | "assignment_not_found"
  | "assignment_not_active"
  | "assignment_overlap"
  | "office_holder"
  | "email_invalid"
  | "invitation_exists"
  | "invitation_not_found"
  | "invitation_not_pending"
  | "invitation_expired"
  | "invitation_invalid"
  | "user_not_found"
  | "user_not_eligible"
  | "self_delegation"
  | "delegation_not_found"
  | "delegation_not_active"
  | "transition_conflict"
  | "transition_not_found"
  | "transition_not_open"
  | "transition_expired"
  | "proposer_lost_authority"
  | "candidate_required"
  | "candidate_not_allowed"
  | "candidate_suspended"
  | "candidate_holds_other_office"
  | "candidates_must_differ"
  | "office_occupied"
  | "invalid_office"
  | "bde_leadership_vacant"
  | "already_responded"
  | "already_approved"
  | "approval_not_allowed"
  | "approval_not_found"
  | "conflict"
  | "unavailable"
  | "unexpected";

export const GOVERNANCE_MESSAGES: Record<GovernanceErrorCode, string> = {
  mfa_required:
    "Cette action demande la double authentification. Active-la dans Sécurité, puis recommence.",
  not_authenticated: "Ta session a expiré. Reconnecte-toi, puis recommence.",
  insufficient_permission: "Ton poste ne te permet pas de faire ça (ou plus).",
  permission_ceiling: "Tu ne peux donner que des droits que tu as toi-même par ton poste.",
  permission_not_grantable: "Ce droit est réservé et ne peut pas être donné par un poste.",
  permission_not_delegable: "Ce droit ne se délègue pas.",
  reason_required: "Indique une raison (entre 3 et 500 caractères) : elle reste dans l'historique.",
  invalid_period: "Les dates ne vont pas : vérifie le début et la fin du mandat.",
  organization_not_found: "Cette asso n'existe pas ou n'est plus visible.",
  organization_inactive: "Cette asso est suspendue ou archivée : rien ne peut y être modifié.",
  organization_invalid: "Le nom ou l'adresse de l'asso ne sont pas valides.",
  slug_taken: "Cette adresse est déjà prise par une autre asso.",
  invalid_status_change: "Ce changement de statut n'est pas possible depuis le statut actuel.",
  bde_protected: "Le BDE reste toujours actif : son statut ne se change pas.",
  position_not_found: "Ce poste n'existe plus.",
  position_archived: "Ce poste a été retiré.",
  position_protected:
    "La présidence (et la vice-présidence du BDE) ne s'attribue pas ici : elle passe par une passation.",
  position_invalid: "Le nom du poste n'est pas valide.",
  position_title_taken: "Un autre poste porte déjà ce nom.",
  template_not_selectable: "Ce modèle de poste n'est pas disponible.",
  membership_not_found: "Cette personne ne fait pas partie de l'asso.",
  membership_ended: "Cette personne a quitté l'asso.",
  member_not_active: "Cette personne est suspendue : réactive-la d'abord.",
  member_suspended: "Cette personne est suspendue.",
  already_member: "Cette personne fait déjà partie de l'asso.",
  self_assignment: "Tu ne peux pas t'attribuer un poste toi-même.",
  assignment_not_found: "Ce mandat n'existe plus.",
  assignment_not_active: "Ce mandat est déjà terminé.",
  assignment_overlap: "Cette personne a déjà ce poste sur ces dates.",
  office_holder:
    "Cette personne préside : elle ne peut être retirée qu'après une passation (ou par le BDE en urgence).",
  email_invalid: "Cette adresse e-mail n'est pas valide.",
  invitation_exists: "Une invitation attend déjà une réponse à cette adresse.",
  invitation_not_found: "Cette invitation n'existe plus.",
  invitation_not_pending: "Cette invitation a déjà reçu une réponse ou a été annulée.",
  invitation_expired: "Cette invitation a expiré. Demande à l'asso de t'en envoyer une nouvelle.",
  invitation_invalid:
    "Cette invitation n'est plus valable (la personne qui l'a envoyée n'a plus ce droit) ou ne correspond pas à ton compte. Demande à l'asso de t'en envoyer une nouvelle.",
  user_not_found:
    "Personne ne s'est encore connecté avec cette adresse. La personne doit d'abord se connecter une fois au site.",
  user_not_eligible: "Cette adresse ne peut pas créer de compte sur le site : invite son adresse de l'école.",
  self_delegation: "Tu ne peux pas te déléguer des droits à toi-même.",
  delegation_not_found: "Cette délégation n'existe plus.",
  delegation_not_active: "Cette délégation est déjà terminée.",
  transition_conflict: "Une passation est déjà en cours ici : termine-la ou annule-la d'abord.",
  transition_not_found: "Cette passation n'existe plus.",
  transition_not_open: "Cette passation est déjà terminée ou annulée.",
  transition_expired: "Cette passation a expiré : il faut en proposer une nouvelle.",
  proposer_lost_authority:
    "La personne qui a proposé cette passation n'a plus son mandat : la passation ne peut plus aboutir.",
  candidate_required: "Indique l'adresse de la personne proposée.",
  candidate_not_allowed: "Cette personne ne peut pas être proposée ici.",
  candidate_suspended: "Cette personne est suspendue dans l'asso.",
  candidate_holds_other_office: "Cette personne occupe déjà un autre poste de direction du BDE.",
  candidates_must_differ: "La présidence et la vice-présidence doivent être deux personnes différentes.",
  office_occupied: "Ce poste est occupé : la reprise d'urgence ne concerne qu'un poste vacant.",
  invalid_office: "Ce poste ne correspond pas à cette asso.",
  bde_leadership_vacant:
    "Les deux postes de direction du BDE sont vacants : plus personne ne peut approuver une passation. Le ou la garant·e de continuité rétablit d'abord un poste (reprise d'urgence).",
  already_responded: "Tu as déjà répondu.",
  already_approved: "Tu as déjà approuvé cette passation.",
  approval_not_allowed: "Ton approbation n'est pas attendue pour cette passation.",
  approval_not_found: "Il n'y a pas d'approbation à retirer.",
  conflict: "Quelqu'un vient de faire une modification au même endroit. Recharge la page, puis recommence.",
  unavailable: "Le service est momentanément indisponible. Réessaie dans un instant.",
  unexpected: "Une erreur inattendue est survenue. Réessaie, et préviens le BDE si ça continue.",
};

const KNOWN = new Set(Object.keys(GOVERNANCE_MESSAGES));

/**
 * The code behind a Supabase/PostgREST error. Raised governance errors come
 * as SQLSTATE P0001 with the code as message; a few database guards answer
 * with standard SQLSTATEs.
 */
export function governanceErrorCode(error: { code?: string | null; message?: string | null } | null | undefined): GovernanceErrorCode {
  const sqlstate = error?.code ?? "";
  const message = (error?.message ?? "").trim();
  if (sqlstate === "P0001" && KNOWN.has(message)) return message as GovernanceErrorCode;
  switch (sqlstate) {
    case "23P01": // exclusion_violation: a second holder for the same mandate window
      return "assignment_overlap";
    case "23505": // unique_violation: a race the function's own check did not see
      return "conflict";
    case "42501": // insufficient_privilege
      return "insufficient_permission";
    case "PGRST301":
    case "PGRST303":
      return "not_authenticated";
  }
  if (sqlstate.startsWith("08") || sqlstate === "57P01" || sqlstate === "53300") return "unavailable";
  if (!sqlstate && /fetch failed|network|timeout/i.test(message)) return "unavailable";
  return "unexpected";
}

export function governanceErrorMessage(code: GovernanceErrorCode): string {
  return GOVERNANCE_MESSAGES[code];
}
