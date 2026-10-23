/**
 * Shapes of the publishing functions' payloads (supabase/migrations/
 * 20261021092414_create_post_functions.sql and 20261021092556_create_post_moderation_and_reads.sql),
 * their mapping to the UI's PostItem, and the plain-language status of a
 * post. Pure module (no path-alias imports): the unit tests load it with
 * plain Node.
 */

import type { AccentKey, AssociationRef, CategoryRef, Photo, PostItem, PostKind } from "../types";
import { BDE_BADGE, mediaUrl, toPhoto, type MediaPayload } from "../associations/model.ts";
import type { PostDocument } from "./document";

export const POST_KINDS: PostKind[] = ["article", "annonce", "recap", "breve"];

export interface OrganizationCardPayload {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  accent: AccentKey;
  kind: "bde" | "association";
  logo: MediaPayload | null;
}

export interface PostCardPayload {
  id: string;
  slug: string;
  kind: PostKind;
  title: string;
  intro: string | null;
  cover: MediaPayload | null;
  category: CategoryRef | null;
  tags: string[];
  organization: OrganizationCardPayload;
  first_published_at: string;
  published_at: string;
  reading_minutes: number;
  prominence: "normal" | "featured" | "important";
  pinned: boolean;
  archived: boolean;
  author_name: string | null;
}

export interface PublicPostPayload extends PostCardPayload {
  body: PostDocument;
  media: Record<string, MediaPayload | null>;
}

export type PublicPostState =
  | { state: "ok"; post: PublicPostPayload }
  | { state: "moved"; slug: string }
  | { state: "not_found" };

export interface PostFacets {
  total: number;
  categories: (CategoryRef & { count: number })[];
  organizations: { slug: string; name: string; short_name: string | null; accent: AccentKey; count: number }[];
  kinds: Partial<Record<PostKind, number>>;
}

/** The organization as a post shows it (published identity only). */
export function organizationRef(o: OrganizationCardPayload, preview = false): AssociationRef {
  const isBde = o.kind === "bde";
  return {
    id: o.id,
    slug: o.slug,
    name: o.name,
    shortName: o.short_name ?? undefined,
    kind: isBde ? "Bureau des étudiants" : "Association étudiante",
    isBde,
    categories: [],
    accent: o.accent,
    logo: toPhoto(o.logo, `Logo de ${o.name}`, null, preview) ?? (isBde ? BDE_BADGE : undefined),
  };
}

export function toPostItem(p: PostCardPayload, { preview = false }: { preview?: boolean } = {}): PostItem {
  const updated = p.published_at && Date.parse(p.published_at) - Date.parse(p.first_published_at) > 60_000;
  return {
    id: p.id,
    slug: p.slug,
    kind: p.kind,
    title: p.title,
    excerpt: p.intro ?? "",
    cover: toPhoto(p.cover, p.title, null, preview),
    publishedAt: p.first_published_at,
    updatedAt: updated ? p.published_at : undefined,
    readingMinutes: p.reading_minutes,
    authorName: p.author_name ?? undefined,
    association: organizationRef(p.organization, preview),
    category: p.category ?? undefined,
    tags: p.tags,
    prominence: p.prominence,
    pinned: p.pinned,
    archived: p.archived,
  };
}

/** An article with its body; inline images resolved to the site's own media routes. */
export interface PostArticle extends PostItem {
  body: PostDocument;
  media: Record<string, Photo>;
}

export function toPostArticle(p: PublicPostPayload, { preview = false }: { preview?: boolean } = {}): PostArticle {
  const media: Record<string, Photo> = {};
  for (const [id, m] of Object.entries(p.media ?? {})) {
    if (m) media[id] = { src: mediaUrl(m.path, preview), alt: m.alt ?? "", width: m.width, height: m.height };
  }
  return { ...toPostItem(p, { preview }), body: p.body, media };
}

// ---- Feed pages ---------------------------------------------------------------------------

/**
 * The feed's "older" link carries the last item seen: its exact first
 * publication instant (as the database gave it, microseconds included) and
 * its id, joined by "~". Anything else is ignored (first page).
 */
export function encodeFeedCursor(c: { at: string; id: string }): string {
  return `${c.at}~${c.id}`;
}

const CURSOR_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})$/;
const CURSOR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseFeedCursor(raw: string | string[] | undefined): { at: string; id: string } | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v || v.length > 80) return null;
  const [at, id, extra] = v.split("~");
  if (extra !== undefined || !at || !id || !CURSOR_AT.test(at) || !CURSOR_ID.test(id)) return null;
  // Date.parse rolls 30 February over and takes any offset; Postgres refuses both (the page would fail).
  const [y, mo, d, h, mi, s] = at.slice(0, 19).split(/[-T:]/).map(Number);
  const day = new Date(Date.UTC(y, mo - 1, d));
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d || h > 23 || mi > 59 || s > 59) {
    return null;
  }
  const offset = /([+-])(\d{2}):?(\d{2})$/.exec(at);
  if (offset && (Number(offset[2]) > 14 || Number(offset[3]) > 59)) return null;
  return { at, id };
}

/** The public filters read from the URL: slugs only, anything malformed is dropped. */
export function feedSlug(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && v.length <= 100 && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(v) ? v : null;
}

/** The fil's search words: one line, 80 characters at most; under 2 characters is no search (as in public_posts). */
export function feedQuery(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  const q = (v ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return q.length >= 2 ? q : "";
}

// ---- The content desk -------------------------------------------------------------------

export type RevisionStatus = "draft" | "submitted" | "changes_requested" | "approved" | "superseded";

export interface PostSummary {
  id: string;
  slug: string | null;
  created_by_name: string;
  created_by_you: boolean;
  created_at: string;
  updated_at: string;
  kind: PostKind;
  title: string;
  cover: MediaPayload | null;
  tags: string[];
  category: string | null;
  working: {
    id: string;
    number: number;
    status: RevisionStatus;
    version: number;
    updated_at: string;
    updated_by_name: string;
    contributors: string[];
    submitted_by: string | null;
  };
  published: { id: string; number: number; title: string } | null;
  publication: "unpublished" | "published" | "archived";
  first_published_at: string | null;
  published_at: string | null;
  archived_at: string | null;
  unpublished_at: string | null;
  schedule: { at: string; status: "pending" | "failed"; error: string | null; attempts: number; revision: number } | null;
  hidden: { at: string; reason: string } | null;
  pinned: boolean;
  prominence: "normal" | "featured" | "important";
  prominence_until: string | null;
  is_public: boolean;
}

/** One word for where a post stands, from the most urgent to the most settled. */
export type PostStage =
  | "hidden"
  | "failed"
  | "scheduled"
  | "review"
  | "changes"
  | "approved"
  | "live_draft"
  | "live"
  | "archived"
  | "offline"
  | "draft";

export function postStage(s: Pick<PostSummary, "hidden" | "schedule" | "working" | "publication" | "published" | "first_published_at">): PostStage {
  if (s.hidden) return "hidden";
  if (s.schedule?.status === "failed") return "failed";
  if (s.schedule?.status === "pending") return "scheduled";
  if (s.working.status === "submitted") return "review";
  if (s.working.status === "changes_requested") return "changes";
  if (s.working.status === "approved" && s.published?.id !== s.working.id) return "approved";
  if (s.publication === "published") return s.published?.id === s.working.id ? "live" : "live_draft";
  if (s.publication === "archived") return "archived";
  if (s.first_published_at) return "offline";
  return "draft";
}

export const STAGE_LABEL: Record<PostStage, string> = {
  hidden: "Masqué par la modération",
  failed: "Programmation échouée",
  scheduled: "Programmé",
  review: "En attente de relecture",
  changes: "Modifications demandées",
  approved: "Approuvé, pas encore publié",
  live_draft: "En ligne · modifications en cours",
  live: "En ligne",
  archived: "Archivé",
  offline: "Retiré du site",
  draft: "Brouillon",
};

export const STAGE_TONE: Record<PostStage, "ok" | "warn" | "danger" | "info" | "accent" | "neutral"> = {
  hidden: "danger",
  failed: "danger",
  scheduled: "info",
  review: "warn",
  changes: "warn",
  approved: "accent",
  live_draft: "ok",
  live: "ok",
  archived: "neutral",
  offline: "neutral",
  draft: "neutral",
};

/** Why a scheduled publication did not go out, in words. */
export const SCHEDULE_ERROR_LABEL: Record<string, string> = {
  post_hidden: "l'article a été masqué par la modération du BDE",
  organization_inactive: "l'asso n'est pas active (suspendue ou archivée)",
  page_not_public: "la page publique de l'asso n'est pas en ligne",
  approval_missing: "la version programmée n'est plus approuvée",
  media_not_found: "une image de l'article n'est plus disponible",
  post_incomplete: "il manque le titre ou le texte",
  revision_not_found: "la version programmée n'existe plus",
  unexpected: "une erreur technique (réessaie, et préviens le BDE si ça recommence)",
};

/** The desk's tabs. A post can sit in two (online, with an edit in progress). */
export const DESK_VIEWS = [
  { key: "tous", label: "Tous" },
  { key: "brouillons", label: "Brouillons" },
  { key: "relecture", label: "À relire" },
  { key: "programmes", label: "Programmés" },
  { key: "en-ligne", label: "En ligne" },
  { key: "archives", label: "Archivés" },
] as const;

export type DeskView = (typeof DESK_VIEWS)[number]["key"];

export function inView(s: PostSummary, view: DeskView): boolean {
  switch (view) {
    case "brouillons":
      return s.working.status === "draft" || s.working.status === "changes_requested";
    case "relecture":
      return s.working.status === "submitted";
    case "programmes":
      return s.schedule !== null;
    case "en-ligne":
      return s.publication === "published" && !s.hidden;
    case "archives":
      return s.publication === "archived";
    default:
      return true;
  }
}

/** Search on the desk: title, tags, kind label, author (accents and case ignored). */
export function matchesDeskSearch(s: PostSummary, q: string, kindLabel: string): boolean {
  // Same folding as the database's fold_accents (œ and æ included).
  const fold = (v: string) =>
    v.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae");
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold([s.title, s.tags.join(" "), kindLabel, s.created_by_name, s.category ?? ""].join(" "));
  return words.every((w) => hay.includes(w));
}
