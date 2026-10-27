/**
 * The words of the messages Phase 10 added: account security, governance,
 * publishing, and campus updates (BDE announcements, association messages,
 * followed associations). Same rule as the event and application words:
 * built from the notification's frozen payload, public or already-known
 * facts only, never a reason the team keeps to itself. Pure module (Intl only).
 */

import { messageWhen } from "./events.ts";

export type PlatformMessageKind =
  | "account_mfa_enabled"
  | "account_mfa_disabled"
  | "account_privilege_changed"
  | "account_platform_role_changed"
  | "governance_invitation_received"
  | "governance_candidacy_received"
  | "governance_approval_required"
  | "governance_bde_vacancy"
  | "governance_invitation_answered"
  | "governance_transition_completed"
  | "governance_transition_closed"
  | "governance_mandate_expiring"
  | "governance_issue_alert"
  | "platform_health_report"
  | "content_approval_requested"
  | "content_approval_pending"
  | "content_review_done"
  | "content_schedule_failed"
  | "content_moderated"
  | "campus_announcement"
  | "association_message"
  | "followed_announcement"
  | "followed_post_published"
  | "followed_event_published"
  | "followed_recruitment_opened";

export const PLATFORM_KINDS: readonly PlatformMessageKind[] = [
  "account_mfa_enabled",
  "account_mfa_disabled",
  "account_privilege_changed",
  "account_platform_role_changed",
  "governance_invitation_received",
  "governance_candidacy_received",
  "governance_approval_required",
  "governance_bde_vacancy",
  "governance_invitation_answered",
  "governance_transition_completed",
  "governance_transition_closed",
  "governance_mandate_expiring",
  "governance_issue_alert",
  "platform_health_report",
  "content_approval_requested",
  "content_approval_pending",
  "content_review_done",
  "content_schedule_failed",
  "content_moderated",
  "campus_announcement",
  "association_message",
  "followed_announcement",
  "followed_post_published",
  "followed_event_published",
  "followed_recruitment_opened",
];

export const isPlatformMessage = (kind: string): kind is PlatformMessageKind => (PLATFORM_KINDS as readonly string[]).includes(kind);

export interface PlatformMessagePayload {
  title?: string | null;
  body?: string | null;
  link?: string | null;
  organization?: string | null;
  organization_slug?: string | null;
  slug?: string | null;
  position?: string | null;
  office?: string | null;
  role?: string | null;
  change?: "granted" | "removed" | string;
  kind?: string | null;
  status?: string | null;
  answer?: string | null;
  person?: string | null;
  by_name?: string | null;
  decision?: string | null;
  hidden?: boolean;
  error?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  closes_at?: string | null;
  expires_at?: string | null;
  days?: number;
  member?: boolean;
  post_id?: string | null;
  // Phase 11: continuity issues (governance_issue_alert) and the weekly report.
  issue?: string | null;
  severity?: string | null;
  /** Who reads it: association · platform · guardian · operations · self (decides the page it opens). */
  target?: string | null;
  escalated?: boolean;
  transition_kind?: string | null;
  candidates_pending?: number;
  missing_approvals?: string[] | null;
  count?: number;
  campaign?: string | null;
  job?: string | null;
  health?: string | null;
  last_succeeded_at?: string | null;
  record?: string | null;
  renewal_on?: string | null;
  week?: string | null;
  associations_without_president?: number;
  successions_missing?: number;
  mandates_expiring_30?: number;
  transitions_pending?: number;
  jobs_unhealthy?: number;
  failed_deliveries_7d?: number;
  reviewer_access_expiring?: number;
  backups_verified?: number;
  open_incidents?: number;
}

/** The recurring jobs, in words (also used by the continuity pages). */
export const JOB_WORDS: Record<string, string> = {
  "publish-scheduled-posts": "Publications programmées",
  "notifications-dispatch": "Envoi des e-mails",
  "notification-reminders": "Rappels (événements, entretiens, relectures)",
  "recruitment-review-jobs": "Annonces programmées des décisions de recrutement",
  "enqueue-recruitment-reminders": "Rappels de candidature",
  "governance-health": "Vérification de la continuité",
  "storage-cleanup": "Nettoyage des fichiers supprimés",
  "purge-recruitment-data": "Conservation des candidatures",
  "data-retention": "Conservation des données",
  "platform-health-report": "Point hebdomadaire de continuité",
};

/** The institutional register's lines, in words (also used by the continuity pages). */
export const RECORD_WORDS: Record<string, string> = {
  supabase_project: "Projet Supabase (base de données, comptes, fichiers)",
  hosting: "Hébergement du site",
  uptime_monitor: "Surveillance extérieure du site",
  source_repository: "Dépôt du code",
  domain: "Nom de domaine",
  dns: "Gestion DNS",
  https_certificates: "Certificats HTTPS",
  email_provider: "Service d'envoi des e-mails",
  email_domain: "Domaine d'envoi des e-mails",
  supabase_billing: "Facturation Supabase",
  hosting_billing: "Facturation de l'hébergement",
  technical_owner: "Responsable technique de l'institution",
  privacy_contact: "Contact données personnelles et sécurité",
  recovery_procedure: "Procédure de récupération des accès",
  storage_copies: "Copies des fichiers (Storage)",
};

const APPROVAL_WORDS: Record<string, string> = {
  bde_president: "l'approbation de la présidence du BDE",
  bde_vice_president: "l'approbation de la vice-présidence du BDE",
  guardian: "l'approbation du ou de la garant·e de continuité",
};

const HEALTH_WORDS: Record<string, string> = {
  late: "en retard",
  failing: "en échec",
  never_run: "jamais exécutée",
  not_scheduled: "non programmée",
};

function plural(n: number, one: string, many: string): string {
  return `${n} ${n > 1 ? many : one}`;
}

function issueMessage(p: PlatformMessagePayload, org: string): { title: string; body: string } {
  const office = OFFICE_WORDS[p.office ?? ""] ?? "la présidence";
  const when = (iso: string | null | undefined) => (iso ? `le ${messageWhen(iso)}` : "bientôt");
  switch (p.issue) {
    case "bde_office_vacant":
      return {
        title: `${cap(office)} est vacante`,
        body:
          p.target === "guardian"
            ? "Personne n'occupe ce poste. En tant que garant·e de continuité, tu peux suivre la passation ou rétablir le poste depuis la page Continuité."
            : "Personne n'occupe ce poste. Une passation du BDE peut le pourvoir : elle demande l'accord du membre du bureau en poste et du ou de la garant·e de continuité.",
      };
    case "association_president_vacant":
      return {
        title: `${org} n'a plus de présidence`,
        body:
          "Les droits de gestion de l'asso ne s'appliquent plus à personne. Le BDE peut nommer une présidence depuis le centre de contrôle, " +
          "avec une raison écrite ; la personne nommée accepte avec son propre compte.",
      };
    case "succession_missing":
      if (p.target === "association") {
        return {
          title: `Pas encore de succession : ${org}`,
          body:
            `La présidence de ${org} finit ${when(p.ends_at)}. Propose la personne qui suivra depuis Gouvernance : ` +
            "elle accepte avec son propre compte, et le mandat commence à la date prévue.",
        };
      }
      if (p.office === "bde_president" || p.office === "bde_vice_president") {
        return {
          title: `Passation du BDE à lancer : ${office}`,
          body:
            p.target === "guardian"
              ? `Le mandat finit ${when(p.ends_at)} et aucune passation n'est lancée. Si le poste devient vacant, tu pourras le rétablir depuis Continuité.`
              : `Le mandat finit ${when(p.ends_at)} et aucune passation n'est lancée. Les deux membres du bureau l'approuvent, puis les personnes choisies acceptent.`,
        };
      }
      return {
        title: `${org} : pas de succession prévue`,
        body: `La présidence de ${org} finit ${when(p.ends_at)} et aucune succession n'est proposée. Sans passation, l'asso n'aura plus de présidence à cette date.`,
      };
    case "transition_pending": {
      const parts: string[] = [];
      const pending = p.candidates_pending ?? 0;
      if (pending > 0) parts.push(pending > 1 ? "l'acceptation des personnes proposées" : "l'acceptation de la personne proposée");
      for (const capacity of p.missing_approvals ?? []) if (APPROVAL_WORDS[capacity]) parts.push(APPROVAL_WORDS[capacity]);
      return {
        title: `Passation en attente : ${org}`,
        body:
          (parts.length ? `Il manque ${parts.join(" et ")}.` : "Elle attend encore une étape.") +
          (p.expires_at ? ` Sans réponse, elle expire ${when(p.expires_at)} et rien ne change.` : ""),
      };
    }
    case "approver_missing":
      return {
        title: `Articles sans relecture possible : ${org}`,
        body:
          `${plural(p.count ?? 1, "article attend", "articles attendent")} depuis plus de deux jours, et personne d'autre que leur auteur·rice ` +
          "ne peut les approuver. Donne le droit d'approuver à un autre poste de l'équipe.",
      };
    case "reviewer_access_expiring":
      return {
        title: `Accès au comité qui finissent : ${p.campaign || org}`,
        body:
          `${plural(p.count ?? 1, "accès au comité finit", "accès au comité finissent")} ${when(p.ends_at)}, alors que des candidatures attendent une décision. ` +
          "Prolonge-les ou confie les candidatures à quelqu'un d'autre.",
      };
    case "guardian_missing":
      return {
        title: "Pas de garant·e de continuité",
        body:
          "Personne ne peut rétablir la présidence du BDE si elle devient vacante. Ce rôle se donne hors du site, " +
          "par la procédure d'installation : voir le guide du responsable technique.",
      };
    case "guardian_mfa_missing":
      return {
        title: "Active la double authentification",
        body: "Ton rôle de garant·e en a besoin pour rétablir une présidence. Active-la depuis Sécurité.",
      };
    case "officer_mfa_missing":
      return {
        title: "Active la double authentification",
        body:
          "Ton poste en a besoin pour certaines actions (passation, envoi par e-mail, exports). " +
          "Active-la depuis Sécurité : elle protège ton compte, que tu es seul·e à utiliser.",
      };
    case "job_unhealthy":
      return {
        title: `Tâche automatique ${HEALTH_WORDS[p.health ?? ""] ?? "à vérifier"} : ${JOB_WORDS[p.job ?? ""] ?? "une tâche"}`,
        body:
          `Dernière exécution réussie : ${p.last_succeeded_at ? messageWhen(p.last_succeeded_at) : "aucune"}. ` +
          "Le détail et la relance sont dans Continuité, rubrique Opérations.",
      };
    case "renewal_due":
      return {
        title: `Renouvellement à prévoir : ${RECORD_WORDS[p.record ?? ""] ?? "un service"}`,
        body:
          `Le registre indique un renouvellement ${when(p.renewal_on)}. Vérifie-le auprès de la personne qui détient le compte, ` +
          "puis mets le registre à jour.",
      };
    default:
      return { title: "Un point de continuité à regarder", body: "Le détail est sur la page Continuité." };
  }
}

function healthReport(p: PlatformMessagePayload): { title: string; body: string } {
  const lines: string[] = [];
  const add = (n: number | undefined, one: string, many: string) => {
    if (n && n > 0) lines.push(plural(n, one, many));
  };
  add(p.associations_without_president, "asso sans présidence", "assos sans présidence");
  add(p.successions_missing, "succession à prévoir", "successions à prévoir");
  add(p.mandates_expiring_30, "mandat finit dans les 30 jours", "mandats finissent dans les 30 jours");
  add(p.transitions_pending, "passation en attente", "passations en attente");
  add(p.reviewer_access_expiring, "recrutement a des accès qui expirent", "recrutements ont des accès qui expirent");
  add(p.jobs_unhealthy, "tâche automatique à vérifier", "tâches automatiques à vérifier");
  add(p.failed_deliveries_7d, "e-mail non remis cette semaine", "e-mails non remis cette semaine");
  add(p.open_incidents, "incident ouvert", "incidents ouverts");
  const backups = `Sauvegardes : ${p.backups_verified ?? 0} vérification${(p.backups_verified ?? 0) > 1 ? "s" : ""} sur 4 à jour.`;
  return {
    title: `Point de continuité${p.week ? ` · ${p.week}` : ""}`,
    body: (lines.length ? `${cap(lines.join(", "))}.` : "Rien à signaler sur les présidences, les passations et les tâches automatiques.") + ` ${backups}`,
  };
}

const OFFICE_WORDS: Record<string, string> = {
  association_president: "la présidence",
  bde_president: "la présidence du BDE",
  bde_vice_president: "la vice-présidence du BDE",
};

const ROLE_WORDS: Record<string, string> = {
  guardian: "garant·e de continuité",
  privacy_officer: "chargé·e des demandes sur les données des candidat·es",
};

const TRANSITION_WORDS: Record<string, string> = {
  association_succession: "succession à la présidence",
  association_appointment: "nomination à la présidence",
  bde_succession: "passation du BDE",
  bde_recovery: "rétablissement de la présidence du BDE",
};

function quote(title: string | null | undefined): string {
  const t = (title ?? "").trim();
  return t ? `« ${t} »` : "un article";
}

export function platformMessage(kind: PlatformMessageKind, p: PlatformMessagePayload): { title: string; body: string } {
  const org = p.organization ?? "L'asso";
  const by = p.by_name ?? "Quelqu'un";
  switch (kind) {
    case "account_mfa_enabled":
      return {
        title: "Double authentification activée",
        body:
          "Elle est maintenant demandée à chaque connexion à ton compte. " +
          "Si ce n'est pas toi, retire-la depuis Sécurité, déconnecte-toi partout et préviens le BDE.",
      };
    case "account_mfa_disabled":
      return {
        title: "Double authentification retirée",
        body: "Ton compte ne la demande plus. Si ce n'est pas toi, réactive-la tout de suite depuis Sécurité et préviens le BDE.",
      };
    case "account_privilege_changed":
      return p.change === "removed"
        ? {
            title: `Poste terminé : ${p.position ?? "un poste"} · ${org}`,
            body: "Les droits de gestion de ce poste ne s'appliquent plus à ton compte.",
          }
        : {
            title: `Nouveau poste : ${p.position ?? "un poste"} · ${org}`,
            body:
              `Ce poste te donne des droits de gestion dans ${org}${p.ends_at ? ` jusqu'au ${messageWhen(p.ends_at)}` : ""}. ` +
              "Si ce n'est pas normal, préviens la présidence de l'asso.",
          };
    case "account_platform_role_changed": {
      const role = ROLE_WORDS[p.role ?? ""] ?? "un rôle de la plateforme";
      return p.change === "removed"
        ? { title: "Rôle de plateforme terminé", body: `Tu n'es plus ${role}.` }
        : {
            title: "Nouveau rôle de plateforme",
            body: `Tu es maintenant ${role}. Si ce n'est pas normal, préviens la personne responsable du site.`,
          };
    }
    case "governance_invitation_received":
      return {
        title: `Invitation : ${org}`,
        body:
          `${by} t'invite à rejoindre l'équipe de ${org}${p.position ? `, au poste « ${p.position} »` : ""}. ` +
          "Accepte ou refuse depuis ton espace, rubrique Invitations.",
      };
    case "governance_candidacy_received":
      return {
        title: `On te propose ${OFFICE_WORDS[p.office ?? ""] ?? "une présidence"} : ${org}`,
        body:
          `${by} te propose ${OFFICE_WORDS[p.office ?? ""] ?? "une présidence"} de ${org}. ` +
          `Accepte ou refuse depuis Invitations${p.expires_at ? `, avant le ${messageWhen(p.expires_at)}` : ""}.`,
      };
    case "governance_approval_required":
      return {
        title: "Une passation attend ton approbation",
        body:
          `${by} a lancé une ${TRANSITION_WORDS[p.kind ?? ""] ?? "passation"}. Elle n'aboutit qu'avec ton approbation : ` +
          `réponds depuis Invitations${p.expires_at ? `, avant le ${messageWhen(p.expires_at)}` : ""}.`,
      };
    case "governance_bde_vacancy":
      return {
        title: "Le BDE n'a plus de présidence",
        body:
          "Aucune présidence du BDE n'est en poste. En tant que garant·e de continuité, tu peux rétablir une présidence " +
          "depuis la page Continuité.",
      };
    case "governance_invitation_answered":
      return p.answer === "accepted"
        ? { title: `${p.person ?? "La personne invitée"} a rejoint ${org}`, body: "Ton invitation a été acceptée. La personne apparaît dans l'équipe." }
        : { title: `Invitation déclinée : ${org}`, body: `${p.person ?? "La personne invitée"} a décliné ton invitation.` };
    case "governance_transition_completed":
      return {
        title: `${cap(TRANSITION_WORDS[p.kind ?? ""] ?? "passation")} terminée : ${org}`,
        body: p.member
          ? `La présidence de ${org} a changé. L'équipe et ses postes sont à jour dans l'espace de l'asso.`
          : "Les nouveaux mandats sont en place.",
      };
    case "governance_transition_closed":
      return {
        title: `${cap(TRANSITION_WORDS[p.kind ?? ""] ?? "passation")} ${p.status === "expired" ? "expirée" : "annulée"} : ${org}`,
        body: "Rien n'a changé. Une nouvelle proposition peut être faite.",
      };
    case "governance_mandate_expiring":
      return {
        title: `Ton mandat se termine bientôt : ${p.position ?? "ton poste"}`,
        body:
          `Ton poste « ${p.position ?? "—"} » dans ${org} prend fin ${p.ends_at ? `le ${messageWhen(p.ends_at)}` : "bientôt"}. ` +
          (p.office ? "Pense à proposer ta succession depuis Gouvernance." : "Parles-en à la présidence si tu continues."),
      };
    case "governance_issue_alert":
      return issueMessage(p, org);
    case "platform_health_report":
      return healthReport(p);
    case "content_approval_requested":
      return { title: `Article à relire : ${quote(p.title)}`, body: `${by} a soumis un article de ${org} à relecture.` };
    case "content_approval_pending":
      return { title: `Toujours à relire : ${quote(p.title)}`, body: `Cet article de ${org} attend une relecture depuis deux jours.` };
    case "content_review_done":
      return p.decision === "approved"
        ? { title: `Article approuvé : ${quote(p.title)}`, body: `${by} a approuvé ton article : il peut être publié.` }
        : { title: `Modifications demandées : ${quote(p.title)}`, body: `${by} demande des modifications avant publication. Le détail est dans l'éditeur.` };
    case "content_schedule_failed":
      return {
        title: `Publication programmée non faite : ${quote(p.title)}`,
        body: "L'article n'a pas pu être publié à l'heure prévue. Ouvre-le pour voir pourquoi et le programmer à nouveau.",
      };
    case "content_moderated":
      return p.hidden
        ? { title: `Article masqué par le BDE : ${quote(p.title)}`, body: "Il n'est plus visible sur le site. La raison est indiquée dans l'éditeur." }
        : { title: `Article rétabli : ${quote(p.title)}`, body: "Le BDE a levé le masquage : l'article est de nouveau visible s'il est publié." };
    case "campus_announcement":
      return { title: p.title ?? "Annonce du BDE", body: p.body ?? "" };
    case "association_message":
    case "followed_announcement":
      return { title: `${org} : ${p.title ?? "message"}`, body: p.body ?? "" };
    case "followed_post_published":
      return { title: `Nouvel article de ${org} : ${quote(p.title)}`, body: `${org}, que tu suis, a publié un article.` };
    case "followed_event_published":
      return {
        title: `Nouvel événement de ${org} : ${p.title ?? "un événement"}`,
        body: `${org}, que tu suis, a publié un événement${p.starts_at ? ` le ${messageWhen(p.starts_at)}` : ""}.`,
      };
    case "followed_recruitment_opened":
      return {
        title: `${org} recrute : ${p.title ?? "un recrutement"}`,
        body: `${org}, que tu suis, ouvre un recrutement${p.closes_at ? ` : candidatures jusqu'au ${messageWhen(p.closes_at)}` : ""}.`,
      };
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
