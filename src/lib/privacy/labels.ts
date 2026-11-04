/**
 * The words of the privacy pages (Phase 14): request kinds and steps, what
 * an identity check means, incident assessments, hold scopes, the counts of
 * the "Mes données" page. One place, so the student's page, the officer's
 * desk and the e-mails say the same thing. Pure module (relative imports
 * with extensions only): the unit tests load it with plain Node.
 */

export type PrivacyRequestKind =
  | "access"
  | "portability"
  | "rectification"
  | "erasure"
  | "restriction"
  | "objection"
  | "consent_withdrawal"
  | "other";

export type PrivacyRequestStatus =
  | "received"
  | "under_review"
  | "approved"
  | "partially_approved"
  | "refused"
  | "in_progress"
  | "completed"
  | "withdrawn";

export const REQUEST_KINDS: { key: PrivacyRequestKind; label: string; help: string; needsDetails: boolean }[] = [
  {
    key: "access",
    label: "Accéder à mes données",
    help: "Tout ce que le site garde sur toi, y compris ce qui ne se télécharge pas tout seul (les évaluations de tes candidatures, par exemple), examiné par la personne chargée des données.",
    needsDetails: false,
  },
  {
    key: "portability",
    label: "Récupérer mes données dans un format réutilisable",
    help: "Les données que tu as fournies, dans un fichier structuré (JSON).",
    needsDetails: false,
  },
  {
    key: "rectification",
    label: "Corriger une donnée",
    help: "Ton profil se corrige toi-même. Pour le reste (une candidature, une inscription), dis ce qui est faux.",
    needsDetails: true,
  },
  {
    key: "erasure",
    label: "Supprimer mon compte et mes données",
    help: "Le compte est fermé et tes données effacées, sauf ce qu'une règle oblige à garder (expliqué dans la réponse).",
    needsDetails: false,
  },
  {
    key: "restriction",
    label: "Limiter l'utilisation de mes données",
    help: "Par exemple pendant qu'une correction est vérifiée.",
    needsDetails: true,
  },
  {
    key: "objection",
    label: "M'opposer à une utilisation",
    help: "Dis laquelle et pourquoi : la demande est examinée au cas par cas.",
    needsDetails: true,
  },
  {
    key: "consent_withdrawal",
    label: "Retirer un consentement",
    help: "La photo et la présentation dans l'équipe publique d'une asso se retirent aussi directement depuis l'espace de l'asso (Gérer), et les e-mails facultatifs depuis tes réglages de notifications.",
    needsDetails: false,
  },
  { key: "other", label: "Autre demande", help: "Une question sur tes données qui n'entre dans aucune case.", needsDetails: true },
];

export const REQUEST_KIND_LABEL: Record<PrivacyRequestKind, string> = Object.fromEntries(
  REQUEST_KINDS.map((k) => [k.key, k.label]),
) as Record<PrivacyRequestKind, string>;

export const REQUEST_STATUS: Record<PrivacyRequestStatus, { label: string; tone: "info" | "warn" | "ok" | "danger" | "neutral" }> = {
  received: { label: "Reçue", tone: "info" },
  under_review: { label: "En cours d'examen", tone: "info" },
  approved: { label: "Acceptée", tone: "ok" },
  partially_approved: { label: "Acceptée en partie", tone: "warn" },
  refused: { label: "Refusée", tone: "danger" },
  in_progress: { label: "En cours de traitement", tone: "info" },
  completed: { label: "Terminée", tone: "ok" },
  withdrawn: { label: "Retirée", tone: "neutral" },
};

export const REQUEST_EVENT_LABEL: Record<string, string> = {
  received: "Demande reçue",
  identity_checked: "Identité vérifiée",
  decided: "Décision",
  extended: "Délai prolongé",
  note: "Message",
  export_prepared: "Export préparé",
  export_downloaded: "Export téléchargé",
  erasure_executed: "Effacement exécuté",
  completed: "Terminée",
  withdrawn: "Retirée",
  reminder_sent: "Rappel",
};

export const IDENTITY_STATUS: Record<string, string> = {
  session: "Session du compte (demande faite connecté·e)",
  session_mfa: "Session du compte avec double authentification",
  pending: "À vérifier",
  verified: "Vérifiée par la personne chargée des données",
  failed: "Non vérifiée",
};

export const DECISIONS: { key: "approved" | "partially_approved" | "refused"; label: string }[] = [
  { key: "approved", label: "Accepter" },
  { key: "partially_approved", label: "Accepter en partie (raison obligatoire)" },
  { key: "refused", label: "Refuser (raison obligatoire)" },
];

/** What "Mes données" counts, in words. */
export const DATA_COUNT_LABEL: Record<string, string> = {
  memberships: "Adhésions à des assos",
  positions: "Postes (actuels et passés)",
  registrations: "Inscriptions à des événements",
  applications: "Candidatures",
  documents: "Fichiers de candidature",
  saved_items: "Contenus enregistrés",
  interests: "Centres d'intérêt choisis",
  notifications: "Notifications",
  follows: "Assos suivies",
  public_team_profiles: "Présentations dans une équipe publique",
  privacy_requests: "Demandes sur tes données",
};

export const RESPONSIBILITY_KIND: Record<string, string> = {
  position: "Poste",
  platform_role: "Rôle sur la plateforme",
  committee: "Siège de comité de recrutement",
  delegation: "Délégation",
};

export const HOLD_SCOPE: Record<string, string> = {
  person: "Une personne (tout son compte)",
  application: "Une candidature",
  campaign: "Un recrutement",
  event: "Un événement",
  organization: "Une asso",
};

export const INCIDENT_RISK: Record<string, string> = {
  unassessed: "Pas encore évalué",
  unlikely: "Risque peu probable pour les personnes",
  risk: "Risque pour les personnes",
  high: "Risque élevé pour les personnes",
};

export const AUTHORITY_DECISION: Record<string, string> = {
  pending: "Décision à prendre",
  not_required: "Notification à la CNIL non requise (motivé)",
  notify: "Notification à la CNIL décidée",
};

export const INDIVIDUALS_DECISION: Record<string, string> = {
  pending: "Décision à prendre",
  not_required: "Information des personnes non requise (motivé)",
  inform: "Information des personnes décidée",
};

export const DATA_CATEGORIES: { key: string; label: string }[] = [
  { key: "identity", label: "Identité (nom, prénom)" },
  { key: "contact", label: "Coordonnées (e-mail)" },
  { key: "account", label: "Compte et connexion" },
  { key: "membership", label: "Adhésions et postes" },
  { key: "events", label: "Inscriptions" },
  { key: "applications", label: "Candidatures et réponses" },
  { key: "documents", label: "CV et documents" },
  { key: "evaluations", label: "Évaluations" },
  { key: "notifications", label: "Notifications" },
  { key: "other", label: "Autre" },
];

/** The flagged themes of a recruitment form (private.form_sensitive_terms), in words. */
export const FORM_SENSITIVE_TERM: Record<string, string> = {
  sante: "Santé, handicap",
  religion: "Religion, convictions",
  politique: "Opinions politiques",
  syndicat: "Appartenance syndicale",
  vie_sexuelle: "Vie ou orientation sexuelle",
  origine: "Origine, nationalité",
  justice: "Condamnations, infractions",
  identite: "Pièce d'identité, numéro officiel",
  naissance: "Date de naissance, âge",
  adresse: "Adresse personnelle",
  telephone: "Numéro de téléphone",
  banque: "Coordonnées bancaires",
};

/** "12 novembre", the day a request is due (the day before the stored instant, which is the next midnight). */
export function dueDayIso(dueAt: string): string {
  return new Date(Date.parse(dueAt) - 1000).toISOString();
}
