/**
 * What the editor sends when it saves, checked and cleaned on the server
 * before it reaches save_post_revision (which checks it all again). Pure
 * module (no path-alias imports): the unit tests load it with plain Node.
 */

import type { PostKind } from "../types";
import { normalizeDocument, normalizeTag, type PostDocument } from "./document.ts";

export const POST_LIMITS = { title: 140, intro: 400, tags: 8 } as const;

const KINDS: PostKind[] = ["article", "annonce", "recap", "breve"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface PostContent {
  kind: PostKind;
  title: string;
  intro: string | null;
  body: PostDocument;
  cover_media_id: string | null;
  category_id: string | null;
  tags: string[];
}

/** One line of text: control characters out, spaces collapsed, trimmed. */
function line(value: unknown): string {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

const optionalId = (value: unknown): string | null | undefined =>
  value === null || value === undefined || value === "" ? null : typeof value === "string" && UUID.test(value) ? value : undefined;

/**
 * Untrusted editor input → the content to save, or why it cannot be saved
 * (the reason names the field, for the message). Too-long text is refused
 * rather than cut: the editor shows the limits as the person types.
 */
export function normalizePostContent(
  input: unknown,
): { ok: true; value: PostContent } | { ok: false; field: "kind" | "title" | "intro" | "body" | "cover" | "category" | "tags" } {
  if (!input || typeof input !== "object") return { ok: false, field: "body" };
  const raw = input as Record<string, unknown>;

  const kind = raw.kind as PostKind;
  if (!KINDS.includes(kind)) return { ok: false, field: "kind" };

  const title = line(raw.title);
  if (title.length > POST_LIMITS.title) return { ok: false, field: "title" };

  const intro = line(raw.intro);
  if (intro.length > POST_LIMITS.intro) return { ok: false, field: "intro" };

  const body = normalizeDocument(raw.body ?? { type: "doc", content: [] });
  if (!body.ok) return { ok: false, field: "body" };

  const cover = optionalId(raw.cover_media_id);
  if (cover === undefined) return { ok: false, field: "cover" };
  const category = optionalId(raw.category_id);
  if (category === undefined) return { ok: false, field: "category" };

  if (raw.tags !== undefined && !Array.isArray(raw.tags)) return { ok: false, field: "tags" };
  const tags: string[] = [];
  for (const t of (raw.tags as unknown[] | undefined) ?? []) {
    const tag = typeof t === "string" ? normalizeTag(t) : null;
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > POST_LIMITS.tags) return { ok: false, field: "tags" };

  return {
    ok: true,
    value: {
      kind,
      title,
      intro: intro || null,
      body: body.value,
      // Brèves have no cover: one chosen before switching to "brève" is dropped.
      cover_media_id: kind === "breve" ? null : cover,
      category_id: category,
      tags,
    },
  };
}
