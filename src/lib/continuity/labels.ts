/**
 * The words of the continuity pages (Phase 11). The database returns keys
 * and counts only; the sentences live here (and, for alerts, in the shared
 * notification words, so a page and an e-mail say the same thing). The unit
 * tests check that every key the migrations know has its words.
 */

// Relative (not @notify/…) so the Node unit tests can load this module too.
import { JOB_WORDS, RECORD_WORDS } from "../../../supabase/functions/_shared/notifications/platform.ts";

export { JOB_WORDS, RECORD_WORDS };

export type Tone = "ok" | "warn" | "danger" | "neutral";

export type JobHealth = "ok" | "late" | "failing" | "never_run" | "not_scheduled" | "unverifiable";

export const JOB_HEALTH: Record<JobHealth, { label: string; tone: Tone }> = {
  ok: { label: "À l'heure", tone: "ok" },
  late: { label: "En retard", tone: "warn" },
  failing: { label: "En échec", tone: "danger" },
  never_run: { label: "Jamais exécutée", tone: "danger" },
  not_scheduled: { label: "Non programmée", tone: "danger" },
  unverifiable: { label: "Impossible à vérifier", tone: "neutral" },
};

/** What each job does and how often (the catalog's schedule, in words). */
export const JOB_INFO: Record<string, { help: string; every: string }> = {
  "publish-scheduled-posts": {
    help: "Publie les articles programmés à leur heure, si leur approbation est toujours valable.",
    every: "Chaque minute",
  },
  "notifications-dispatch": { help: "Distribue les messages programmés et réveille l'envoi des e-mails.", every: "Chaque minute" },
  "notification-reminders": {
    help: "Rappels la veille d'un événement ou d'un entretien, articles qui attendent une relecture.",
    every: "Toutes les 15 minutes",
  },
  "recruitment-review-jobs": {
    help: "Annonce les décisions programmées et fait expirer les propositions restées sans réponse.",
    every: "Toutes les 5 minutes",
  },
  "enqueue-recruitment-reminders": { help: "Rappels aux candidat·es : brouillon à envoyer, question ou proposition en attente.", every: "Chaque heure" },
  "governance-health": {
    help: "Cherche les présidences vacantes, les successions à prévoir, les passations bloquées et les accès qui expirent, puis prévient les bonnes personnes.",
    every: "Chaque heure",
  },
  "storage-cleanup": { help: "Supprime du stockage les fichiers que la base a libérés (documents retirés ou effacés).", every: "Toutes les 15 minutes" },
  "purge-recruitment-data": {
    help: "Supprime les candidatures arrivées au terme de leur conservation (réglage des recrutements).",
    every: "Chaque nuit",
  },
  "data-retention": {
    help: "Supprime les données arrivées au terme de leur règle de conservation, puis nettoie les journaux techniques.",
    every: "Chaque nuit",
  },
  "platform-health-report": { help: "Envoie le point de continuité au bureau du BDE.", every: "Le lundi matin" },
};

export type IssueKind =
  | "bde_office_vacant"
  | "association_president_vacant"
  | "succession_missing"
  | "transition_pending"
  | "approver_missing"
  | "reviewer_access_expiring"
  | "guardian_missing"
  | "guardian_mfa_missing"
  | "officer_mfa_missing"
  | "suspended_with_pending"
  | "job_unhealthy"
  | "renewal_due";

export const ISSUE_KIND: Record<IssueKind, string> = {
  bde_office_vacant: "Poste du BDE vacant",
  association_president_vacant: "Asso sans présidence",
  succession_missing: "Succession à prévoir",
  transition_pending: "Passation en attente",
  approver_missing: "Articles sans relecture possible",
  reviewer_access_expiring: "Accès au comité qui expirent",
  guardian_missing: "Pas de garant·e de continuité",
  guardian_mfa_missing: "Garant·e sans double authentification",
  officer_mfa_missing: "Double authentification manquante",
  suspended_with_pending: "Asso suspendue avec du travail en cours",
  job_unhealthy: "Tâche automatique à vérifier",
  renewal_due: "Renouvellement à prévoir",
};

export const SEVERITY: Record<string, { label: string; tone: Tone }> = {
  critical: { label: "Urgent", tone: "danger" },
  warning: { label: "À traiter", tone: "warn" },
  info: { label: "Pour information", tone: "neutral" },
};

export const SUCCESSION_STATE: Record<string, { label: string; tone: Tone }> = {
  vacant: { label: "Présidence vacante", tone: "danger" },
  arranged: { label: "Succession prévue", tone: "ok" },
  none: { label: "Pas encore de succession", tone: "warn" },
  awaiting_acceptance: { label: "En attente d'acceptation", tone: "warn" },
  awaiting_approval: { label: "En attente d'approbation", tone: "warn" },
};

/** The automatic checks of an academic year's preparation (academic_year_preparation → auto). */
export const YEAR_AUTO_CHECK: Record<string, string> = {
  year_configured: "Année configurée",
  bde_president_next: "Présidence du BDE au début de l'année",
  bde_vice_president_next: "Vice-présidence du BDE au début de l'année",
  bde_transition: "Passation du BDE en cours",
  association_presidents: "Présidences d'assos au début de l'année",
  expiring_officers: "Postes qui finissent avant le début de l'année",
  delegations: "Délégations en cours",
  pending_invitations: "Invitations en attente de réponse",
  recruitment_campaigns: "Recrutements en cours",
  scheduled_posts: "Publications programmées",
  upcoming_events: "Événements à venir",
  guardian: "Garant·e de continuité au début de l'année",
  jobs_healthy: "Tâches automatiques",
  backups_verified: "Restaurations testées (base et fichiers)",
  register_verified: "Registre des comptes techniques vérifié",
  notification_mode: "Envoi des e-mails",
  retention_configured: "Règles de conservation non décidées",
  open_incidents: "Incidents ouverts",
};

/** The human confirmations (private.academic_year_manual_checks, same order). */
export const YEAR_MANUAL_CHECK: Record<string, string> = {
  leadership_reviewed: "La direction du BDE de l'année qui vient est en place, ou sa passation est lancée.",
  mandates_reviewed: "Les mandats qui finissent ont été revus avec les assos.",
  delegations_reviewed: "Les délégations en cours ont été revues.",
  recruitment_access_reviewed: "Les accès aux comités de recrutement ont été revus.",
  scheduled_content_reviewed: "Les publications et événements programmés ont été vérifiés.",
  operational_contacts_reviewed: "Les contacts du registre (hébergement, domaine, e-mails, facturation) sont à jour.",
  recovery_procedure_documented: "La procédure de récupération des accès est écrite et connue du ou de la garant·e.",
  backup_health_reviewed: "Une restauration de test a été faite, pour la base et pour les fichiers.",
  notification_test_done: "Un e-mail de test est bien arrivé.",
};

export const NOTIFICATION_MODE: Record<string, string> = {
  off: "Arrêté",
  capture: "Mode test (rien n'est envoyé)",
  live: "En service",
};

export const BACKUP_KIND: Record<string, { label: string; help: string }> = {
  database_backups_available: {
    label: "Sauvegardes de la base disponibles",
    help: "Vu dans la console du fournisseur : la liste des sauvegardes existe et la plus récente date d'hier au plus tard.",
  },
  database_restore_test: {
    label: "Restauration de la base testée",
    help: "Une sauvegarde restaurée dans un projet isolé, jamais par-dessus le site en service, puis vérifiée.",
  },
  storage_copy_available: {
    label: "Copie des fichiers disponible",
    help: "Les sauvegardes de la base ne contiennent pas les fichiers (images, CV) : une copie chiffrée existe ailleurs.",
  },
  storage_restore_test: { label: "Restauration des fichiers testée", help: "Des fichiers remis en place depuis la copie et ouverts." },
};

export const BACKUP_STATUS: Record<string, { label: string; tone: Tone }> = {
  never: { label: "Jamais vérifié", tone: "danger" },
  verified: { label: "Vérifié", tone: "ok" },
  partial: { label: "Partiel", tone: "warn" },
  failed: { label: "Échec", tone: "danger" },
  stale: { label: "À refaire cette année", tone: "warn" },
};

export const ENVIRONMENT: Record<string, string> = {
  production: "Site en service",
  staging: "Préproduction",
  development: "Développement",
};

export const RECORD_STATUS: Record<string, { label: string; tone: Tone }> = {
  verified: { label: "Vérifié", tone: "ok" },
  needs_review: { label: "À revoir", tone: "warn" },
  not_configured: { label: "Non renseigné", tone: "danger" },
};

export const RECORD_AREA: Record<string, string> = {
  infrastructure: "Infrastructure",
  code: "Code",
  domain: "Domaine",
  email: "E-mails",
  billing: "Facturation",
  contacts: "Contacts",
  recovery: "Récupération",
};

/** What to write in each line of the register (never a password or a key). */
export const RECORD_HINT: Record<string, string> = {
  supabase_project: "L'organisation Supabase qui détient le projet, son plan, qui en est propriétaire. Une organisation de l'école ou du BDE, pas un compte personnel.",
  hosting: "Le service qui héberge le site et qui en administre le compte.",
  uptime_monitor: "Le service extérieur qui appelle /api/health et prévient en cas de panne, et qui reçoit ses alertes.",
  source_repository: "Où est le code, qui en est propriétaire, qui peut y écrire.",
  domain: "Le registraire, le titulaire du nom de domaine, la date de renouvellement.",
  dns: "Qui peut modifier les enregistrements DNS.",
  https_certificates: "Qui renouvelle les certificats (souvent automatique chez l'hébergeur).",
  email_provider: "Le compte du service d'envoi, qui l'administre.",
  email_domain: "Le domaine d'envoi et son authentification (SPF, DKIM), qui la gère.",
  supabase_billing: "Qui paie, quel plan, quand ça se renouvelle, qui le vérifie.",
  hosting_billing: "Qui paie l'hébergement, quand ça se renouvelle.",
  technical_owner: "La personne ou le service de l'école qui peut récupérer ou transférer les comptes.",
  privacy_contact: "À qui signaler une demande sur les données ou un incident de sécurité.",
  recovery_procedure: "Où est écrite la procédure de récupération des accès, qui la connaît.",
  storage_copies: "Où sont gardées les copies chiffrées des fichiers, qui y a accès.",
};

export const INCIDENT_KIND: Record<string, { label: string; escalation: string }> = {
  governance: {
    label: "Gouvernance",
    escalation: "La présidence de l'asso, puis le bureau du BDE ; le ou la garant·e si le BDE n'a plus de direction.",
  },
  infrastructure: { label: "Infrastructure", escalation: "Le ou la responsable technique (voir le registre)." },
  notifications: { label: "E-mails et notifications", escalation: "Le ou la responsable technique (voir le registre)." },
  jobs: { label: "Tâches automatiques", escalation: "Le ou la responsable technique (voir le registre)." },
  security: { label: "Sécurité", escalation: "Le ou la responsable technique et le contact données et sécurité." },
  data: { label: "Données personnelles", escalation: "Le contact données et sécurité (voir le registre)." },
  other: { label: "Autre", escalation: "Le bureau du BDE." },
};

export const INCIDENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: "Ouvert", tone: "danger" },
  investigating: { label: "En cours d'analyse", tone: "warn" },
  monitoring: { label: "Sous surveillance", tone: "warn" },
  resolved: { label: "Résolu", tone: "ok" },
};

export const INCIDENT_SEVERITY: Record<string, string> = {
  low: "Faible",
  medium: "Moyenne",
  high: "Élevée",
  critical: "Critique",
};

export const RETENTION_POLICY: Record<string, { label: string; from: string }> = {
  notifications_read: { label: "Notifications lues", from: "depuis leur lecture" },
  notifications_archived: { label: "Notifications archivées", from: "depuis leur archivage" },
  notifications_any: { label: "Toute notification", from: "depuis leur création, lue ou non" },
  notification_deliveries: { label: "Suivi des e-mails envoyés", from: "depuis la fin de l'envoi" },
  notification_preference_changes: { label: "Historique des choix de notification", from: "depuis le changement" },
  notification_suppressions_cleared: { label: "Adresses débloquées (historique)", from: "depuis le déblocage" },
  event_registrations_past: { label: "Inscriptions aux événements passés", from: "depuis la fin de l'événement" },
  governance_issues_resolved: { label: "Points de continuité résolus", from: "depuis leur résolution" },
};

export const RETENTION_HOUSEKEEPING: Record<string, string> = {
  notification_delivery_attempts: "Essais d'envoi des e-mails",
  notification_provider_events: "Retours du service d'envoi",
  notification_email_captures: "E-mails fabriqués en mode test",
  notification_worker_runs: "Passages de l'envoi des e-mails",
  notification_unsubscribe_tokens: "Liens de désabonnement utilisés ou expirés",
  notification_broadcast_recipients: "Destinataires figés des messages envoyés",
  scheduled_job_runs: "Historique des tâches automatiques",
  cron_run_details: "Journal du planificateur",
};

export const RECRUITMENT_RETENTION: Record<string, string> = {
  draft: "Brouillons de candidature",
  withdrawn: "Candidatures retirées",
  submitted: "Candidatures non retenues",
  selected: "Candidatures retenues",
};

export const SECURITY_CHECK: Record<string, { label: string; help: string }> = {
  rls_enabled: { label: "Sécurité ligne par ligne activée partout", help: "Une table sans cette sécurité serait lisible sans contrôle." },
  no_table_writes: { label: "Aucune écriture directe dans les tables", help: "Tout passe par les fonctions qui vérifient les droits." },
  definer_search_path: { label: "Fonctions privilégiées protégées", help: "Chaque fonction privilégiée fixe ses chemins de recherche." },
  private_functions_closed: { label: "Fonctions internes fermées", help: "Seules les aides prévues pour les règles de lecture sont ouvertes." },
  anon_functions: { label: "Fonctions ouvertes aux visiteurs", help: "Pages publiques, désabonnement, état du site : à comparer d'une fois à l'autre." },
  office_overlap_guard: { label: "Garde-fou des postes de direction", help: "La base refuse deux titulaires d'un même poste en même temps." },
  bde_offices: { label: "Postes du BDE occupés", help: "Nombre de postes de la direction du BDE vacants." },
  guardian_assignments: { label: "Un·e garant·e et un·e seul·e", help: "Ni aucun, ni plusieurs." },
  officers_mfa: { label: "Double authentification des responsables", help: "Responsables sans second facteur (prévenu·es une fois)." },
  schema_version: { label: "Dernière migration appliquée", help: "À comparer avec la dernière du dépôt de code." },
  notification_mode: { label: "Envoi des e-mails", help: "Arrêté, mode test ou en service." },
};

export const HANDOVER_AREA: Record<string, string> = {
  presidence: "Présidence",
  communication: "Communication",
  evenements: "Événements",
  recrutement: "Recrutement",
};

export const OFFICE_WORDS: Record<string, string> = {
  bde_president: "Présidence du BDE",
  bde_vice_president: "Vice-présidence du BDE",
  association_president: "Présidence",
};
