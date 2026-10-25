/**
 * The recruitment desk's words: where a campaign stands for its team, the
 * wizard's steps, what is still missing before publication, and the
 * confirmations shown after an action (?fait=…). Pure module: the unit tests
 * load it with plain Node. The database decides; these helpers only say.
 */

import type { CampaignState } from "./model.ts";
import type { FormSchema } from "./form.ts";

export type CampaignStage = "masque" | "archive" | "brouillon" | "retire" | "annule" | "cloture" | "pause" | "programme" | "ouvert";

export interface StageInput {
  state: CampaignState;
  hidden: { reason: string } | null;
  archived_at: string | null;
}

export function campaignStage(c: StageInput): CampaignStage {
  if (c.hidden) return "masque";
  if (c.archived_at) return "archive";
  switch (c.state) {
    case "draft":
      return "brouillon";
    case "unpublished":
      return "retire";
    case "cancelled":
      return "annule";
    case "closed":
      return "cloture";
    case "paused":
      return "pause";
    case "upcoming":
      return "programme";
    default:
      return "ouvert";
  }
}

export const STAGE_LABEL: Record<CampaignStage, string> = {
  masque: "Masqué par le BDE",
  archive: "Archivé",
  brouillon: "Brouillon",
  retire: "Retiré du site",
  annule: "Annulé",
  cloture: "Clôturé",
  pause: "En pause",
  programme: "Programmé",
  ouvert: "Ouvert",
};

export const STAGE_TONE: Record<CampaignStage, "ok" | "warn" | "danger" | "info" | "accent" | "neutral"> = {
  masque: "danger",
  archive: "neutral",
  brouillon: "neutral",
  retire: "neutral",
  annule: "neutral",
  cloture: "neutral",
  pause: "neutral",
  programme: "info",
  ouvert: "ok",
};

export type WizardStep = "infos" | "deroule" | "postes" | "formulaire" | "regles" | "apercu" | "publication";

export const WIZARD_STEPS: { key: WizardStep; label: string }[] = [
  { key: "infos", label: "Présentation" },
  { key: "deroule", label: "Déroulé et contact" },
  { key: "postes", label: "Postes" },
  { key: "formulaire", label: "Formulaire" },
  { key: "regles", label: "Dates et règles" },
  { key: "apercu", label: "Aperçu" },
  { key: "publication", label: "Publication" },
];

export interface ChecklistInput {
  title: string;
  summary: string | null;
  description: string | null;
  opens_at: string | null;
  closes_at: string | null;
  cover_media_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  process: unknown[];
  positions: { retired_at: string | null; summary: string | null; missions: string | null }[];
  form: FormSchema | null;
}

export interface ChecklistItem {
  label: string;
  step: WizardStep;
  ok: boolean;
  /** Publication is refused without it (the database checks the same). */
  required: boolean;
}

/** What publication needs (required) and what makes a better fiche (recommended). */
export function campaignChecklist(c: ChecklistInput, now = new Date()): ChecklistItem[] {
  const live = c.positions.filter((p) => !p.retired_at);
  const questions = c.form?.questions.length ?? 0;
  return [
    { label: "Un titre (3 caractères au moins)", step: "infos", ok: c.title.trim().length >= 3, required: true },
    { label: "Une phrase de présentation", step: "infos", ok: Boolean(c.summary?.trim()), required: true },
    { label: "Une présentation plus longue", step: "infos", ok: Boolean(c.description?.trim()), required: false },
    { label: "Un visuel", step: "infos", ok: Boolean(c.cover_media_id), required: false },
    { label: "Au moins un poste", step: "postes", ok: live.length > 0, required: true },
    {
      label: "Chaque poste décrit (résumé et missions)",
      step: "postes",
      ok: live.length > 0 && live.every((p) => Boolean(p.summary?.trim()) && Boolean(p.missions?.trim())),
      required: false,
    },
    { label: "Au moins une question dans le formulaire", step: "formulaire", ok: questions > 0, required: false },
    { label: "La date d'ouverture", step: "regles", ok: Boolean(c.opens_at), required: true },
    {
      label: "Une date limite à venir",
      step: "regles",
      ok: Boolean(c.closes_at) && Date.parse(c.closes_at!) > now.getTime(),
      required: true,
    },
    { label: "Les étapes du recrutement", step: "deroule", ok: c.process.length > 0, required: false },
    { label: "Une personne à contacter", step: "deroule", ok: Boolean(c.contact_name || c.contact_email), required: false },
  ];
}

/** Confirmations after an action whose form disappears with the change (?fait=…). */
export function recruitmentDoneMessage(code: string | undefined | null): string | null {
  if (!code) return null;
  const fixed: Record<string, string> = {
    publie: "C'est en ligne : la fiche est publique, et les candidatures ouvrent à la date prévue.",
    retire: "Retiré du site : la fiche n'est plus publique. Tu peux la republier quand tu veux.",
    pause: "En pause : personne ne peut commencer ni envoyer de candidature tant que tu ne le rouvres pas. Les brouillons restent.",
    reprise: "Rouvert : les dates décident de nouveau.",
    cloture: "Clôturé : plus aucune candidature n'est acceptée. Les candidatures envoyées sont gardées.",
    duplique: "Copie créée : les postes et le formulaire sont repris, sans dates ni candidatures. Vérifie chaque étape avant de publier.",
    "brouillon-abandonne": "Brouillon du formulaire abandonné : la version en ligne reste la même.",
    "poste-supprime": "Poste supprimé.",
    "poste-ferme": "Ce poste avait reçu des candidatures : il est fermé (plus de nouvelle candidature), pas supprimé. Ses candidatures sont gardées.",
    "poste-ajoute": "Poste ajouté : complète sa fiche ci-dessous.",
    supprime: "Brouillon de recrutement supprimé.",
  };
  if (code in fixed) return fixed[code];
  let m = /^version-(\d{1,4})$/.exec(code);
  if (m) {
    return `Version ${m[1]} du formulaire publiée. Les nouvelles candidatures l'utilisent ; celles déjà envoyées gardent leur version, et les candidat·es qui avaient un brouillon sont prévenu·es.`;
  }
  m = /^annule-(\d{1,6})$/.exec(code);
  if (m) {
    const n = Number(m[1]);
    return n === 0
      ? "Recrutement annulé. Personne n'avait de candidature en cours."
      : `Recrutement annulé. ${n === 1 ? "La personne qui avait" : `Les ${n} personnes qui avaient`} une candidature (envoyée ou en brouillon) ${n === 1 ? "est prévenue" : "sont prévenues"}, avec ta raison. Les candidatures sont gardées.`;
  }
  return null;
}
