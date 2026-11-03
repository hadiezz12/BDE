/**
 * The metric dictionary (Phase 13): every figure the statistics pages can
 * show, once, with what it means, where it comes from, how it is counted,
 * how fresh it is and how private. Screens, exports and the documentation
 * (docs/backend/analytics.md) read their words from here; a unit test checks
 * that every key the database returns is defined here and in the docs.
 *
 * Quality:
 *   - "operational": counted from the platform's own records (exact);
 *   - "derived": computed from operational figures by a stated formula;
 *   - "unavailable": the platform does not measure it (and says so).
 * There is no "audience" metric: no page view, visitor or reading is
 * collected (docs/backend/analytics.md, "Audience measurement").
 *
 * Time:
 *   - "event_time": what happened during the period, on the day it happened
 *     (a registration made in October and cancelled in November counts as
 *     made in October and as cancelled in November);
 *   - "now": the state at this instant, whatever the period;
 *   - "cohort": a whole campaign, from its first application to now.
 * Pure module (relative imports with extensions only): the unit tests load it with plain Node.
 */

export type MetricQuality = "operational" | "derived" | "unavailable";
export type MetricTime = "event_time" | "now" | "cohort";
export type MetricPrivacy = "public" | "internal" | "sensitive";
export type MetricArea = "overview" | "content" | "events" | "recruitment" | "workflow" | "team" | "platform" | "messages";

export interface MetricDefinition {
  key: string;
  area: MetricArea;
  label: string;
  description: string;
  /** Source tables or records, in words a future maintainer can check. */
  source: string;
  formula: string;
  unit: "count" | "ratio" | "hours";
  quality: MetricQuality;
  time: MetricTime;
  refresh: "hourly" | "live" | "never";
  privacy: MetricPrivacy;
  /** Shown only from the small-group threshold (outcomes and campus-wide recruitment). */
  threshold?: boolean;
  /** Bumped when the definition changes. */
  version: number;
}

const m = (d: Omit<MetricDefinition, "version"> & { version?: number }): MetricDefinition => ({ version: 1, ...d });

export const METRICS = [
  // ---- Overview (analytics.view) -----------------------------------------------------------------------
  m({
    key: "overview.posts_online", area: "overview", label: "Articles en ligne",
    description: "Les articles de l'asso lisibles sur le site en ce moment.",
    source: "posts (publication = published, non masqués)", formula: "nombre d'articles publiés et non masqués",
    unit: "count", quality: "operational", time: "now", refresh: "live", privacy: "public",
  }),
  m({
    key: "overview.events_upcoming", area: "overview", label: "Événements à venir",
    description: "Les événements publiés, non annulés, qui n'ont pas encore commencé.",
    source: "events", formula: "publiés, programmés, début après maintenant",
    unit: "count", quality: "operational", time: "now", refresh: "live", privacy: "public",
  }),
  m({
    key: "overview.registrations_upcoming", area: "overview", label: "Places réservées à venir",
    description: "Les inscriptions confirmées aux événements qui ne sont pas terminés. Une inscription n'est pas une présence.",
    source: "event_registrations (status = confirmed) des événements non terminés", formula: "nombre d'inscriptions confirmées",
    unit: "count", quality: "operational", time: "now", refresh: "live", privacy: "internal",
  }),
  m({
    key: "overview.campaigns_open", area: "overview", label: "Recrutements ouverts",
    description: "Les campagnes qui acceptent des candidatures en ce moment.",
    source: "recruitment_campaigns (état open)", formula: "nombre de campagnes ouvertes",
    unit: "count", quality: "operational", time: "now", refresh: "live", privacy: "public",
  }),

  // ---- Articles (analytics.content.view) ------------------------------------------------------------------
  m({
    key: "posts.published", area: "content", label: "Articles publiés",
    description: "Les articles mis en ligne pour la première fois pendant la période. Un article modifié et republié reste un seul article.",
    source: "posts.first_published_at (une ligne par article, jamais par version)", formula: "nombre d'articles dont la première publication tombe dans la période",
    unit: "count", quality: "operational", time: "event_time", refresh: "hourly", privacy: "public",
  }),
  m({
    key: "content.online", area: "content", label: "En ligne",
    description: "Articles lisibles sur le site en ce moment.",
    source: "posts", formula: "publication = published, non masqués", unit: "count", quality: "operational", time: "now", refresh: "live", privacy: "public",
  }),
  m({
    key: "content.drafts", area: "content", label: "Brouillons",
    description: "Articles jamais publiés, en cours d'écriture.",
    source: "posts", formula: "jamais publiés", unit: "count", quality: "operational", time: "now", refresh: "live", privacy: "internal",
  }),
  m({
    key: "content.scheduled", area: "content", label: "Programmés",
    description: "Articles programmés qui partiront plus tard.",
    source: "posts (schedule_status = pending)", formula: "programmation en attente, date à venir",
    unit: "count", quality: "operational", time: "now", refresh: "live", privacy: "internal",
  }),
  m({
    key: "content.approvals_waiting", area: "content", label: "En attente de relecture",
    description: "Versions envoyées en relecture qui attendent une réponse.",
    source: "post_revisions (status = submitted)", formula: "nombre de versions soumises", unit: "count", quality: "operational", time: "now", refresh: "live", privacy: "internal",
  }),
  m({
    key: "content.offline", area: "content", label: "Retirés du site",
    description: "Articles publiés un jour, retirés depuis par l'asso.",
    source: "posts", formula: "déjà publiés, aujourd'hui hors ligne", unit: "count", quality: "operational", time: "now", refresh: "live", privacy: "internal",
  }),
  m({
    key: "content.hidden", area: "content", label: "Masqués par le BDE",
    description: "Articles masqués par la modération.",
    source: "posts.hidden_at", formula: "nombre d'articles masqués", unit: "count", quality: "operational", time: "now", refresh: "live", privacy: "internal",
  }),
  m({
    key: "content.reviews.median_hours", area: "content", label: "Temps de relecture (médiane)",
    description: "La moitié des versions approuvées pendant la période l'ont été en moins de ce temps, depuis leur envoi en relecture.",
    source: "post_reviews (approved) et post_revisions.submitted_at", formula: "médiane de (approbation − envoi) en heures",
    unit: "hours", quality: "derived", time: "event_time", refresh: "live", privacy: "internal",
  }),

  // ---- Events (analytics.events.view) ---------------------------------------------------------------------
  m({
    key: "events.published", area: "events", label: "Événements publiés",
    description: "Événements mis en ligne pour la première fois pendant la période.",
    source: "events.first_published_at", formula: "nombre d'événements", unit: "count", quality: "operational", time: "event_time", refresh: "hourly", privacy: "public",
  }),
  m({
    key: "events.held", area: "events", label: "Événements passés",
    description: "Événements terminés pendant la période sans avoir été annulés. La plateforme ne sait pas qui est venu.",
    source: "events (fin dans la période, non annulés)", formula: "nombre d'événements terminés",
    unit: "count", quality: "operational", time: "event_time", refresh: "hourly", privacy: "public",
  }),
  m({
    key: "events.cancelled", area: "events", label: "Événements annulés",
    description: "Événements annulés pendant la période, après leur publication.",
    source: "events.cancelled_at", formula: "nombre d'annulations", unit: "count", quality: "operational", time: "event_time", refresh: "hourly", privacy: "public",
  }),
  m({
    key: "registrations.created", area: "events", label: "Inscriptions faites",
    description: "Toutes les inscriptions faites pendant la période (places et liste d'attente), même annulées depuis.",
    source: "event_registrations.created_at", formula: "nombre d'inscriptions créées", unit: "count", quality: "operational", time: "event_time", refresh: "hourly", privacy: "internal",
  }),
  m({
    key: "registrations.waitlisted", area: "events", label: "Entrées en liste d'attente",
    description: "Inscriptions passées par la liste d'attente pendant la période. Être en attente n'est pas avoir une place.",
    source: "event_registrations.waitlisted_at", formula: "nombre d'entrées en attente", unit: "count", quality: "operational", time: "event_time", refresh: "hourly", privacy: "internal",
  }),
  m({
    key: "registrations.promoted", area: "events", label: "Passages de l'attente à une place",
    description: "Personnes en attente qui ont obtenu une place pendant la période.",
    source: "event_registrations.promoted_at", formula: "nombre de promotions", unit: "count", quality: "operational", time: "event_time", refresh: "hourly", privacy: "internal",
  }),
  m({
    key: "registrations.cancelled", area: "events", label: "Désinscriptions",
    description: "Inscriptions annulées pendant la période, par la personne elle-même ou par l'organisation.",
    source: "event_registrations.cancelled_at, cancel_source", formula: "nombre d'annulations", unit: "count", quality: "operational", time: "event_time", refresh: "hourly", privacy: "internal",
  }),
  m({
    key: "event.confirmed", area: "events", label: "Inscriptions confirmées",
    description: "Places confirmées en ce moment pour cet événement. Ce n'est pas une présence : il n'y a pas de pointage à l'entrée.",
    source: "event_registrations (status = confirmed)", formula: "nombre de places confirmées", unit: "count", quality: "operational", time: "now", refresh: "live", privacy: "internal",
  }),
  m({
    key: "event.utilization", area: "events", label: "Remplissage",
    description: "Places confirmées sur la capacité. Sans capacité fixée, il n'y a pas de remplissage.",
    source: "event_registrations et events.capacity", formula: "confirmées ÷ capacité (inscriptions sur la plateforme seulement)",
    unit: "ratio", quality: "derived", time: "now", refresh: "live", privacy: "internal",
  }),

  // ---- Recruitment (analytics.recruitment.view) ---------------------------------------------------------
  m({
    key: "applications.submitted", area: "recruitment", label: "Candidatures envoyées",
    description: "Candidatures envoyées pendant la période, retirées ensuite comprises. Une personne qui postule à deux postes compte deux candidatures.",
    source: "applications.submitted_at", formula: "nombre de candidatures envoyées", unit: "count", quality: "operational", time: "event_time", refresh: "hourly", privacy: "sensitive",
  }),
  m({
    key: "applications.withdrawn", area: "recruitment", label: "Candidatures retirées",
    description: "Candidatures envoyées puis retirées par la personne, pendant la période.",
    source: "applications.withdrawn_at", formula: "nombre de retraits après envoi", unit: "count", quality: "operational", time: "event_time", refresh: "hourly", privacy: "sensitive",
  }),
  m({
    key: "applications.started", area: "recruitment", label: "Candidatures commencées",
    description: "Brouillons de candidature ouverts pendant la période (envoyés ou non). Jamais qui, jamais leur contenu.",
    source: "applications.created_at", formula: "nombre de candidatures créées", unit: "count", quality: "operational", time: "event_time", refresh: "hourly", privacy: "sensitive",
  }),
  m({
    key: "recruitment.candidates", area: "recruitment", label: "Candidat·es distinct·es",
    description: "Personnes différentes ayant envoyé au moins une candidature à l'asso pendant la période.",
    source: "applications (candidate_id distincts)", formula: "nombre de personnes distinctes", unit: "count", quality: "operational", time: "event_time", refresh: "live", privacy: "sensitive",
  }),
  m({
    key: "campaign.funnel", area: "recruitment", label: "Étapes de la campagne",
    description: "Pour toute la campagne : commencées, envoyées, relues (au moins une évaluation remise), présélectionnées, en entretien. Les étapes ne s'affichent qu'à partir du seuil de confidentialité.",
    source: "applications, recruitment_reviews, application_pipeline et son historique, recruitment_interviews",
    formula: "nombre de candidatures ayant atteint chaque étape", unit: "count", quality: "operational", time: "cohort", refresh: "live", privacy: "sensitive", threshold: true,
  }),
  m({
    key: "campaign.submission_rate", area: "recruitment", label: "Taux d'envoi",
    description: "Part des candidatures commencées qui ont été envoyées. Sans candidature commencée, pas de taux.",
    source: "applications", formula: "envoyées ÷ commencées", unit: "ratio", quality: "derived", time: "cohort", refresh: "live", privacy: "sensitive",
  }),
  m({
    key: "campaign.interview_rate", area: "recruitment", label: "Taux d'entretien",
    description: "Part des candidatures envoyées qui ont atteint l'entretien.",
    source: "recruitment_interviews", formula: "en entretien ÷ envoyées", unit: "ratio", quality: "derived", time: "cohort", refresh: "live", privacy: "sensitive", threshold: true,
  }),
  m({
    key: "campaign.outcomes", area: "recruitment", label: "Décisions annoncées",
    description: "Décisions annoncées aux candidat·es (offre, refus, liste d'attente). Une décision prise mais pas encore annoncée n'y figure pas. Petits groupes masqués.",
    source: "recruitment_decisions (released)", formula: "nombre par issue, après masquage", unit: "count", quality: "operational", time: "cohort", refresh: "live", privacy: "sensitive", threshold: true,
  }),
  m({
    key: "campaign.offers", area: "recruitment", label: "Réponses aux offres",
    description: "Offres acceptées, déclinées, en attente ou expirées. Petits groupes masqués.",
    source: "recruitment_offers", formula: "nombre par statut, après masquage", unit: "count", quality: "operational", time: "cohort", refresh: "live", privacy: "sensitive", threshold: true,
  }),
  m({
    key: "campaign.acceptance_rate", area: "recruitment", label: "Taux d'acceptation",
    description: "Part des offres annoncées qui ont été acceptées.",
    source: "recruitment_offers", formula: "acceptées ÷ offres", unit: "ratio", quality: "derived", time: "cohort", refresh: "live", privacy: "sensitive", threshold: true,
  }),

  // ---- Workflow (analytics.recruitment.workflow.view) ----------------------------------------------------
  m({
    key: "workflow.items", area: "workflow", label: "Travail en cours",
    description: "Ce qui reste à faire en ce moment : candidatures à attribuer, évaluations manquantes, entretiens à caler, décisions à valider ou à annoncer, offres sans réponse. Jamais par évaluateur·rice.",
    source: "recruitment_review_assignments, recruitment_reviews, recruitment_interviews, recruitment_decisions, recruitment_offers",
    formula: "nombre d'éléments par étape", unit: "count", quality: "operational", time: "now", refresh: "live", privacy: "internal",
  }),

  // ---- Team (governance.view) ----------------------------------------------------------------------------
  m({
    key: "team.members_active", area: "team", label: "Membres actifs",
    description: "Adhésions actives à l'asso (une par personne). Les membres suspendus sont comptés à part.",
    source: "memberships (status = active)", formula: "nombre d'adhésions actives", unit: "count", quality: "operational", time: "now", refresh: "live", privacy: "internal",
  }),
  m({
    key: "team.mandates_ending_60d", area: "team", label: "Mandats qui finissent sous 60 jours",
    description: "Postes dont le mandat se termine dans les 60 prochains jours.",
    source: "position_assignments.ends_at", formula: "nombre de mandats", unit: "count", quality: "operational", time: "now", refresh: "live", privacy: "internal",
  }),

  // ---- Platform (platform.analytics.view) -----------------------------------------------------------------
  m({
    key: "platform.associations_active", area: "platform", label: "Assos actives",
    description: "Associations actives sur la plateforme (le BDE à part).",
    source: "organizations (kind = association, status = active)", formula: "nombre", unit: "count", quality: "operational", time: "now", refresh: "live", privacy: "public",
  }),
  m({
    key: "platform.members_distinct", area: "platform", label: "Étudiant·es membres",
    description: "Personnes différentes membres d'au moins une asso active. Une personne membre de trois assos compte une fois.",
    source: "memberships (user_id distincts)", formula: "nombre de personnes distinctes", unit: "count", quality: "operational", time: "now", refresh: "live", privacy: "internal",
  }),
  m({
    key: "platform.memberships_active", area: "platform", label: "Adhésions",
    description: "Adhésions actives, toutes assos confondues (une personne membre de trois assos en compte trois).",
    source: "memberships (status = active)", formula: "nombre d'adhésions", unit: "count", quality: "operational", time: "now", refresh: "live", privacy: "internal",
  }),
  m({
    key: "platform.recruitment_by_association", area: "platform", label: "Candidatures par asso",
    description: "Candidatures envoyées pendant la période, par asso. Une asso sous le seuil n'est pas montrée, et une seconde au moins est masquée avec elle.",
    source: "applications.submitted_at", formula: "nombre par asso, après masquage", unit: "count", quality: "operational", time: "event_time", refresh: "hourly", privacy: "sensitive", threshold: true,
  }),

  // ---- Messages (platform.communications.monitor) ---------------------------------------------------------
  m({
    key: "notifications.created", area: "messages", label: "Notifications créées",
    description: "Notifications créées sur le site pendant la période (toutes personnes confondues, jamais lesquelles).",
    source: "notifications.created_at", formula: "nombre", unit: "count", quality: "operational", time: "event_time", refresh: "hourly", privacy: "internal",
  }),
  m({
    key: "deliveries.accepted", area: "messages", label: "E-mails acceptés par le prestataire",
    description: "E-mails pris en charge par le prestataire d'envoi. Accepté ne veut pas dire reçu, encore moins lu.",
    source: "notification_deliveries.accepted_at", formula: "nombre", unit: "count", quality: "operational", time: "event_time", refresh: "hourly", privacy: "internal",
  }),
  m({
    key: "deliveries.delivered", area: "messages", label: "E-mails remis",
    description: "E-mails que le prestataire a confirmés remis à la messagerie du destinataire, quand il le confirme. Remis ne veut pas dire lu.",
    source: "notification_deliveries.delivered_at", formula: "nombre", unit: "count", quality: "operational", time: "event_time", refresh: "hourly", privacy: "internal",
  }),
  m({
    key: "deliveries.failed", area: "messages", label: "Échecs définitifs",
    description: "E-mails que le prestataire n'a pas pu remettre, après les nouvelles tentatives.",
    source: "notification_deliveries (failed_permanent)", formula: "nombre", unit: "count", quality: "operational", time: "event_time", refresh: "hourly", privacy: "internal",
  }),
  m({
    key: "deliveries.suppressed", area: "messages", label: "Non envoyés (choix ou adresse bloquée)",
    description: "E-mails non envoyés parce que la personne ne les veut pas ou que l'adresse est bloquée.",
    source: "notification_deliveries (suppressed)", formula: "nombre", unit: "count", quality: "operational", time: "event_time", refresh: "hourly", privacy: "internal",
  }),

  // ---- What the platform does not measure -----------------------------------------------------------------
  m({
    key: "unavailable.attendance", area: "events", label: "Présence réelle",
    description: "Qui est vraiment venu. Il n'y a pas de pointage à l'entrée : une inscription n'est pas une présence.",
    source: "aucune", formula: "—", unit: "count", quality: "unavailable", time: "event_time", refresh: "never", privacy: "internal",
  }),
  m({
    key: "unavailable.views", area: "content", label: "Vues et lectures",
    description: "Combien de fois une page a été vue ou un article lu. La mesure d'audience n'est pas activée (voir la documentation).",
    source: "aucune", formula: "—", unit: "count", quality: "unavailable", time: "event_time", refresh: "never", privacy: "internal",
  }),
  m({
    key: "unavailable.visitors", area: "platform", label: "Visiteurs uniques",
    description: "Le nombre de personnes différentes venues sur le site. Rien ne permet de les compter sans suivre les gens.",
    source: "aucune", formula: "—", unit: "count", quality: "unavailable", time: "event_time", refresh: "never", privacy: "internal",
  }),
  m({
    key: "unavailable.engagement", area: "content", label: "J'aime, partages, commentaires",
    description: "Le site n'a ni « j'aime », ni commentaires, et un bouton « Copier le lien » ne prouve aucun partage.",
    source: "aucune", formula: "—", unit: "count", quality: "unavailable", time: "event_time", refresh: "never", privacy: "public",
  }),
  m({
    key: "unavailable.email_opens", area: "messages", label: "E-mails ouverts",
    description: "Aucun pixel de suivi n'est mis dans les e-mails : on ne sait pas qui les ouvre, et c'est voulu.",
    source: "aucune", formula: "—", unit: "count", quality: "unavailable", time: "event_time", refresh: "never", privacy: "internal",
  }),
] as const satisfies readonly MetricDefinition[];

export type MetricKey = (typeof METRICS)[number]["key"];

const BY_KEY = new Map<string, MetricDefinition>(METRICS.map((d) => [d.key, d]));

export function metric(key: MetricKey): MetricDefinition {
  return BY_KEY.get(key)!;
}

export function hasMetric(key: string): boolean {
  return BY_KEY.has(key);
}

/** The daily counts the database keeps (private.analytics_daily), each mapped to its definition. */
export const DAILY_METRICS = [
  "posts.published",
  "events.published",
  "events.held",
  "events.cancelled",
  "registrations.created",
  "registrations.waitlisted",
  "registrations.promoted",
  "registrations.cancelled",
  "applications.started",
  "applications.submitted",
  "applications.withdrawn",
  "decisions.released",
  "offers.responded",
  "notifications.created",
  "deliveries.queued",
  "deliveries.accepted",
  "deliveries.delivered",
  "deliveries.failed",
  "deliveries.suppressed",
] as const;

export const QUALITY_LABEL: Record<MetricQuality, string> = {
  operational: "Compté",
  derived: "Calculé",
  unavailable: "Non mesuré",
};

export const TIME_LABEL: Record<MetricTime, string> = {
  event_time: "Pendant la période",
  now: "En ce moment",
  cohort: "Toute la campagne",
};

export const UNAVAILABLE: MetricKey[] = [
  "unavailable.attendance",
  "unavailable.views",
  "unavailable.visitors",
  "unavailable.engagement",
  "unavailable.email_opens",
];
