/**
 * The campaign wizard's fields → the patches save_recruitment_campaign and
 * save_recruitment_position receive, with a sentence per wrong field. The
 * database checks everything again; this only gives clear messages early and
 * turns Paris dates and times into exact instants.
 * Pure module (relative imports with extensions only): unit-tested with Node.
 */

import { parisLocalToInstant } from "../posts/schedule.ts";

export type CampaignStep = "infos" | "deroule" | "regles";

export const CAMPAIGN_LIMITS = {
  title: 120,
  summary: 300,
  description: 8000,
  contactName: 80,
  contactRole: 80,
  email: 254,
  steps: 6,
  stepLabel: 80,
  stepDetail: 300,
  faq: 10,
  question: 200,
  answer: 1000,
  eligibilityNote: 300,
  positionTitle: 80,
  team: 60,
  positionSummary: 300,
  positionDescription: 4000,
  lines: 2000,
  commitment: 120,
} as const;

export const STUDY_YEARS = [1, 2, 3, 4, 5] as const;

export type Fields = Record<string, string | string[] | undefined>;
export type FieldErrors = Record<string, string>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const one = (f: Fields, name: string): string => {
  const v = f[name];
  return (Array.isArray(v) ? v[0] : (v ?? "")).toString();
};
const all = (f: Fields, name: string): string[] => {
  const v = f[name];
  return Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)];
};

/** One line: control characters out, spaces collapsed. */
function line(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

/** A text with paragraphs: line breaks kept, other control characters out, trailing spaces trimmed. */
function block(value: string): string {
  return (
    value
      .replace(/\r\n?/g, "\n")
      .replace(/[\u0000-\u0008\u000b-\u001f\u007f]+/g, "")
      .split("\n")
      .map((l) => l.trimEnd())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

const nullable = (v: string) => (v === "" ? null : v);

function instant(f: Fields, name: string, errors: FieldErrors, label: string): string | null | undefined {
  const date = one(f, `${name}_date`).trim();
  const time = one(f, `${name}_time`).trim() || "23:59";
  if (!date) return null;
  const at = parisLocalToInstant(date, time);
  if (!at.ok) {
    errors[name] =
      at.reason === "nonexistent"
        ? `${label} : cette heure n'existe pas à Paris (changement d'heure). Choisis-en une autre.`
        : `${label} : date ou heure invalide.`;
    return undefined;
  }
  return at.iso;
}

function years(f: Fields, name: string): number[] | null {
  const picked = all(f, name)
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 8);
  const unique = [...new Set(picked)].sort((a, b) => a - b);
  return unique.length === 0 ? null : unique;
}

export type ParsedStep = { ok: true; patch: Record<string, unknown> } | { ok: false; errors: FieldErrors };

/** One step of the campaign wizard → the whitelisted patch of save_recruitment_campaign. */
export function parseCampaignStep(step: CampaignStep, f: Fields, now = new Date()): ParsedStep {
  const errors: FieldErrors = {};
  const patch: Record<string, unknown> = {};
  const L = CAMPAIGN_LIMITS;

  if (step === "infos") {
    const title = line(one(f, "title"));
    if (title.length < 3) errors.title = "Donne un titre d'au moins 3 caractères.";
    else if (title.length > L.title) errors.title = `${L.title} caractères au plus.`;
    patch.title = title;
    const summary = line(one(f, "summary"));
    if (summary.length > L.summary) errors.summary = `${L.summary} caractères au plus.`;
    patch.summary = nullable(summary);
    const description = block(one(f, "description"));
    if (description.length > L.description) errors.description = `${L.description} caractères au plus.`;
    patch.description = nullable(description);
    const year = one(f, "academic_year").trim();
    if (year) {
      const m = /^(20\d{2})-(20\d{2})$/.exec(year);
      if (!m || Number(m[2]) !== Number(m[1]) + 1) errors.academic_year = "Une année scolaire s'écrit « 2026-2027 ».";
    }
    patch.academic_year = nullable(year);
    const cover = one(f, "cover_media_id").trim();
    if (cover && !UUID.test(cover)) errors.cover_media_id = "Choisis une image de la médiathèque.";
    patch.cover_media_id = cover && UUID.test(cover) ? cover : null;
  }

  if (step === "deroule") {
    const process: { label: string; detail?: string; date?: string }[] = [];
    const labels = all(f, "step_label");
    const details = all(f, "step_detail");
    const dates = all(f, "step_date");
    labels.forEach((raw, i) => {
      const label = line(raw);
      const detail = block(details[i] ?? "");
      const date = (dates[i] ?? "").trim();
      if (!label && !detail && !date) return;
      if (!label || label.length > L.stepLabel) errors[`step_${i}`] = `Étape ${i + 1} : un titre de 1 à ${L.stepLabel} caractères.`;
      else if (detail.length > L.stepDetail) errors[`step_${i}`] = `Étape ${i + 1} : ${L.stepDetail} caractères au plus pour le détail.`;
      else if (date && (!DAY.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`)))) errors[`step_${i}`] = `Étape ${i + 1} : date invalide.`;
      process.push({ label, ...(detail ? { detail } : {}), ...(date ? { date } : {}) });
    });
    if (process.length > L.steps) errors.process = `${L.steps} étapes au plus.`;
    patch.process = process;

    const faq: { question: string; answer: string }[] = [];
    const questions = all(f, "faq_question");
    const answers = all(f, "faq_answer");
    questions.forEach((raw, i) => {
      const question = line(raw);
      const answer = block(answers[i] ?? "");
      if (!question && !answer) return;
      if (!question || question.length > L.question || !answer || answer.length > L.answer)
        errors[`faq_${i}`] = `Question ${i + 1} : une question (${L.question} caractères au plus) et sa réponse (${L.answer} au plus).`;
      faq.push({ question, answer });
    });
    if (faq.length > L.faq) errors.faq = `${L.faq} questions au plus.`;
    patch.faq = faq;

    const name = line(one(f, "contact_name"));
    const role = line(one(f, "contact_role"));
    const email = one(f, "contact_email").trim().toLowerCase();
    if (name.length > L.contactName) errors.contact_name = `${L.contactName} caractères au plus.`;
    if (role.length > L.contactRole) errors.contact_role = `${L.contactRole} caractères au plus.`;
    if (email && (!EMAIL.test(email) || email.length > L.email)) errors.contact_email = "Cette adresse e-mail n'a pas l'air valide.";
    patch.contact_name = nullable(name);
    patch.contact_role = nullable(role);
    patch.contact_email = nullable(email);
  }

  if (step === "regles") {
    const opens = instant(f, "opens", errors, "Ouverture");
    const closes = instant(f, "closes", errors, "Date limite");
    if (opens !== undefined) patch.opens_at = opens;
    if (closes !== undefined) patch.closes_at = closes;
    if (opens && closes && Date.parse(closes) <= Date.parse(opens)) errors.closes = "La date limite doit venir après l'ouverture.";
    if (closes && Date.parse(closes) <= now.getTime() && one(f, "closes_was") !== closes)
      errors.closes = "La date limite doit être à venir.";
    const max = Number.parseInt(one(f, "max_applications"), 10);
    if (!Number.isInteger(max) || max < 1 || max > 10) errors.max_applications = "Entre 1 et 10 postes par personne.";
    else patch.max_applications = max;
    patch.eligible_years = one(f, "eligibility") === "years" ? years(f, "eligible_years") : null;
    if (one(f, "eligibility") === "years" && !patch.eligible_years) errors.eligible_years = "Coche au moins une année, ou ouvre à tout le monde.";
    const note = line(one(f, "eligibility_note"));
    if (note.length > L.eligibilityNote) errors.eligibility_note = `${L.eligibilityNote} caractères au plus.`;
    patch.eligibility_note = nullable(note);
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, patch };
}

/** One position's fields → the whitelisted patch of save_recruitment_position. */
export function parsePosition(f: Fields, campaign: { opensAt: string | null; closesAt: string | null }): ParsedStep {
  const errors: FieldErrors = {};
  const L = CAMPAIGN_LIMITS;
  const title = line(one(f, "title"));
  if (!title) errors.title = "Donne un intitulé au poste.";
  else if (title.length > L.positionTitle) errors.title = `${L.positionTitle} caractères au plus.`;
  const team = line(one(f, "team"));
  if (team.length > L.team) errors.team = `${L.team} caractères au plus.`;
  const summary = line(one(f, "summary"));
  if (summary.length > L.positionSummary) errors.summary = `${L.positionSummary} caractères au plus.`;
  const description = block(one(f, "description"));
  if (description.length > L.positionDescription) errors.description = `${L.positionDescription} caractères au plus.`;
  const missions = block(one(f, "missions"));
  if (missions.length > L.lines) errors.missions = `${L.lines} caractères au plus.`;
  const expectations = block(one(f, "expectations"));
  if (expectations.length > L.lines) errors.expectations = `${L.lines} caractères au plus.`;
  const commitment = line(one(f, "commitment"));
  if (commitment.length > L.commitment) errors.commitment = `${L.commitment} caractères au plus.`;
  const rawOpenings = one(f, "openings").trim();
  const openings = rawOpenings ? Number.parseInt(rawOpenings, 10) : null;
  if (rawOpenings && (!Number.isInteger(openings) || openings! < 1 || openings! > 99 || String(openings) !== rawOpenings))
    errors.openings = "Un nombre de places entre 1 et 99 (ou laisse vide).";
  const closes = instant(f, "closes", errors, "Fermeture du poste");
  if (closes && campaign.closesAt && Date.parse(closes) > Date.parse(campaign.closesAt))
    errors.closes = "Un poste ne peut pas fermer après la date limite du recrutement.";
  if (closes && campaign.opensAt && Date.parse(closes) <= Date.parse(campaign.opensAt))
    errors.closes = "Un poste doit fermer après l'ouverture du recrutement.";
  const template = one(f, "template_key").trim();
  const patch: Record<string, unknown> = {
    title,
    team: nullable(team),
    summary: nullable(summary),
    description: nullable(description),
    missions: nullable(missions),
    expectations: nullable(expectations),
    commitment: nullable(commitment),
    openings: rawOpenings ? openings : null,
    eligible_years: one(f, "eligibility") === "years" ? years(f, "eligible_years") : null,
    template_key: template && /^[a-z0-9_]{1,40}$/.test(template) ? template : null,
  };
  if (one(f, "eligibility") === "years" && !patch.eligible_years) errors.eligible_years = "Coche au moins une année, ou garde la règle du recrutement.";
  if (closes !== undefined) patch.closes_at = closes;
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, patch };
}
