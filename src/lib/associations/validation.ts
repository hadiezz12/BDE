/**
 * Form input → draft patch, for the association page editor. Pure module
 * (no path-alias imports): the unit tests load it with plain Node.
 *
 * These rules mirror the database's checks
 * (supabase/migrations/20261020081522_create_association_profiles.sql) so a
 * person gets a precise message per field; the database checks everything
 * again and stays the authority. Values come out in the exact JSON shape the
 * database compares (to_jsonb of the draft row): null for empty, numbers as
 * numbers, arrays in order.
 */

import type { SocialPlatform } from "./model";

export type FieldErrors = Partial<Record<string, string>>;

export interface ParseResult<T> {
  values: T;
  errors: FieldErrors;
}

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** One line: trimmed, inner runs of spaces collapsed. Empty → null. */
export function singleLine(value: FormDataEntryValue | null | undefined): string | null {
  const v = String(value ?? "").replace(/\s+/g, " ").trim();
  return v === "" ? null : v;
}

/**
 * Several paragraphs: Windows line ends folded, trailing spaces removed,
 * at most one blank line between paragraphs. Empty → null. Markup is kept
 * as typed: the site prints it as text.
 */
export function multiLine(value: FormDataEntryValue | null | undefined): string | null {
  const v = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return v === "" ? null : v;
}

function checkLength(errors: FieldErrors, key: string, value: string | null, min: number, max: number, label: string) {
  if (value === null) return;
  if (value.length < min) errors[key] = `${label} : ${min} caractères au moins.`;
  else if (value.length > max) errors[key] = `${label} : ${max} caractères au plus (${value.length} actuellement).`;
  else if (CONTROL.test(value)) errors[key] = `${label} : caractères invisibles non acceptés.`;
}

export const ACCENTS = ["rose", "cyan", "violet", "vert", "or", "bleu", "orange", "corail"] as const;

/** Identity: name, short name, official line, tagline. */
export function parseIdentity(form: FormData) {
  const errors: FieldErrors = {};
  const values = {
    name: singleLine(form.get("name")),
    short_name: singleLine(form.get("short_name")),
    kind_label: singleLine(form.get("kind_label")),
    tagline: singleLine(form.get("tagline")),
  };
  if (!values.name) errors.name = "Le nom est obligatoire.";
  checkLength(errors, "name", values.name, 2, 80, "Nom");
  checkLength(errors, "short_name", values.short_name, 1, 20, "Nom court");
  checkLength(errors, "kind_label", values.kind_label, 2, 60, "Type d'association");
  checkLength(errors, "tagline", values.tagline, 2, 140, "Accroche");
  return { values, errors } satisfies ParseResult<typeof values>;
}

/** Presentation: description, where and when, founding year. */
export function parsePresentation(form: FormData, now = new Date()) {
  const errors: FieldErrors = {};
  const yearText = singleLine(form.get("founded_year"));
  const year = yearText === null ? null : Number(yearText);
  const values = {
    description: multiLine(form.get("description")),
    meeting_info: singleLine(form.get("meeting_info")),
    founded_year: year,
  };
  checkLength(errors, "description", values.description, 10, 4000, "Présentation");
  checkLength(errors, "meeting_info", values.meeting_info, 2, 300, "Où et quand");
  if (year !== null && (!Number.isInteger(year) || year < 1850 || year > now.getFullYear())) {
    errors.founded_year = `Année de création : entre 1850 et ${now.getFullYear()}.`;
  }
  return { values, errors } satisfies ParseResult<typeof values>;
}

/** Up to three key points: a short title, and a sentence to explain it. */
export function parsePillars(form: FormData) {
  const errors: FieldErrors = {};
  const pillars: { title: string; detail: string }[] = [];
  for (let i = 1; i <= 3; i++) {
    const title = singleLine(form.get(`pillar_${i}_title`));
    const detail = singleLine(form.get(`pillar_${i}_detail`)) ?? "";
    if (!title && !detail) continue;
    if (!title) {
      errors[`pillar_${i}_title`] = `Point ${i} : donne-lui un titre (ou vide aussi l'explication).`;
      continue;
    }
    checkLength(errors, `pillar_${i}_title`, title, 1, 60, `Point ${i}, titre`);
    checkLength(errors, `pillar_${i}_detail`, detail || null, 0, 280, `Point ${i}, explication`);
    pillars.push({ title, detail });
  }
  return { values: { pillars }, errors } satisfies ParseResult<{ pillars: typeof pillars }>;
}

export const SOCIAL_PLATFORMS: { platform: SocialPlatform; label: string; example: string }[] = [
  { platform: "instagram", label: "Instagram", example: "Ex : instagram.com/ton-asso ou @ton-asso" },
  { platform: "tiktok", label: "TikTok", example: "Ex : tiktok.com/@ton-asso ou @ton-asso" },
  { platform: "linkedin", label: "LinkedIn", example: "Ex : linkedin.com/company/ton-asso" },
  { platform: "youtube", label: "YouTube", example: "Ex : youtube.com/@ton-asso" },
  { platform: "facebook", label: "Facebook", example: "Ex : facebook.com/ton-asso" },
  { platform: "x", label: "X", example: "Ex : x.com/ton-asso" },
  { platform: "website", label: "Site web", example: "Ex : ton-asso.fr" },
];

const HOSTS: Record<Exclude<SocialPlatform, "website">, RegExp> = {
  instagram: /^https:\/\/(www\.)?instagram\.com\//i,
  tiktok: /^https:\/\/(www\.)?tiktok\.com\//i,
  linkedin: /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\//i,
  youtube: /^https:\/\/((www|m)\.)?(youtube\.com|youtu\.be)\//i,
  facebook: /^https:\/\/((www|m)\.)?(facebook\.com|fb\.com)\//i,
  x: /^https:\/\/(www\.)?(x\.com|twitter\.com)\//i,
};

const URL_SHAPE = /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(:[0-9]{1,5})?(\/[^\s]*)?$/i;

/**
 * What a person typed for one platform → an https link to that platform, or
 * an error. "@handle" works for Instagram, TikTok, YouTube and X; a missing
 * "https://" is added; any other scheme (javascript:, data:, http:) is refused.
 */
export function parseSocialLink(platform: SocialPlatform, raw: string): { url: string | null; error?: string } {
  let v = raw.trim();
  if (v === "") return { url: null };
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^https?:\/\//i.test(v)) {
    return { url: null, error: "Seuls les liens web (https://…) sont acceptés." };
  }
  if (/^http:\/\//i.test(v)) v = v.replace(/^http:/i, "https:");
  if (v.startsWith("@") && platform !== "website" && platform !== "linkedin" && platform !== "facebook") {
    const handle = v.slice(1);
    if (!/^[A-Za-z0-9._-]{1,60}$/.test(handle)) return { url: null, error: "Ce nom de compte n'est pas valide." };
    v = {
      instagram: `https://www.instagram.com/${handle}/`,
      tiktok: `https://www.tiktok.com/@${handle}`,
      youtube: `https://www.youtube.com/@${handle}`,
      x: `https://x.com/${handle}`,
    }[platform];
  }
  if (!/^https:\/\//i.test(v)) v = `https://${v}`;
  if (v.length > 300) return { url: null, error: "Ce lien est trop long (300 caractères au plus)." };
  if (!URL_SHAPE.test(v) || /^https:\/\/[^/]*@/i.test(v)) return { url: null, error: "Ce lien n'a pas l'air valide." };
  if (platform !== "website" && !HOSTS[platform].test(v)) {
    const name = SOCIAL_PLATFORMS.find((p) => p.platform === platform)!.label;
    return { url: null, error: `Ce lien ne mène pas à ${name}.` };
  }
  return { url: v };
}

/** Contact address and social links. */
export function parseContact(form: FormData) {
  const errors: FieldErrors = {};
  const email = singleLine(form.get("contact_email"))?.toLowerCase() ?? null;
  if (email !== null && (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(email) || email.length > 254)) {
    errors.contact_email = "Cette adresse e-mail n'est pas valide.";
  }
  const social_links: { platform: SocialPlatform; url: string }[] = [];
  for (const { platform } of SOCIAL_PLATFORMS) {
    const { url, error } = parseSocialLink(platform, String(form.get(`social_${platform}`) ?? ""));
    if (error) errors[`social_${platform}`] = error;
    else if (url) social_links.push({ platform, url });
  }
  return { values: { contact_email: email, social_links }, errors } satisfies ParseResult<{
    contact_email: string | null;
    social_links: typeof social_links;
  }>;
}

/** 1 to 3 categories (ids), in the order chosen. */
export function parseCategories(form: FormData, known: readonly string[]) {
  const errors: FieldErrors = {};
  const ids = [...new Set(form.getAll("category_ids").map(String))].filter((id) => known.includes(id));
  if (ids.length > 3) errors.category_ids = "Trois catégories au plus.";
  return { values: { category_ids: ids.slice(0, 3) }, errors } satisfies ParseResult<{ category_ids: string[] }>;
}

/** Colour, logo, cover and where the cover keeps its subject. */
export function parseAppearance(form: FormData, mediaIds: readonly string[]) {
  const errors: FieldErrors = {};
  const accent = String(form.get("accent") ?? "");
  const logo = singleLine(form.get("logo_media_id"));
  const cover = singleLine(form.get("cover_media_id"));
  const fx = Number(form.get("focal_x"));
  const fy = Number(form.get("focal_y"));
  const focal =
    Number.isFinite(fx) && Number.isFinite(fy) && form.get("focal_x") !== null && form.get("focal_x") !== ""
      ? `${Math.round(Math.min(100, Math.max(0, fx)))}% ${Math.round(Math.min(100, Math.max(0, fy)))}%`
      : null;
  if (!(ACCENTS as readonly string[]).includes(accent)) errors.accent = "Choisis une des couleurs proposées.";
  if (logo && !mediaIds.includes(logo)) errors.logo_media_id = "Cette image n'est plus dans la médiathèque.";
  if (cover && !mediaIds.includes(cover)) errors.cover_media_id = "Cette image n'est plus dans la médiathèque.";
  return {
    values: { accent, logo_media_id: logo, cover_media_id: cover, cover_focal: cover ? focal : null },
    errors,
  };
}

/** Reserved by the site's own routes under /manage. */
export const RESERVED_SLUGS = ["plateforme", "continuite"];

/** A page address from a name: accents removed, words joined by dashes. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function slugError(slug: string): string | null {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    return "Lettres minuscules sans accent, chiffres et tirets seulement (80 caractères au plus).";
  }
  if (RESERVED_SLUGS.includes(slug)) return "Ce mot est réservé par le site.";
  return null;
}

/** The draft as the editor reads it (to_jsonb of the draft row, minus internals). */
export interface DraftValues {
  name: string;
  short_name: string | null;
  accent: string;
  kind_label: string | null;
  tagline: string | null;
  description: string | null;
  meeting_info: string | null;
  pillars: { title: string; detail: string }[];
  contact_email: string | null;
  social_links: { platform: SocialPlatform; url: string }[];
  founded_year: number | null;
  category_ids: string[];
  logo_media_id: string | null;
  cover_media_id: string | null;
  cover_focal: string | null;
}

export interface CompletenessItem {
  key: string;
  label: string;
  done: boolean;
  /** Needed to publish (the rest only makes the page better). */
  required: boolean;
}

/**
 * What the page has and lacks, in plain words. Required to publish: an
 * accroche, a presentation and (for an association) a category; everything
 * else is optional and only improves the page.
 */
export function completeness(d: DraftValues, opts: { isBde: boolean; galleryCount: number; teamCount: number }) {
  const items: CompletenessItem[] = [
    { key: "tagline", label: "Une accroche", done: Boolean(d.tagline), required: true },
    { key: "description", label: "Une présentation", done: Boolean(d.description), required: true },
    ...(opts.isBde ? [] : [{ key: "category_ids", label: "Une catégorie", done: d.category_ids.length > 0, required: true }]),
    { key: "logo", label: "Un logo", done: Boolean(d.logo_media_id) || opts.isBde, required: false },
    { key: "cover", label: "Une image de couverture", done: Boolean(d.cover_media_id), required: false },
    { key: "contact", label: "Un contact ou un réseau", done: Boolean(d.contact_email) || d.social_links.length > 0, required: false },
    { key: "pillars", label: "Ses points forts", done: d.pillars.length > 0, required: false },
    { key: "team", label: "Une équipe présentée", done: opts.teamCount > 0, required: false },
    { key: "gallery", label: "Quelques photos", done: opts.galleryCount > 0, required: false },
  ];
  const done = items.filter((i) => i.done).length;
  return {
    items,
    percent: Math.round((done / items.length) * 100),
    publishable: items.every((i) => !i.required || i.done),
  };
}
