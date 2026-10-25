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
  // Phase 5: association pages
  | "profile_invalid"
  | "draft_conflict"
  | "draft_changed"
  | "page_incomplete"
  | "page_withheld"
  | "page_not_published"
  | "page_not_withheld"
  | "media_not_found"
  | "media_quota"
  | "media_invalid"
  | "media_in_use"
  | "slug_invalid"
  | "category_invalid"
  | "category_taken"
  | "gallery_invalid"
  | "team_invalid"
  // Phase 6: publishing and moderation
  | "post_not_found"
  | "post_invalid"
  | "post_incomplete"
  | "post_was_published"
  | "post_hidden"
  | "post_not_hidden"
  | "post_not_published"
  | "post_not_archived"
  | "post_owner_locked"
  | "revision_locked"
  | "revision_not_editable"
  | "revision_not_submitted"
  | "revision_not_found"
  | "self_review"
  | "approval_required"
  | "page_not_public"
  | "invalid_schedule"
  | "not_scheduled"
  | "pin_limit"
  | "prominence_invalid"
  | "prominence_limit"
  | "prominence_period"
  | "already_reported"
  | "report_rate_limited"
  | "report_invalid"
  | "report_not_open"
  // Phase 7: events and registrations
  | "event_not_found"
  | "event_invalid"
  | "event_incomplete"
  | "event_cancelled"
  | "event_hidden"
  | "event_not_hidden"
  | "event_past"
  | "event_has_registrations"
  | "event_not_published"
  | "event_was_published"
  | "event_owner_locked"
  | "registration_not_available"
  | "registration_not_open"
  | "registration_closed"
  | "registration_not_found"
  | "registration_rate_limited"
  | "event_full"
  | "cancellation_closed"
  | "capacity_below_confirmed"
  | "registration_mode_locked"
  | "waitlist_not_empty"
  | "profile_incomplete"
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
  profile_invalid: "Un champ n'est pas au bon format : vérifie les longueurs, l'adresse e-mail et les liens.",
  draft_conflict:
    "Quelqu'un de l'équipe a modifié ce même champ entre-temps. Recharge la page pour voir sa version : ce que tu as tapé reste dans le formulaire jusque-là.",
  draft_changed:
    "Le brouillon a changé depuis ton aperçu. Relis l'aperçu, puis publie : on publie toujours ce qui a été vu.",
  page_incomplete: "Il manque l'essentiel pour publier : une accroche, une présentation et au moins une catégorie.",
  page_withheld:
    "Le BDE a retiré cette page temporairement : elle ne peut pas être republiée tant qu'il ne l'a pas rétablie. La raison est indiquée sur la page de réglages.",
  page_not_published: "La page n'est pas en ligne.",
  page_not_withheld: "Cette page n'est pas retirée.",
  media_not_found: "Cette image n'existe plus dans la médiathèque. Recharge la page.",
  media_quota: "La médiathèque est pleine (300 images) : retire celles qui ne servent plus.",
  media_invalid: "Cette image n'a pas pu être enregistrée.",
  media_in_use:
    "Cette image est utilisée (logo, couverture, galerie, article ou événement, en brouillon ou en ligne) : remplace-la d'abord.",
  slug_invalid:
    "Adresse invalide : lettres minuscules, chiffres et tirets (3 caractères au moins), sans les mots réservés du site.",
  category_invalid: "Cette catégorie n'existe pas ou n'est plus proposée.",
  category_taken: "Une catégorie porte déjà ce nom ou cette adresse.",
  gallery_invalid: "La galerie compte 24 images au plus, chacune une seule fois.",
  team_invalid: "La présentation de l'équipe n'a pas pu être enregistrée : recharge la page.",
  post_not_found: "Cet article n'existe plus ou n'est plus visible.",
  post_invalid:
    "Un champ n'est pas au bon format : vérifie le titre (140 caractères), l'introduction (400), les mots-clés (8 au plus) et les liens.",
  post_incomplete: "Il manque le titre ou le texte de l'article pour le publier.",
  post_was_published:
    "Cet article a déjà été en ligne : il ne se supprime pas (les liens partagés mèneraient nulle part). Archive-le ou retire-le du site.",
  post_hidden:
    "Le BDE a masqué cet article (modération) : il ne peut pas revenir en ligne tant que le BDE ne l'a pas rétabli.",
  post_not_hidden: "Cet article n'est pas masqué.",
  post_not_published: "Cet article n'est pas en ligne.",
  post_not_archived: "Cet article n'est pas archivé.",
  post_owner_locked: "Un article reste dans l'asso qui l'a créé.",
  revision_locked:
    "Cette version a été envoyée en relecture : elle ne change plus. Modifie l'article pour en commencer une nouvelle.",
  revision_not_editable:
    "Cette version ne peut plus être modifiée ici (elle a été envoyée, approuvée ou remplacée). Recharge la page.",
  revision_not_submitted: "Cette version n'attend pas de relecture (elle a été retirée ou déjà relue). Recharge la page.",
  revision_not_found: "Cette version n'existe plus. Recharge la page.",
  self_review:
    "Tu as écrit ou envoyé cette version : quelqu'un d'autre doit la relire. C'est le principe de la relecture.",
  approval_required:
    "Dans cette asso, un article est relu avant publication : envoie-le en relecture, ou publie une version déjà approuvée.",
  page_not_public:
    "La page publique de l'asso n'est pas en ligne : publie-la d'abord (Page publique › Publication), les articles s'y rattachent.",
  invalid_schedule: "Choisis une date à venir (dans deux minutes au moins, dans un an au plus).",
  not_scheduled: "Cet article n'est plus programmé.",
  pin_limit: "Trois articles au plus sont épinglés sur la page de l'asso : désépingles-en un d'abord.",
  prominence_invalid: "« Important » est réservé aux annonces du BDE.",
  prominence_limit:
    "Il y a déjà le maximum d'articles à la une (3) ou en « important » (2) : retires-en un d'abord.",
  prominence_period: "Choisis une date de fin à venir, dans 60 jours au plus (ou aucune date).",
  already_reported: "Tu as déjà signalé cet article : le BDE va l'examiner.",
  report_rate_limited: "Tu as envoyé beaucoup de signalements d'un coup. Réessaie plus tard.",
  report_invalid: "Choisis une raison (et 500 caractères au plus pour les précisions).",
  report_not_open: "Ce signalement a déjà été traité.",
  event_not_found: "Cet événement n'existe plus ou n'est plus visible.",
  event_invalid:
    "Un champ n'est pas au bon format : vérifie le titre (120 caractères), les dates (la fin après le début, 14 jours au plus), le lieu et les liens (https).",
  event_incomplete:
    "Il manque l'essentiel pour publier : un titre, un résumé, les dates de début et de fin, le lieu (ou « en ligne ») et, pour une inscription sur un autre site, son adresse.",
  event_cancelled: "Cet événement est annulé : il ne change plus et ne prend plus d'inscription.",
  event_hidden:
    "Le BDE a retiré cet événement du site (modération) : il ne peut pas revenir en ligne tant que le BDE ne l'a pas rétabli.",
  event_not_hidden: "Cet événement n'est pas masqué.",
  event_past: "Cet événement est déjà terminé : choisis des dates à venir.",
  event_has_registrations:
    "Des personnes sont inscrites ou en liste d'attente : on ne retire pas l'événement du site, on l'annule (elles sont prévenues).",
  event_not_published: "Cet événement n'est pas en ligne.",
  event_was_published:
    "Cet événement a déjà été en ligne : il ne se supprime pas (son lien a pu être partagé). Annule-le ou retire-le du site.",
  event_owner_locked: "Un événement reste dans l'asso qui l'a créé.",
  registration_not_available: "Cet événement ne prend pas d'inscription sur le site.",
  registration_not_open: "Les inscriptions ne sont pas encore ouvertes.",
  registration_closed: "Les inscriptions sont closes.",
  registration_not_found: "Tu n'es pas (ou plus) inscrit·e à cet événement.",
  registration_rate_limited: "Trop d'inscriptions et d'annulations d'un coup. Réessaie dans quelques minutes.",
  event_full: "C'est complet, et il n'y a pas de liste d'attente pour cet événement.",
  cancellation_closed:
    "Il est trop tard pour annuler toi-même : préviens l'asso qui organise.",
  capacity_below_confirmed:
    "La capacité ne peut pas descendre sous le nombre de places déjà confirmées. Retire d'abord des inscriptions (avec une raison) si c'est vraiment nécessaire.",
  registration_mode_locked:
    "Des personnes sont inscrites : le mode d'inscription ne change plus. Annule l'événement si tout change.",
  waitlist_not_empty: "Des personnes attendent : la liste d'attente ne peut pas être fermée.",
  profile_incomplete: "Termine d'abord ton profil (prénom et nom) : c'est ce que voit l'asso qui organise.",
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
