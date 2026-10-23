import "server-only";
import { cache } from "react";
import type { PostItem, PostKind } from "@/lib/types";
import { createSupabasePublicClient } from "@/lib/supabase/public";
import { SupabaseConfigError } from "@/lib/supabase/env";
import {
  toPostArticle,
  toPostItem,
  type PostArticle,
  type PostCardPayload,
  type PostFacets,
  type PublicPostState,
} from "@/lib/posts/model";
import { logDataError, toDataError } from "./errors";

/**
 * Published posts, read as a visitor (anon client, no cookies) through the
 * public read functions (public_posts, public_post…), which only ever return
 * the live revision of published, visible posts of public association pages.
 * Memoised per request only: a publication, an edit going live, a hide or an
 * unpublish shows on the next page load, with no cache to purge.
 */

type PublicRpc =
  | "public_posts"
  | "public_post"
  | "public_post_facets"
  | "public_featured_posts"
  | "public_association_posts"
  | "public_post_sitemap";

async function rpc<T>(name: PublicRpc, args?: Record<string, unknown>): Promise<T | null> {
  let supabase;
  try {
    supabase = createSupabasePublicClient();
  } catch (error) {
    if (error instanceof SupabaseConfigError) return null;
    throw error;
  }
  const { data, error } = await supabase.rpc(name as never, args as never);
  if (error) {
    logDataError(name, error);
    throw toDataError(error);
  }
  return data as T;
}

export interface FeedQuery {
  /** Association slug. */
  association?: string | null;
  category?: string | null;
  kind?: PostKind | null;
  q?: string | null;
  /** Cursor: the last item of the previous page. */
  before?: { at: string; id: string } | null;
  limit?: number;
}

export interface FeedPage {
  items: PostItem[];
  /** Cursor of the next page, when there may be one. */
  next: { at: string; id: string } | null;
}

/**
 * One page of the feed, newest first publication first. Keyset pagination
 * on (first publication, id): new posts appearing meanwhile never shift or
 * repeat what the reader already saw.
 */
export async function getFeed(query: FeedQuery = {}): Promise<FeedPage> {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);
  const payload = await rpc<PostCardPayload[]>("public_posts", {
    p_organization_slug: query.association ?? undefined,
    p_category: query.category ?? undefined,
    p_kind: query.kind ?? undefined,
    p_q: query.q ?? undefined,
    p_before_at: query.before?.at,
    p_before_id: query.before?.id,
    p_limit: limit,
  });
  const items = (payload ?? []).map((p) => toPostItem(p));
  const last = items[items.length - 1];
  return { items, next: items.length === limit && last ? { at: last.publishedAt, id: last.id } : null };
}

/** The first page of the feed, whatever filters (memoised for the request). */
export const getLatestPosts = cache(async (limit = 20): Promise<PostItem[]> => (await getFeed({ limit })).items);

/** Compatibility for the pages that list an association's posts or recent posts. */
export async function getPosts(query: { associationSlug?: string; kind?: PostKind; limit?: number } = {}): Promise<PostItem[]> {
  return (await getFeed({ association: query.associationSlug, kind: query.kind, limit: query.limit ?? 20 })).items;
}

export const getPostPage = cache(async (slug: string): Promise<{ state: "ok"; post: PostArticle } | { state: "moved"; slug: string } | { state: "not_found" }> => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 100) return { state: "not_found" };
  const page = await rpc<PublicPostState>("public_post", { p_slug: slug });
  if (!page) return { state: "not_found" };
  if (page.state === "ok") return { state: "ok", post: toPostArticle(page.post) };
  return page;
});

export const getPostFacets = cache(async (): Promise<PostFacets> => {
  return (await rpc<PostFacets>("public_post_facets")) ?? { total: 0, categories: [], organizations: [], kinds: {} };
});

/** Featured stories and important BDE announcements, while they last. */
export const getFeaturedPosts = cache(async (): Promise<{ featured: PostItem[]; important: PostItem[] }> => {
  const p = await rpc<{ featured: PostCardPayload[]; important: PostCardPayload[] }>("public_featured_posts");
  return { featured: (p?.featured ?? []).map((x) => toPostItem(x)), important: (p?.important ?? []).map((x) => toPostItem(x)) };
});

/** An association's own posts for its page: pinned first, then the newest. */
export async function getAssociationPosts(slug: string, limit = 6): Promise<PostItem[]> {
  return ((await rpc<PostCardPayload[]>("public_association_posts", { p_slug: slug, p_limit: limit })) ?? []).map((p) => toPostItem(p));
}

export async function getPostSitemap(): Promise<{ slug: string; published_at: string }[]> {
  return (await rpc<{ slug: string; published_at: string }[]>("public_post_sitemap")) ?? [];
}
