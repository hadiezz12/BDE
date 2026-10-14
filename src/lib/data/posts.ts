import "server-only";
import { posts } from "@/data/mock";
import type { CampusPost, PostItem, PostKind } from "@/lib/types";
import { associationRef } from "./associations";

function join(p: CampusPost): PostItem {
  return { ...p, association: associationRef(p.associationId) };
}

export async function getPosts(
  query: { associationId?: string; kind?: PostKind; limit?: number; includeUnpublished?: boolean } = {},
): Promise<PostItem[]> {
  const list = posts
    .filter((p) => query.includeUnpublished || p.publication === "publie")
    .filter((p) => !query.associationId || p.associationId === query.associationId)
    .filter((p) => !query.kind || p.kind === query.kind)
    .sort((a, b) => Date.parse(b.scheduledFor ?? b.publishedAt) - Date.parse(a.scheduledFor ?? a.publishedAt))
    .map(join);
  return query.limit ? list.slice(0, query.limit) : list;
}

export async function getPost(slug: string): Promise<PostItem | null> {
  const p = posts.find((x) => x.slug === slug && x.publication === "publie");
  return p ? join(p) : null;
}
