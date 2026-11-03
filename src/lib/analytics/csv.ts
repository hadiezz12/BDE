import { toCsv } from "../events/csv.ts";
import { QUALITY_LABEL, TIME_LABEL, metric, type MetricKey } from "./metrics.ts";
import { total, type Range } from "./period.ts";
import { rate } from "./compare.ts";
import type { OrganizationAnalytics, PlatformAnalytics, Suppressed } from "../data/analytics.ts";

/**
 * The statistics as a spreadsheet file (Phase 13): only the aggregates the
 * dashboard already shows to this person, already restricted to their keys
 * and already suppressed by the database — never a row about a person, a
 * name of a candidate or a reviewer. Cells go through toCsv (UTF-8 with BOM,
 * semicolons, formula neutralisation: an event titled "=HYPERLINK(…)" stays
 * text). A hidden value is written "masqué" with the reason, never 0.
 * Pure module (relative imports with extensions only): the unit tests load it with plain Node.
 */

export type OrganizationSection = "overview" | "content" | "events" | "recruitment" | "workflow" | "team";
export type PlatformSection = "associations" | "content" | "events" | "recruitment" | "governance" | "messages";

export const ORGANIZATION_SECTION_LABEL: Record<OrganizationSection, string> = {
  overview: "Vue d'ensemble",
  content: "Articles",
  events: "Événements",
  recruitment: "Recrutement",
  workflow: "Travail de recrutement",
  team: "Équipe",
};

export const PLATFORM_SECTION_LABEL: Record<PlatformSection, string> = {
  associations: "Assos et membres",
  content: "Articles",
  events: "Événements",
  recruitment: "Recrutement",
  governance: "Gouvernance",
  messages: "Messages",
};

export type Cell = string | number | null | undefined;
/** Section, indicator, detail, value, compared value, quality, time, note. */
export const HEADER = ["Section", "Indicateur", "Détail", "Valeur", "Période comparée", "Qualité", "Moment", "Remarque"];
const HIDDEN = "masqué";

function reasonText(reason: Suppressed["reason"], k: number): string {
  if (reason === "small_group") return `groupe de moins de ${k} : rien n'est affiché`;
  if (reason === "single_outcome") return "une seule issue pour tout le groupe : détail masqué";
  if (reason === "small_cells") return `case sous ${k} masquée (avec une seconde, pour empêcher la soustraction)`;
  return "";
}

class Sheet {
  rows: Cell[][] = [];
  private section = "";
  at(section: string) {
    this.section = section;
    return this;
  }
  /** A figure from the dictionary. Null is "masqué", unless `na`: then nothing to compute (no capacity, no approval). */
  m(key: MetricKey, value: number | null, previous?: number | null, detail = "", note = "", na = false) {
    const d = metric(key);
    // Rates as percentages with one decimal, hours as hours: numbers a spreadsheet can sum or sort.
    const shown = (v: number | null | undefined) => (v == null ? v : d.unit === "ratio" ? Math.round(v * 1000) / 10 : v);
    const label = d.unit === "ratio" ? `${d.label} (%)` : d.unit === "hours" ? `${d.label} (heures)` : d.label;
    const empty = value == null ? (na ? "" : HIDDEN) : shown(value);
    this.rows.push([this.section, label, detail, empty, shown(previous) ?? "", QUALITY_LABEL[d.quality], TIME_LABEL[d.time], note]);
  }
  /** A figure named here (a current state shown as a plain tile). */
  raw(label: string, value: number | string | null, detail = "", note = "", time = "En ce moment") {
    this.rows.push([this.section, label, detail, value ?? HIDDEN, "", "Compté", time, note]);
  }
  /** A suppressed breakdown, cell by cell. */
  breakdown(label: string, data: Suppressed | null, labels: Record<string, string>, k: number, detail = "", time = "Toute la campagne") {
    if (!data) {
      this.rows.push([this.section, label, detail, HIDDEN, "", "Compté", time, `moins de ${k} candidatures envoyées`]);
      return;
    }
    for (const [key, word] of Object.entries(labels)) {
      const v = data.cells[key];
      this.rows.push([this.section, `${label} — ${word}`, detail, v ?? HIDDEN, "", "Compté", time, v == null ? reasonText(data.reason, k) : ""]);
    }
  }
}

function preamble(title: string, period: Range, compare: Range | null, k: number, dataThrough: string | null, now: Date): Cell[][] {
  return [
    ["Statistiques", title],
    ["Période (jours de Paris, inclus)", `${period.from} → ${period.to}`],
    ["Période comparée", compare ? `${compare.from} → ${compare.to}` : "aucune"],
    ["Seuil de confidentialité", k],
    ["Comptes par période calculés le", dataThrough ?? "pas encore"],
    ["Exporté le", now.toISOString()],
    ["Non mesuré", "présence réelle, vues, visiteurs, j'aime et partages, ouvertures d'e-mails"],
    [],
    HEADER,
  ];
}

const sum = (t: Record<string, number> | null | undefined, m: string, dims?: string[]) => total(t, m, dims);

/** The rows of one association's statistics (CSV and printable report alike), for the sections chosen and readable. */
export function organizationRows(d: OrganizationAnalytics, sections: OrganizationSection[]): Cell[][] {
  const k = d.min_group_size;
  const s = new Sheet();
  const cmp = (m: string, dims?: string[]) => (d.compare ? sum(d.compare, m, dims) : undefined);
  const period = (m: MetricKey, metricName: string = m, dims?: string[], detail = "") =>
    s.m(m, sum(d.totals, metricName, dims), cmp(metricName, dims), detail);

  if (sections.includes("overview") && d.sections.overview) {
    const o = d.sections.overview;
    s.at(ORGANIZATION_SECTION_LABEL.overview);
    s.m("overview.posts_online", o.posts_online);
    s.m("overview.events_upcoming", o.events_upcoming);
    s.m("overview.registrations_upcoming", o.registrations_upcoming);
    s.m("overview.campaigns_open", o.campaigns_open);
    period("posts.published");
    period("events.published");
    period("events.held");
  }
  if (sections.includes("content") && d.sections.content) {
    const c = d.sections.content;
    s.at(ORGANIZATION_SECTION_LABEL.content);
    period("posts.published");
    for (const kind of ["article", "annonce", "recap", "breve"]) period("posts.published", "posts.published", [kind], kind);
    s.m("content.online", c.online);
    s.m("content.drafts", c.drafts);
    s.m("content.scheduled", c.scheduled);
    s.m("content.approvals_waiting", c.approvals_waiting);
    s.m("content.offline", c.offline);
    s.raw("Archivés", c.archived);
    s.m("content.hidden", c.hidden);
    s.raw("Versions approuvées", c.reviews.approved, "", "", "Pendant la période");
    s.raw("Modifications demandées", c.reviews.changes_requested, "", "", "Pendant la période");
    s.m("content.reviews.median_hours", c.reviews.median_hours, undefined, "", c.reviews.median_hours == null ? "aucune approbation" : "", true);
  }
  if (sections.includes("events") && d.sections.events) {
    const e = d.sections.events;
    s.at(ORGANIZATION_SECTION_LABEL.events);
    period("events.published");
    period("events.held");
    period("events.cancelled");
    period("registrations.created");
    period("registrations.waitlisted");
    period("registrations.promoted");
    period("registrations.cancelled");
    period("registrations.cancelled", "registrations.cancelled", ["self"], "par la personne");
    period("registrations.cancelled", "registrations.cancelled", ["organizer"], "par l'organisation");
    s.raw("Événements à venir", e.upcoming);
    s.raw("En liste d'attente", e.waiting_now);
    for (const ev of e.list) {
      const detail = `${ev.title} (${ev.starts_at.slice(0, 10)})`;
      if (ev.mode !== "internal") {
        s.raw("Inscriptions", ev.mode === "external" ? "sur un autre site" : "sans inscription", detail);
        continue;
      }
      s.m("event.confirmed", ev.confirmed, undefined, detail);
      s.raw("Capacité", ev.capacity ?? "sans capacité", detail);
      s.raw("Liste d'attente", ev.waitlisted, detail);
      s.raw("Désinscriptions", ev.cancelled, detail);
      s.raw("Passés de l'attente à une place", ev.promoted, detail);
      s.m("event.utilization", ev.utilization, undefined, detail, ev.utilization == null ? "sans capacité" : "", true);
    }
    for (const c of e.by_category) s.raw("Événements par catégorie", c.events, c.label, "", "Pendant la période");
  }
  if (sections.includes("recruitment") && d.sections.recruitment) {
    const r = d.sections.recruitment;
    s.at(ORGANIZATION_SECTION_LABEL.recruitment);
    period("applications.submitted");
    period("applications.withdrawn");
    period("applications.started");
    s.m("recruitment.candidates", r.candidates);
    for (const c of r.campaigns) {
      const cohort = (label: string, v: number | null, note = "") => s.raw(label, v, c.title, note, "Toute la campagne");
      cohort("Candidatures commencées", c.started);
      cohort("Candidatures envoyées", c.submitted);
      cohort("Candidatures retirées après envoi", c.withdrawn);
      cohort("Candidat·es distinct·es", c.candidates);
      const small = c.small_group ? `moins de ${k} candidatures envoyées` : "";
      cohort("Relues (au moins une évaluation)", c.reviewed, small);
      cohort("Présélectionnées", c.shortlisted, small);
      cohort("En entretien", c.interviewed, small);
      s.m("campaign.submission_rate", rate(c.submitted, c.started), undefined, c.title, c.started ? "" : "aucune candidature commencée", true);
      s.breakdown("Décisions annoncées", c.outcomes, { offer: "offre", reject: "pas retenu·e", waitlist: "liste d'attente" }, k, c.title);
      s.breakdown("Offres", c.offers, { accepted: "acceptée", declined: "déclinée", pending: "en attente", expired: "expirée ou retirée" }, k, c.title);
      for (const p of c.by_position) cohort("Candidatures envoyées par poste", p.submitted, `${c.title} — ${p.title}`);
    }
  }
  if (sections.includes("workflow") && d.sections.workflow) {
    s.at(ORGANIZATION_SECTION_LABEL.workflow);
    for (const c of d.sections.workflow.campaigns) {
      const w = (label: string, v: number) => s.raw(label, v, c.title);
      w("À attribuer", c.awaiting_assignment);
      w("Évaluations manquantes", c.awaiting_reviews);
      w("Évaluations complètes", c.reviews_done);
      w("Évaluations remises", c.reviews_submitted);
      w("Entretiens à caler", c.interviews_to_schedule);
      w("Entretiens prévus", c.interviews_scheduled);
      w("Décisions à valider", c.decisions_proposed);
      w("Décisions à annoncer", c.decisions_to_release);
      w("Offres sans réponse", c.offers_pending);
    }
  }
  if (sections.includes("team") && d.sections.team) {
    const t = d.sections.team;
    s.at(ORGANIZATION_SECTION_LABEL.team);
    s.m("team.members_active", t.members_active);
    s.raw("Membres suspendus", t.members_suspended);
    s.raw("Postes occupés", t.positions_held);
    s.m("team.mandates_ending_60d", t.mandates_ending_60d);
    s.raw("Présidence", t.presidency ? "occupée" : "vacante");
    s.raw("Passations ouvertes", t.transitions_open);
    s.raw("Points de continuité critiques", t.issues.critical);
    s.raw("Points de continuité à surveiller", t.issues.warning);
  }
  return s.rows;
}

export function organizationCsv(d: OrganizationAnalytics, sections: OrganizationSection[], now = new Date()): string {
  const head = preamble(d.organization.name, d.period, d.compare_period, d.min_group_size, d.freshness?.data_through ?? null, now);
  return toCsv([...head, ...organizationRows(d, sections)]);
}

/** The rows of the platform's statistics (BDE): totals and suppressed breakdowns only, never below an association for recruitment. */
export function platformRows(d: PlatformAnalytics, sections: PlatformSection[]): Cell[][] {
  const k = d.min_group_size;
  const s = new Sheet();
  const cmp = (m: string, dims?: string[]) => (d.compare ? sum(d.compare, m, dims) : undefined);
  const period = (m: MetricKey, metricName: string = m, detail = "") => s.m(m, sum(d.totals, metricName), cmp(metricName), detail);
  const x = d.sections;

  if (sections.includes("associations") && x.associations) {
    const a = x.associations;
    s.at(PLATFORM_SECTION_LABEL.associations);
    s.m("platform.associations_active", a.active);
    s.raw("Pages publiques", a.pages_public);
    s.raw("Assos créées", a.created, "", "", "Pendant la période");
    s.raw("Assos archivées", a.archived, "", "", "Pendant la période");
    s.m("platform.memberships_active", a.memberships_active);
    s.m("platform.members_distinct", a.members_distinct);
  }
  if (sections.includes("content") && x.content) {
    s.at(PLATFORM_SECTION_LABEL.content);
    period("posts.published");
    s.raw("Articles en ligne", x.content.online);
    s.raw("Versions en attente de relecture", x.content.approvals_waiting);
    s.raw("Articles masqués", x.content.hidden);
    for (const a of x.content.by_association) s.raw("Articles publiés par asso", a.published, a.name, "", "Pendant la période");
  }
  if (sections.includes("events") && x.events) {
    s.at(PLATFORM_SECTION_LABEL.events);
    period("events.published");
    period("events.held");
    period("events.cancelled");
    period("registrations.created");
    period("registrations.cancelled");
    s.raw("Événements à venir", x.events.upcoming);
    s.raw("Places confirmées des événements passés", x.events.confirmed_for_held, "", "pas des présences", "Pendant la période");
    for (const a of x.events.by_association) {
      s.raw("Événements passés par asso", a.held, a.name, "", "Pendant la période");
      s.raw("Événements annulés par asso", a.cancelled, a.name, "", "Pendant la période");
      s.raw("Inscriptions par asso", a.registrations, a.name, "", "Pendant la période");
    }
  }
  if (sections.includes("recruitment") && x.recruitment) {
    const r = x.recruitment;
    s.at(PLATFORM_SECTION_LABEL.recruitment);
    s.raw("Recrutements ouverts", r.campaigns_open);
    s.raw("Recrutements publiés", r.campaigns_published, "", "", "Pendant la période");
    s.raw("Postes ouverts", r.positions_open);
    const hiddenTotal = d.suppressed_totals.includes("applications.submitted:");
    s.m("applications.submitted", hiddenTotal ? null : sum(d.totals, "applications.submitted"), cmp("applications.submitted"), "", hiddenTotal ? `moins de ${k}` : "");
    for (const [month, n] of r.submitted_by_month) {
      s.raw("Candidatures envoyées par mois", n, month, n == null ? `moins de ${k}` : "", "Pendant la période");
    }
    const byAsso: Record<string, string> = {};
    for (const key of Object.keys(r.by_association.cells)) byAsso[key] = key;
    s.breakdown("Candidatures envoyées par asso", r.by_association, byAsso, k, "", "Pendant la période");
    s.breakdown("Décisions annoncées", r.outcomes, { offer: "offre", reject: "pas retenu·e", waitlist: "liste d'attente" }, k, "", "Pendant la période");
    s.breakdown("Réponses aux offres", r.offers, { accepted: "acceptée", declined: "déclinée" }, k, "", "Pendant la période");
  }
  if (sections.includes("governance") && x.governance) {
    const g = x.governance;
    s.at(PLATFORM_SECTION_LABEL.governance);
    s.raw("Présidence du BDE", g.bde_president ? "occupée" : "vacante");
    s.raw("Vice-présidence du BDE", g.bde_vice_president ? "occupée" : "vacante");
    s.raw("Assos sans présidence", g.associations_without_president);
    s.raw("Mandats qui finissent sous 30 jours", g.mandates_ending_30d);
    s.raw("Passations ouvertes", g.transitions_open);
    s.raw("Points de continuité critiques", g.issues.critical);
    s.raw("Points de continuité à surveiller", g.issues.warning);
  }
  if (sections.includes("messages") && x.messages) {
    s.at(PLATFORM_SECTION_LABEL.messages);
    period("notifications.created");
    period("deliveries.accepted");
    period("deliveries.delivered");
    period("deliveries.failed");
    period("deliveries.suppressed");
    s.raw("E-mails en file", x.messages.backlog.queued);
    s.raw("E-mails en nouvelle tentative", x.messages.backlog.retrying);
  }
  return s.rows;
}

export function platformCsv(d: PlatformAnalytics, sections: PlatformSection[], now = new Date()): string {
  const head = preamble("Plateforme (toutes les assos)", d.period, d.compare_period, d.min_group_size, d.freshness?.data_through ?? null, now);
  return toCsv([...head, ...platformRows(d, sections)]);
}

export const ORGANIZATION_SECTIONS = Object.keys(ORGANIZATION_SECTION_LABEL) as OrganizationSection[];
export const PLATFORM_SECTIONS = Object.keys(PLATFORM_SECTION_LABEL) as PlatformSection[];

/** The sections a request asks for, among the known ones (unknown values are dropped, duplicates removed). */
export function pickSections<S extends string>(values: unknown, known: readonly S[]): S[] {
  const list = (Array.isArray(values) ? values : [values]).filter((v): v is string => typeof v === "string");
  return known.filter((k) => list.includes(k));
}

/** "statistiques-exemple-finance-2026-10-05-2026-11-03.csv" */
export function analyticsFileName(scope: string, period: Range): string {
  const clean = scope.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60) || "asso";
  return `statistiques-${clean}-${period.from}-${period.to}.csv`;
}
