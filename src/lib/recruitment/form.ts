/**
 * The application form as data: one JSON document per form version
 * (recruitment_form_versions.schema), validated by
 * private.validate_form_schema. A question is a whitelisted set of keys —
 * never code, never HTML. This module mirrors the database's rules so the
 * builder and the candidate's form can say what is wrong before saving; the
 * database checks everything again and has the last word.
 * Pure module: the unit tests load it with plain Node.
 */

import type { DocumentKind } from "../types";

export type QuestionType =
  | "short_text"
  | "long_text"
  | "single_choice"
  | "multiple_choice"
  | "yes_no"
  | "number"
  | "date"
  | "url"
  | "file"
  | "cv";

export interface FormSection {
  id: string;
  title: string;
  description?: string;
}

export interface FormOption {
  id: string;
  label: string;
}

export interface FormQuestion {
  id: string;
  type: QuestionType;
  /** "shared": every candidate (in one of the sections); a position id: that position's candidates only. */
  scope: string;
  section?: string | null;
  label: string;
  help?: string;
  required: boolean;
  max_length?: number;
  options?: FormOption[];
  min_selected?: number;
  max_selected?: number;
  min?: number;
  max?: number;
  integer?: boolean;
  min_date?: string;
  max_date?: string;
  file_types?: DocumentKind[];
  max_files?: number;
  max_size_mb?: number;
}

export interface FormSchema {
  sections: FormSection[];
  questions: FormQuestion[];
}

export const EMPTY_FORM: FormSchema = { sections: [{ id: "s1", title: "Ta candidature" }], questions: [] };

export const QUESTION_TYPES: { type: QuestionType; label: string; hint: string }[] = [
  { type: "short_text", label: "Réponse courte", hint: "Une ligne." },
  { type: "long_text", label: "Réponse longue", hint: "Un paragraphe ou plus." },
  { type: "single_choice", label: "Choix unique", hint: "Une réponse parmi une liste." },
  { type: "multiple_choice", label: "Choix multiples", hint: "Plusieurs réponses parmi une liste." },
  { type: "yes_no", label: "Oui / non", hint: "" },
  { type: "number", label: "Nombre", hint: "Avec un minimum et un maximum si besoin." },
  { type: "date", label: "Date", hint: "" },
  { type: "url", label: "Lien", hint: "Une adresse web (portfolio, LinkedIn…)." },
  { type: "file", label: "Document", hint: "PDF, Word ou image, jusqu'à 5 fichiers." },
  { type: "cv", label: "CV", hint: "PDF ou Word, un seul fichier." },
];

export const QUESTION_TYPE_LABEL = Object.fromEntries(QUESTION_TYPES.map((t) => [t.type, t.label])) as Record<QuestionType, string>;

/** Keys a question of each type may carry (private.form_question_keys). */
const BASE_KEYS = ["id", "type", "scope", "section", "label", "help", "required"];
const TYPE_KEYS: Record<QuestionType, string[]> = {
  short_text: ["max_length"],
  long_text: ["max_length"],
  single_choice: ["options"],
  multiple_choice: ["options", "min_selected", "max_selected"],
  yes_no: [],
  number: ["min", "max", "integer"],
  date: ["min_date", "max_date"],
  url: [],
  file: ["file_types", "max_files", "max_size_mb"],
  cv: ["file_types", "max_size_mb"],
};

export const FORM_LIMITS = {
  sections: 10,
  questions: 80,
  options: 30,
  label: 300,
  help: 500,
  sectionTitle: 80,
  sectionDescription: 300,
  optionLabel: 120,
  shortText: { default: 150, max: 300 },
  longText: { default: 2000, max: 10000 },
} as const;

const ID = /^[a-z0-9_]{1,40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

export const isDocumentQuestion = (q: Pick<FormQuestion, "type">) => q.type === "file" || q.type === "cv";

/** The questions a candidate to this position answers, in order (shared ones + the position's). */
export function questionsFor(schema: FormSchema, positionId: string): FormQuestion[] {
  return schema.questions.filter((q) => q.scope === "shared" || q.scope === positionId);
}

/**
 * The first problem of a form document, in words ("La question « Ta
 * motivation » n'a pas de libellé."), or null. Same rules as
 * private.validate_form_schema.
 */
export function formProblem(schema: FormSchema, positionIds: string[]): string | null {
  if (!Array.isArray(schema.sections) || schema.sections.length < 1) return "Le formulaire doit avoir au moins une partie.";
  if (schema.sections.length > FORM_LIMITS.sections) return `${FORM_LIMITS.sections} parties au plus.`;
  if (!Array.isArray(schema.questions)) return "Le formulaire est illisible.";
  if (schema.questions.length > FORM_LIMITS.questions) return `${FORM_LIMITS.questions} questions au plus.`;
  const sections = new Set<string>();
  for (const s of schema.sections) {
    if (!ID.test(s.id) || sections.has(s.id)) return "Une partie a un identifiant invalide.";
    const title = (s.title ?? "").trim();
    if (title.length < 1 || title.length > FORM_LIMITS.sectionTitle) return "Chaque partie a un titre (80 caractères au plus).";
    if (s.description !== undefined && s.description.length > FORM_LIMITS.sectionDescription)
      return `La description de la partie « ${title} » dépasse 300 caractères.`;
    sections.add(s.id);
  }
  const ids = new Set<string>();
  let cvs = 0;
  for (const q of schema.questions) {
    const name = q.label?.trim() ? `« ${q.label.trim().slice(0, 60)} »` : "sans libellé";
    if (!ID.test(q.id) || ids.has(q.id)) return `La question ${name} a un identifiant invalide.`;
    ids.add(q.id);
    if (!TYPE_KEYS[q.type]) return `La question ${name} a un type inconnu.`;
    const allowed = new Set([...BASE_KEYS, ...TYPE_KEYS[q.type]]);
    for (const k of Object.keys(q)) {
      if (!allowed.has(k) && (q as unknown as Record<string, unknown>)[k] !== undefined) return `La question ${name} a un réglage inconnu (${k}).`;
    }
    const label = (q.label ?? "").trim();
    if (label.length < 1) return "Une question n'a pas de libellé.";
    if (label.length > FORM_LIMITS.label || CONTROL.test(q.label)) return `Le libellé ${name} est trop long (300 caractères au plus).`;
    if (q.help !== undefined && q.help.length > FORM_LIMITS.help) return `L'aide de la question ${name} dépasse 500 caractères.`;
    if (typeof q.required !== "boolean") return `La question ${name} doit dire si elle est obligatoire.`;
    if (q.scope === "shared") {
      if (!q.section || !sections.has(q.section)) return `La question ${name} doit être rangée dans une partie.`;
    } else if (UUID.test(q.scope)) {
      if (!positionIds.includes(q.scope)) return `La question ${name} vise un poste qui n'existe plus.`;
      if (q.section) return `La question ${name} est propre à un poste : elle ne se range pas dans une partie.`;
    } else return `La question ${name} doit viser tout le monde ou un poste.`;

    if ((q.type === "short_text" || q.type === "long_text") && q.max_length !== undefined) {
      const max = q.type === "short_text" ? FORM_LIMITS.shortText.max : FORM_LIMITS.longText.max;
      if (!Number.isInteger(q.max_length) || q.max_length < 1 || q.max_length > max)
        return `La longueur maximale de ${name} doit être entre 1 et ${max}.`;
    }
    if (q.type === "single_choice" || q.type === "multiple_choice") {
      const options = q.options ?? [];
      if (options.length < 2 || options.length > FORM_LIMITS.options) return `La question ${name} doit proposer de 2 à 30 choix.`;
      const seen = new Set<string>();
      for (const o of options) {
        const l = (o.label ?? "").trim();
        if (!ID.test(o.id) || seen.has(o.id) || l.length < 1 || l.length > FORM_LIMITS.optionLabel || CONTROL.test(o.label))
          return `Un choix de la question ${name} est vide ou trop long (120 caractères au plus).`;
        seen.add(o.id);
      }
      if (q.type === "multiple_choice") {
        const n = options.length;
        if (
          (q.min_selected !== undefined && (q.min_selected < 0 || q.min_selected > n)) ||
          (q.max_selected !== undefined && (q.max_selected < 1 || q.max_selected > n)) ||
          (q.min_selected ?? 0) > (q.max_selected ?? n)
        )
          return `Le nombre de choix attendus pour ${name} ne tient pas.`;
      }
    }
    if (q.type === "number") {
      const big = 1_000_000_000;
      if ((q.min !== undefined && Math.abs(q.min) > big) || (q.max !== undefined && Math.abs(q.max) > big))
        return `Les bornes de ${name} sont trop grandes.`;
      if (q.min !== undefined && q.max !== undefined && q.min > q.max) return `Le minimum de ${name} dépasse son maximum.`;
    }
    if (q.type === "date") {
      if ((q.min_date && !DAY.test(q.min_date)) || (q.max_date && !DAY.test(q.max_date))) return `Les dates de ${name} sont invalides.`;
      if (q.min_date && q.max_date && q.min_date > q.max_date) return `La date minimale de ${name} dépasse la date maximale.`;
    }
    if (isDocumentQuestion(q)) {
      const kinds = q.file_types ?? [];
      const ok = q.type === "cv" ? ["pdf", "docx"] : ["pdf", "docx", "image"];
      if (kinds.length < 1 || kinds.some((k) => !ok.includes(k))) return `Choisis au moins un format accepté pour ${name}.`;
      if (q.max_size_mb !== undefined && (!Number.isInteger(q.max_size_mb) || q.max_size_mb < 1 || q.max_size_mb > 10))
        return `La taille maximale de ${name} doit être entre 1 et 10 Mo.`;
      if (q.type === "file" && q.max_files !== undefined && (!Number.isInteger(q.max_files) || q.max_files < 1 || q.max_files > 5))
        return `${name} accepte de 1 à 5 fichiers.`;
      if (q.type === "cv") cvs += 1;
    }
  }
  if (cvs > 1) return "Un seul CV par formulaire (une question « CV »).";
  return null;
}

// ---- Answers ---------------------------------------------------------------------------------------

export type AnswerError =
  | "required"
  | "wrong_type"
  | "too_long"
  | "invalid_option"
  | "too_few"
  | "too_many"
  | "out_of_range"
  | "not_integer"
  | "invalid_date"
  | "invalid_url"
  | "too_many_files";

export const ANSWER_ERROR_LABEL: Record<AnswerError, string> = {
  required: "Cette question est obligatoire.",
  wrong_type: "Cette réponse n'a pas le bon format.",
  too_long: "Cette réponse est trop longue.",
  invalid_option: "Choisis parmi les propositions.",
  too_few: "Coche davantage de réponses.",
  too_many: "Tu as coché trop de réponses.",
  out_of_range: "Ce nombre sort des limites indiquées.",
  not_integer: "Un nombre entier est attendu.",
  invalid_date: "Cette date n'est pas valide ou sort des limites.",
  invalid_url: "Ce lien doit commencer par https:// (ou http://).",
  too_many_files: "Trop de fichiers pour cette question.",
};

export function maxLengthOf(q: FormQuestion): number {
  return q.max_length ?? (q.type === "short_text" ? FORM_LIMITS.shortText.default : FORM_LIMITS.longText.default);
}

const isEmpty = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

/**
 * Answers checked against the form: {question id: error}. With `final`,
 * required questions, minimum selections and required documents count too.
 * Same rules as private.application_answer_errors.
 */
export function answerErrors(
  schema: FormSchema,
  positionId: string,
  answers: Record<string, unknown>,
  documents: Record<string, number>,
  final: boolean,
): Record<string, AnswerError> {
  const errors: Record<string, AnswerError> = {};
  for (const q of questionsFor(schema, positionId)) {
    if (isDocumentQuestion(q)) {
      const n = documents[q.id] ?? 0;
      if (final && q.required && n === 0) errors[q.id] = "required";
      else if (n > (q.type === "cv" ? 1 : (q.max_files ?? 1))) errors[q.id] = "too_many_files";
      continue;
    }
    const v = answers[q.id];
    if (isEmpty(v)) {
      if (final && q.required) errors[q.id] = "required";
      continue;
    }
    switch (q.type) {
      case "short_text":
      case "long_text":
        if (typeof v !== "string") errors[q.id] = "wrong_type";
        else if (v.trim().length > maxLengthOf(q)) errors[q.id] = "too_long";
        break;
      case "single_choice":
        if (typeof v !== "string" || !(q.options ?? []).some((o) => o.id === v)) errors[q.id] = "invalid_option";
        break;
      case "multiple_choice": {
        const ids = new Set((q.options ?? []).map((o) => o.id));
        if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || !ids.has(x)) || new Set(v).size !== v.length)
          errors[q.id] = "invalid_option";
        else if (v.length > (q.max_selected ?? ids.size)) errors[q.id] = "too_many";
        else if (final && v.length < (q.min_selected ?? 0)) errors[q.id] = "too_few";
        break;
      }
      case "yes_no":
        if (typeof v !== "boolean") errors[q.id] = "wrong_type";
        break;
      case "number":
        if (typeof v !== "number" || !Number.isFinite(v)) errors[q.id] = "wrong_type";
        else if (q.integer && !Number.isInteger(v)) errors[q.id] = "not_integer";
        else if (v < (q.min ?? -1_000_000_000) || v > (q.max ?? 1_000_000_000)) errors[q.id] = "out_of_range";
        break;
      case "date": {
        const d = typeof v === "string" && DAY.test(v) ? new Date(`${v}T00:00:00Z`) : null;
        if (!d || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) errors[q.id] = "invalid_date";
        else if ((q.min_date && v < q.min_date) || (q.max_date && v > q.max_date)) errors[q.id] = "out_of_range";
        break;
      }
      case "url":
        if (typeof v !== "string" || v.length > 500 || !/^https?:\/\/[^\s/?#@]+\.[^\s/?#@]+([/?#]\S*)?$/i.test(v))
          errors[q.id] = "invalid_url";
        break;
    }
  }
  return errors;
}

/** The answer as the candidate reads it back ("Oui", "Foot, Basket-ball", "12 nov. 2026"…). */
export function answerText(q: FormQuestion, v: unknown): string {
  if (isEmpty(v)) return "";
  switch (q.type) {
    case "yes_no":
      return v === true ? "Oui" : v === false ? "Non" : "";
    case "single_choice":
      return (q.options ?? []).find((o) => o.id === v)?.label ?? String(v);
    case "multiple_choice":
      return Array.isArray(v) ? v.map((id) => (q.options ?? []).find((o) => o.id === id)?.label ?? String(id)).join(", ") : "";
    case "date": {
      const d = typeof v === "string" && DAY.test(v) ? new Date(`${v}T12:00:00Z`) : null;
      return d ? d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" }) : String(v);
    }
    case "number":
      return typeof v === "number" ? v.toLocaleString("fr-FR") : String(v);
    default:
      return String(v);
  }
}

// ---- Building ------------------------------------------------------------------------------------

/** A stable id from a label ("Ta motivation" → "ta_motivation"), unique among `taken`. */
export function idFrom(label: string, taken: Iterable<string>, fallback = "q"): string {
  const used = new Set(taken);
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32) || fallback;
  if (!used.has(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base.slice(0, 36)}_${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${fallback}_${Date.now().toString(36)}`.slice(0, 40);
}

/** A new question of this type, with the defaults the builder starts from. */
export function newQuestion(type: QuestionType, schema: FormSchema, scope = "shared"): FormQuestion {
  const id = idFrom(QUESTION_TYPE_LABEL[type], schema.questions.map((q) => q.id), "question");
  const base: FormQuestion = {
    id,
    type,
    scope,
    section: scope === "shared" ? (schema.sections[0]?.id ?? "s1") : undefined,
    label: "",
    required: type !== "yes_no",
  };
  switch (type) {
    case "single_choice":
    case "multiple_choice":
      return { ...base, options: [{ id: "choix_1", label: "Choix 1" }, { id: "choix_2", label: "Choix 2" }] };
    case "file":
      return { ...base, required: false, file_types: ["pdf"], max_files: 1, max_size_mb: 5 };
    case "cv":
      return { ...base, label: "Ton CV", file_types: ["pdf", "docx"], max_size_mb: 5 };
    default:
      return base;
  }
}

/** Drops the keys this question's type does not take (after a type change in the builder). */
export function cleanQuestion(q: FormQuestion): FormQuestion {
  const allowed = new Set([...BASE_KEYS, ...TYPE_KEYS[q.type]]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(q)) {
    if (!allowed.has(k) || v === undefined || v === "") continue;
    if (k === "section" && q.scope !== "shared") continue;
    out[k] = typeof v === "string" && k !== "help" ? v.trim() : v;
  }
  return out as unknown as FormQuestion;
}

/** Moves item `index` one step up (-1) or down (+1); out-of-range moves change nothing. */
export function move<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
