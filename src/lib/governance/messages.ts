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
  // Phase 8: recruitment
  | "campaign_not_found"
  | "campaign_invalid"
  | "campaign_incomplete"
  | "campaign_dates_invalid"
  | "campaign_past"
  | "campaign_cancelled"
  | "campaign_hidden"
  | "campaign_not_hidden"
  | "campaign_limit"
  | "campaign_needs_position"
  | "campaign_not_published"
  | "campaign_has_applications"
  | "campaign_closed"
  | "campaign_still_open"
  | "campaign_was_published"
  | "campaign_owner_locked"
  | "campaign_paused"
  | "campaign_not_open"
  | "position_limit"
  | "position_closed"
  | "form_invalid"
  | "form_version_locked"
  | "form_not_live"
  | "form_no_draft"
  | "form_version_changed"
  | "not_eligible"
  | "application_limit"
  | "application_rate_limited"
  | "application_not_found"
  | "application_locked"
  | "application_incomplete"
  | "application_not_submitted"
  | "answer_invalid"
  | "question_not_found"
  | "document_type_refused"
  | "document_too_large"
  | "too_many_documents"
  | "document_rate_limited"
  | "document_not_found"
  | "document_not_uploaded"
  | "document_unreadable"
  | "privacy_not_acknowledged"
  | "already_on_committee"
  | "already_waitlisted"
  | "application_decided"
  | "application_withdrawn"
  | "candidate_in_campaign"
  | "cannot_change_own_appointment"
  | "cannot_resolve_own_conflict"
  | "capacity_reached"
  | "clarification_closed"
  | "clarification_limit"
  | "clarification_locked"
  | "clarification_not_found"
  | "comment_invalid"
  | "comment_locked"
  | "comment_not_found"
  | "committee_member_not_found"
  | "conflict_not_found"
  | "decision_closed"
  | "decision_locked"
  | "decision_not_found"
  | "decision_pending"
  | "documents_not_requested"
  | "filter_invalid"
  | "interview_closed"
  | "interview_not_found"
  | "interview_not_started"
  | "interview_outcome_invalid"
  | "interview_too_close"
  | "interviewer_busy"
  | "member_cannot_review"
  | "mention_not_allowed"
  | "message_too_long"
  | "mode_invalid"
  | "note_too_long"
  | "offer_expired"
  | "offer_locked"
  | "offer_not_accepted"
  | "offer_not_found"
  | "offer_not_pending"
  | "onboarding_started"
  | "outcome_invalid"
  | "policy_invalid"
  | "powers_invalid"
  | "president_vacant"
  | "purpose_required"
  | "question_invalid"
  | "recommendation_invalid"
  | "recommendation_required"
  | "records_are_append_only"
  | "resolution_invalid"
  | "retention_invalid"
  | "review_locked"
  | "review_not_found"
  | "review_not_submitted"
  | "review_submitted"
  | "reviews_incomplete"
  | "role_invalid"
  | "rubric_changed"
  | "rubric_empty"
  | "rubric_invalid"
  | "rubric_locked"
  | "rubric_not_found"
  | "scope_invalid"
  | "score_invalid"
  | "score_missing"
  | "selection_invalid"
  | "slot_invalid"
  | "slot_not_found"
  | "slot_taken"
  | "slot_unavailable"
  | "stage_invalid"
  | "tag_exists"
  | "tag_invalid"
  | "tag_limit"
  | "tag_not_found"
  | "template_invalid"
  | "template_too_long"
  | "template_variable_unknown"
  | "too_many_interviewers"
  | "approver_must_differ"
  | "audience_invalid"
  | "broadcast_closed"
  | "broadcast_duplicate"
  | "broadcast_invalid"
  | "broadcast_no_recipient"
  | "broadcast_not_found"
  | "broadcast_rate_limited"
  | "broadcast_too_large"
  | "delivery_not_found"
  | "delivery_not_retryable"
  | "importance_not_allowed"
  | "link_invalid"
  | "notification_not_found"
  | "quiet_hours_invalid"
  | "schedule_invalid"
  | "topic_essential"
  | "topic_not_found"
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
  campaign_not_found: "Ce recrutement n'existe pas, ou n'est pas en ligne.",
  campaign_invalid: "Un champ du recrutement n'a pas le bon format. Vérifie les longueurs et les adresses.",
  campaign_incomplete: "Il manque l'essentiel : un titre, une phrase de présentation, la date d'ouverture et la date limite.",
  campaign_dates_invalid:
    "Les dates ne tiennent pas : la date limite doit venir après l'ouverture et être à venir, et un poste ne peut pas fermer après la campagne.",
  campaign_past: "La date limite est déjà passée : choisis-en une à venir avant de publier.",
  campaign_cancelled: "Ce recrutement est annulé : il ne se modifie plus.",
  campaign_hidden: "Ce recrutement est masqué par la modération du BDE.",
  campaign_not_hidden: "Ce recrutement n'est pas masqué.",
  campaign_limit: "Trop de recrutements en cours pour cette asso. Archive les anciens d'abord.",
  campaign_needs_position: "Un recrutement en ligne garde au moins un poste ouvert.",
  campaign_not_published: "Ce recrutement n'est pas en ligne.",
  campaign_has_applications:
    "Des candidatures ont été envoyées : le recrutement ne se retire plus du site. Mets-le en pause, clôture-le ou annule-le.",
  campaign_closed: "La date limite est passée : les candidatures sont closes.",
  campaign_still_open: "Clôture d'abord ce recrutement (ou attends sa date limite) pour l'archiver.",
  campaign_was_published: "Un recrutement qui a été en ligne ne se supprime pas : archive-le.",
  campaign_owner_locked: "Un recrutement reste dans l'asso qui l'a créé.",
  campaign_paused: "L'asso a mis ce recrutement en pause : réessaie quand il sera rouvert.",
  campaign_not_open: "Les candidatures ne sont pas encore ouvertes.",
  position_limit: "20 postes au plus par recrutement.",
  position_closed: "Ce poste ne prend plus de candidature.",
  form_invalid: "Le formulaire a une question incomplète ou un réglage invalide.",
  form_version_locked: "Une version publiée du formulaire ne se modifie plus : les changements vont dans un nouveau brouillon.",
  form_not_live: "Publie d'abord le recrutement : sa première version de formulaire part avec lui.",
  form_no_draft: "Il n'y a pas de brouillon de formulaire à publier.",
  form_version_changed:
    "L'asso a publié une nouvelle version du formulaire. Passe à la nouvelle version (tes réponses qui comptent encore sont gardées), puis envoie.",
  not_eligible: "Ce poste est réservé à d'autres années d'études (d'après l'année indiquée dans ton profil).",
  application_limit: "Tu as atteint le nombre de postes auxquels ce recrutement permet de candidater.",
  application_rate_limited: "Trop de candidatures commencées en une heure. Réessaie un peu plus tard.",
  application_not_found: "Cette candidature n'existe pas, ou n'est pas la tienne.",
  application_locked: "Cette candidature est envoyée : ses réponses ne se modifient plus.",
  application_incomplete: "Il manque des réponses obligatoires, ou certaines ne respectent pas les consignes.",
  application_not_submitted: "Seule une candidature envoyée peut être retirée. Un brouillon se supprime.",
  answer_invalid: "Une réponse n'a pas le bon format (un choix qui n'existe pas, un nombre attendu…).",
  question_not_found: "Cette question n'existe pas dans le formulaire.",
  document_type_refused: "Ce format de fichier n'est pas accepté pour cette question.",
  document_too_large: "Ce fichier dépasse la taille maximale de la question.",
  too_many_documents: "Cette question a déjà tous ses fichiers. Remplace ou retire-en un d'abord.",
  document_rate_limited: "Trop de fichiers envoyés en une heure. Réessaie un peu plus tard.",
  document_not_found: "Ce document n'existe pas, ou n'est plus dans ta candidature.",
  document_not_uploaded: "Le fichier n'est pas arrivé. Réessaie.",
  document_unreadable:
    "Ce fichier ne correspond pas à son format (ou c'est un document Word avec macros ou objets intégrés). Exporte-le en PDF et réessaie.",
  privacy_not_acknowledged: "Coche la case pour dire que tu as lu comment tes données sont utilisées.",
  already_on_committee: "Cette personne est déjà au comité de ce recrutement : modifie sa nomination.",
  already_waitlisted: "Cette candidature est déjà sur la liste d'attente.",
  application_decided: "La décision finale a été annoncée : cette candidature ne s'évalue plus.",
  application_withdrawn: "La personne a retiré sa candidature : plus rien ne peut s'y faire.",
  candidate_in_campaign:
    "Cette personne a candidaté à ce même recrutement : elle ne peut ni évaluer ni lire les autres candidatures.",
  cannot_change_own_appointment: "Tu ne peux pas modifier ta propre nomination : demande à une autre personne du comité.",
  cannot_resolve_own_conflict: "Un conflit d'intérêts se lève par une autre personne que celle qui l'a déclaré.",
  capacity_reached:
    "Toutes les places de ce poste sont déjà proposées. Pour en proposer une de plus, écris la raison de cette exception.",
  clarification_closed: "Cette question n'attend plus de réponse (répondue, retirée, ou délai passé).",
  clarification_limit: "Trop de questions pour cette candidature (3 en attente, 10 au total).",
  clarification_locked: "Une question posée, ou une réponse donnée, ne se modifie plus.",
  clarification_not_found: "Cette question n'existe pas, ou ne t'est pas adressée.",
  comment_invalid: "Le message est vide ou trop long (2 000 caractères au plus).",
  comment_locked: "Un message ne se modifie pas : retire-le et écris-en un autre.",
  comment_not_found: "Ce message n'existe pas, ou n'est pas le tien.",
  committee_member_not_found: "Cette nomination n'existe pas, ou elle est déjà terminée.",
  conflict_not_found: "Ce conflit d'intérêts n'existe pas, ou il est déjà réglé.",
  decision_closed: "Cette décision n'est plus en attente : elle a déjà été validée, renvoyée ou annulée.",
  decision_locked: "Une décision ne se réécrit pas : elle avance, ou elle est annulée avec une raison.",
  decision_not_found: "Cette décision n'existe pas, ou tu ne peux pas agir dessus.",
  decision_pending:
    "Une décision est déjà en cours pour cette candidature : valide-la, renvoie-la ou annule-la avant d'en proposer une autre.",
  documents_not_requested: "Cette question ne demande pas de fichier.",
  filter_invalid: "Un filtre n'a pas le bon format.",
  interview_closed: "Cet entretien est déjà terminé ou annulé.",
  interview_not_found: "Cet entretien n'existe pas, ou ne te concerne pas.",
  interview_not_started: "L'entretien n'a pas encore commencé : tu pourras le noter comme passé ensuite.",
  interview_outcome_invalid: "Indique si l'entretien a eu lieu ou si la personne n'est pas venue.",
  interview_too_close: "L'entretien est dans moins de 24 h : pour le déplacer, écris à l'association.",
  interviewer_busy: "Cette personne fait déjà passer un entretien sur ce créneau.",
  member_cannot_review:
    "Une des personnes choisies ne peut pas évaluer (nomination sans le droit d'évaluer, terminée ou retirée).",
  mention_not_allowed: "Tu ne peux mentionner que des personnes qui lisent déjà cette discussion.",
  message_too_long: "Le message est trop long.",
  mode_invalid: "Choisis une façon de répartir les candidatures.",
  note_too_long: "La note est trop longue (4 000 caractères au plus).",
  offer_expired: "Le délai pour répondre à cette proposition est passé. Écris à l'association si besoin.",
  offer_locked: "Une réponse à une proposition ne se change pas.",
  offer_not_accepted: "La personne n'a pas (encore) accepté la proposition.",
  offer_not_found: "Cette proposition n'existe pas, ou ne t'est pas adressée.",
  offer_not_pending: "Cette proposition a déjà reçu une réponse, ou elle a été retirée.",
  onboarding_started: "L'invitation dans l'équipe est déjà envoyée.",
  outcome_invalid: "Choisis une décision : retenir, refuser ou liste d'attente.",
  policy_invalid: "Les règles de décision ne sont pas valides (0 à 5 évaluations, une règle de validation connue).",
  powers_invalid: "Choisis au moins le droit de lire les candidatures, parmi les droits proposés.",
  president_vacant: "La présidence de l'asso est vacante : cette règle de validation ne peut pas s'appliquer. Change la règle.",
  purpose_required:
    "Ce recrutement est archivé (ou terminé depuis plus d'un an) : explique pourquoi cette personne doit y accéder.",
  question_invalid: "La question doit faire entre 3 et 2 000 caractères.",
  recommendation_invalid: "Choisis un avis dans la liste.",
  recommendation_required: "Donne ton avis (présélection, entretien, retenir…) avant de soumettre.",
  records_are_append_only: "Cet historique ne se modifie pas.",
  resolution_invalid: "Choisis comment régler ce conflit.",
  retention_invalid: "Une durée de conservation va de 1 à 60 mois (vide : pas encore décidée).",
  review_locked: "Une évaluation soumise ne se modifie que par une correction, avec sa raison.",
  review_not_found: "Cette évaluation n'existe pas, ou n'est pas la tienne.",
  review_not_submitted: "Cette évaluation est encore un brouillon : modifie-la directement.",
  review_submitted: "Tu as déjà soumis ton évaluation : corrige-la en donnant une raison.",
  reviews_incomplete:
    "Cette candidature n'a pas encore toutes les évaluations demandées. Pour décider quand même, écris pourquoi.",
  role_invalid: "Choisis un rôle dans la liste.",
  rubric_changed: "La grille d'évaluation a changé depuis ton brouillon : vérifie tes notes, puis soumets.",
  rubric_empty: "Ajoute au moins un critère avant de publier la grille.",
  rubric_invalid: "Un critère n'est pas valide (nom de 2 à 80 caractères, note sur 2 à 10, poids de 1 à 10).",
  rubric_locked: "Une grille publiée ne se modifie plus : les changements vont dans une nouvelle version.",
  rubric_not_found: "Il n'y a pas de brouillon de grille à publier.",
  scope_invalid: "Choisis ce que la personne peut voir : tout le recrutement, certains postes, ou ce qui lui est confié.",
  score_invalid: "Une note doit être un nombre entier entre 1 et le maximum du critère.",
  score_missing: "Il manque la note d'un critère obligatoire.",
  selection_invalid: "La sélection est vide ou trop grande.",
  slot_invalid:
    "Le créneau n'est pas valide (date à venir, durée de 10 min à 8 h, lieu pour un entretien sur place, lien https).",
  slot_not_found: "Ce créneau n'existe pas, ou il est annulé.",
  slot_taken: "Ce créneau vient d'être pris. Choisis-en un autre.",
  slot_unavailable: "Ce créneau n'est plus disponible pour toi. Choisis-en un autre.",
  stage_invalid: "Cette étape ne se choisit pas ici (l'entretien vient d'une invitation).",
  tag_exists: "Cette étiquette existe déjà.",
  tag_invalid: "Une étiquette fait entre 2 et 40 caractères.",
  tag_limit: "30 étiquettes au plus par recrutement.",
  tag_not_found: "Cette étiquette n'existe pas dans ce recrutement.",
  template_invalid: "Ce type de message n'existe pas.",
  template_too_long: "Le message type est trop long (2 000 caractères au plus).",
  template_variable_unknown:
    "Un champ entre accolades n'est pas reconnu. Ceux qui marchent : {prenom}, {association}, {recrutement}, {poste}, {reference}.",
  too_many_interviewers: "5 personnes au plus par entretien.",
  approver_must_differ:
    "Une annonce par e-mail à tout le campus doit être approuvée par une autre personne du BDE que celle qui l'a écrite.",
  audience_invalid:
    "Choisis à qui envoyer le message dans la liste.",
  broadcast_closed:
    "Ce message est déjà parti ou annulé : il ne se modifie plus.",
  broadcast_duplicate:
    "Le même message a déjà été préparé cette semaine. Modifie-le ou annule l'ancien.",
  broadcast_invalid:
    "Le titre fait de 3 à 120 caractères et le texte de 1 à 2 000.",
  broadcast_no_recipient:
    "Personne ne recevrait ce message pour l'instant (aucun membre ou abonné·e).",
  broadcast_not_found:
    "Ce message n'existe pas, ou tu ne peux pas y toucher.",
  broadcast_rate_limited:
    "La limite de messages pour aujourd'hui est atteinte (3 par jour pour le BDE, 5 par asso). Réessaie demain.",
  broadcast_too_large:
    "Ce message toucherait plus de 5 000 personnes : seul le BDE peut écrire à tout le campus.",
  delivery_not_found:
    "Cet envoi n'existe pas (ou plus).",
  delivery_not_retryable:
    "Cet envoi ne peut pas être relancé (adresse absente ou bloquée, ou déjà reparti).",
  importance_not_allowed:
    "Seule une annonce du BDE à tout le campus peut être marquée importante.",
  link_invalid:
    "Le lien doit mener à une page publique du site (événement, article, asso ou recrutement).",
  notification_not_found:
    "Cette notification n'existe plus.",
  quiet_hours_invalid:
    "Indique deux heures différentes, au format 22:00.",
  schedule_invalid:
    "La date d'envoi doit être dans les 30 prochains jours.",
  topic_essential:
    "Ces messages ne se désactivent pas : ils concernent une démarche en cours ou la sécurité de ton compte.",
  topic_not_found:
    "Ce type de notification n'existe pas.",
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
