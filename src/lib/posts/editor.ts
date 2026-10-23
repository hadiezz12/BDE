import "server-only";
import { cache } from "react";
import { readGovernance } from "@/lib/governance/access";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import type { AccentKey, PostKind } from "@/lib/types";
import type { MediaPayload } from "@/lib/associations/model";
import type { PostDocument } from "./document";
import type { OrganizationCardPayload, PostCardPayload, PostSummary, RevisionStatus } from "./model";

/**
 * Loaders of the publishing desk, the editor, the private preview and BDE
 * moderation. Each database function identifies the caller and checks the
 * right itself (posts.* in the post's own association, or
 * platform.content.moderate); a refusal comes back as `{ ok: false, code }`,
 * never as data. Memoised per request (React cache), never across requests.
 */

export interface DeskOrganization {
  id: string;
  slug: string;
  name: string;
  short_name: string | null;
  accent: AccentKey;
  kind: "bde" | "association";
  status: "setup" | "active" | "suspended" | "archived";
  /** The association's public page is online (posts can only go online with it). */
  page_public: boolean;
}

export interface EditorialSettings {
  /** approval: a second person approves the exact version; direct: publishers publish alone. */
  review_mode: "approval" | "direct";
  /** Sign articles with the author's name (otherwise the association signs alone). */
  show_authors: boolean;
}

export interface ContentDashboard {
  organization: DeskOrganization;
  settings: EditorialSettings & { updated_at: string | null; updated_by_name: string | null };
  can: {
    /** May start posts (posts.create or posts.edit). */
    create: boolean;
    /** May edit every post of the association. */
    edit: boolean;
    approve: boolean;
    publish: boolean;
    /** May change the editorial settings (posts.settings). */
    settings: boolean;
    /** Sees every post (edit, approve or publish); otherwise only one's own. */
    all: boolean;
  };
  posts: PostSummary[];
}

export interface RevisionInfo {
  id: string;
  number: number;
  status: RevisionStatus;
  version: number;
  kind: PostKind;
  title: string;
  created_by_name: string;
  created_at: string;
  updated_by_name: string;
  updated_at: string;
  /** Names of everyone who wrote in this version. */
  contributors: string[];
  submitted_at: string | null;
  submitted_by_name: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  /** How it was approved: "review" (by a second person) or "direct" (published or scheduled by a publisher alone). */
  review_mode: "review" | "direct" | null;
  /** The latest decision's note (changes requested, or an approval note). */
  review_note: string | null;
  /** When this version went online (null: never). */
  published_at: string | null;
  /** The version number this one was restored from. */
  restored_from: number | null;
}

export interface WorkingRevision extends RevisionInfo {
  intro: string | null;
  body: PostDocument;
  cover_media_id: string | null;
  category_id: string | null;
  tags: string[];
}

export interface LibraryImage {
  id: string;
  path: string;
  kind: "logo" | "cover" | "image";
  width: number;
  height: number;
  alt: string | null;
}

export interface PostReviewEntry {
  revision: number;
  decision: "approved" | "changes_requested" | "published_directly";
  reviewer_name: string;
  note: string | null;
  created_at: string;
}

export interface PostEditor {
  post: PostSummary;
  organization: OrganizationCardPayload & { status: DeskOrganization["status"]; page_public: boolean };
  settings: EditorialSettings;
  working: WorkingRevision;
  /** Every version, newest first (no content). */
  history: RevisionInfo[];
  reviews: PostReviewEntry[];
  /** The association's image library (removed images excluded). */
  media: LibraryImage[];
  /** Active rubriques, plus the archived one the working version still uses. */
  categories: { id: string; slug: string; label: string; archived: boolean }[];
  can: {
    edit: boolean;
    approve: boolean;
    /** May review the submitted working version (approve right, and neither wrote nor sent it). */
    review_this: boolean;
    publish: boolean;
    upload: boolean;
    /** Never online and not scheduled: the draft may be deleted. */
    delete: boolean;
  };
}

/** A version in the public article's shape, for the private preview. */
export interface PostPreview {
  id: string;
  slug: string | null;
  kind: PostKind;
  title: string;
  intro: string | null;
  body: PostDocument;
  cover: MediaPayload | null;
  category: { slug: string; label: string } | null;
  tags: string[];
  organization: OrganizationCardPayload;
  first_published_at: string | null;
  published_at: string | null;
  reading_minutes: number;
  author_name: string | null;
  media: Record<string, MediaPayload | null>;
  revision: { id: string; number: number; status: RevisionStatus; live: boolean };
}

export type ReportReason = "harassment" | "discrimination" | "misleading" | "privacy" | "image_rights" | "spam" | "other";

export interface ModerationQueue {
  /** Open reports, grouped by post, the most recently reported first. Reporters are never named. */
  open: {
    post: PostCardPayload & { hidden: boolean; public: boolean };
    count: number;
    reasons: Partial<Record<ReportReason, number>>;
    reports: { id: string; reason: ReportReason; details: string | null; created_at: string }[];
    first_at: string;
  }[];
  hidden: (PostCardPayload & { hidden_at: string; hidden_reason: string; hidden_by_name: string | null })[];
  /** The 30 latest closed reports. */
  resolved: {
    id: string;
    reason: ReportReason;
    status: "dismissed" | "actioned";
    resolved_at: string;
    resolved_by_name: string | null;
    note: string | null;
    post_title: string | null;
    organization: string | null;
  }[];
  /** The 50 latest moderation events (reports, dismissals, hides, restores). */
  history: { occurred_at: string; action: string; actor_name: string | null; reason: string | null; post_title: string | null }[];
}

/** The published content of a reported or hidden post, for its moderator (never a draft). */
export interface ModeratedPost extends PostCardPayload {
  body: PostDocument;
  media: Record<string, MediaPayload | null>;
  hidden: boolean;
  hidden_reason: string | null;
  publication: "unpublished" | "published" | "archived";
}

export interface PostCategory {
  id: string;
  slug: string;
  label: string;
  sort_order: number;
  archived_at: string | null;
}

export const getContentDashboard = cache((organizationId: string) =>
  readGovernance<ContentDashboard>("content_dashboard", (s) =>
    s.rpc("content_dashboard", { p_organization_id: organizationId }),
  ),
);

export const getPostEditor = cache((postId: string) =>
  readGovernance<PostEditor>("post_editor", (s) => s.rpc("post_editor", { p_post_id: postId })),
);

export const getPostPreview = cache((postId: string, revisionId?: string) =>
  readGovernance<PostPreview>("post_preview", (s) =>
    s.rpc("post_preview", revisionId ? { p_post_id: postId, p_revision_id: revisionId } : { p_post_id: postId }),
  ),
);

export const getModerationQueue = cache(() =>
  readGovernance<ModerationQueue>("moderation_queue", (s) => s.rpc("moderation_queue")),
);

export const getModeratedPost = cache((postId: string) =>
  readGovernance<ModeratedPost>("moderated_post", (s) => s.rpc("moderated_post", { p_post_id: postId })),
);

/**
 * The rubrique catalog. Everyone reads the active ones; BDE leadership also
 * reads the archived ones (row-level security decides, not this function).
 */
export const getPostCategories = cache(async (): Promise<PostCategory[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("post_categories")
    .select("id, slug, label, sort_order, archived_at")
    .order("sort_order")
    .order("label");
  if (error) {
    logDataError("post_categories", error);
    return [];
  }
  return data as PostCategory[];
});
