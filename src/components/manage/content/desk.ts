import type { PostKind } from "@/lib/types";
import type { ManageContext } from "@/lib/data/manage";
import type { ContentDashboard, EditorialSettings } from "@/lib/posts/editor";
import { DESK_VIEWS, POST_KINDS, feedQuery, matchesDeskSearch, type DeskView, type PostSummary } from "@/lib/posts/model";
import { routes } from "@/lib/routes";
import { POST_KIND_LABEL } from "@/components/campus/labels";

/**
 * The content desk's state, read from the URL and derived from
 * public.content_dashboard: which tab, which search, which order, and what
 * waits for the person. Display only: the dashboard already contains just
 * the posts this person may see, and every action is checked again by the
 * database.
 */

type Raw = string | string[] | undefined;
const first = (v: Raw) => (Array.isArray(v) ? v[0] : v);

export type DeskSort = "modifie" | "publication" | "titre";

/** The orders offered on the desk; the first one is the default (left out of the URL). */
export const DESK_SORTS: { key: DeskSort; label: string }[] = [
  { key: "modifie", label: "Dernière modification" },
  { key: "publication", label: "Date de publication" },
  { key: "titre", label: "Titre, de A à Z" },
];

export interface DeskQuery {
  view: DeskView;
  q: string;
  kind: PostKind | null;
  sort: DeskSort;
}

/** ?vue=…&q=…&type=…&tri=… — anything unknown falls back to the default. */
export function parseDeskQuery(sp: Record<string, Raw>): DeskQuery {
  const vue = first(sp.vue);
  const type = first(sp.type);
  const tri = first(sp.tri);
  return {
    view: DESK_VIEWS.find((v) => v.key === vue)?.key ?? "tous",
    q: feedQuery(sp.q),
    kind: POST_KINDS.find((k) => k === type) ?? null,
    sort: DESK_SORTS.find((s) => s.key === tri)?.key ?? "modifie",
  };
}

/** The desk's URL for these filters (defaults left out, so the plain URL is the default view). */
export function deskHref(asso: string, q: Partial<DeskQuery>): string {
  const sp = new URLSearchParams();
  if (q.view && q.view !== "tous") sp.set("vue", q.view);
  if (q.q) sp.set("q", q.q);
  if (q.kind) sp.set("type", q.kind);
  if (q.sort && q.sort !== "modifie") sp.set("tri", q.sort);
  const qs = sp.toString();
  return qs ? `${routes.manageContent(asso)}?${qs}` : routes.manageContent(asso);
}

/** Search and kind filter (the tabs are applied on top, so each tab can count its matches). */
export function filterPosts(posts: PostSummary[], { q, kind }: Pick<DeskQuery, "q" | "kind">): PostSummary[] {
  return posts.filter((p) => (!kind || p.kind === kind) && matchesDeskSearch(p, q, POST_KIND_LABEL[p.kind]));
}

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Number.NEGATIVE_INFINITY);
const titleCollator = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

export function sortPosts(posts: PostSummary[], sort: DeskSort): PostSummary[] {
  const byEdit = (a: PostSummary, b: PostSummary) => time(b.working.updated_at) - time(a.working.updated_at);
  const list = [...posts];
  if (sort === "titre") {
    // Untitled drafts last, then the most recently edited first among them.
    return list.sort((a, b) =>
      !a.title.trim() || !b.title.trim()
        ? Number(!a.title.trim()) - Number(!b.title.trim()) || byEdit(a, b)
        : titleCollator.compare(a.title.trim(), b.title.trim()),
    );
  }
  if (sort === "publication") {
    // Newest first publication first; never published last, by last edit.
    return list.sort((a, b) => time(b.first_published_at) - time(a.first_published_at) || byEdit(a, b));
  }
  return list.sort(byEdit);
}

// ---- What waits for the person ---------------------------------------------------------------

export type ContentTaskKind = "hidden" | "failed" | "review" | "changes";

export interface ContentTask {
  kind: ContentTaskKind;
  post: PostSummary;
}

const TASK_ORDER: Record<ContentTaskKind, number> = { hidden: 0, failed: 1, review: 2, changes: 3 };

/**
 * May this person review the post's submitted version? The approve right,
 * and neither wrote in it nor sent it (public.review_post_revision refuses
 * self-review with the same test).
 */
export function canReview(post: PostSummary, can: ContentDashboard["can"], userId: string): boolean {
  return (
    can.approve &&
    post.working.status === "submitted" &&
    post.working.submitted_by !== userId &&
    !post.working.contributors.includes(userId)
  );
}

/** Did this person start the post or write in its current version? */
export function isMine(post: PostSummary, userId: string): boolean {
  return post.created_by_you || post.working.contributors.includes(userId);
}

/**
 * The posts that need someone, one line per post (its most urgent reason):
 * hidden by the BDE's moderation, a scheduled publication that failed, a
 * version waiting for MY review, my post sent back with changes requested.
 */
export function contentTasks(dashboard: Pick<ContentDashboard, "posts" | "can">, userId: string): ContentTask[] {
  const tasks: ContentTask[] = [];
  for (const post of dashboard.posts) {
    const kind: ContentTaskKind | null = post.hidden
      ? "hidden"
      : post.schedule?.status === "failed"
        ? "failed"
        : canReview(post, dashboard.can, userId)
          ? "review"
          : post.working.status === "changes_requested" && isMine(post, userId)
            ? "changes"
            : null;
    if (kind) tasks.push({ kind, post });
  }
  // Stable: within a kind, the dashboard's order (most recently changed first) stays.
  return tasks.sort((a, b) => TASK_ORDER[a.kind] - TASK_ORDER[b.kind]);
}

// ---- The editorial policy in words -----------------------------------------------------------

export const REVIEW_MODE_LINE: Record<EditorialSettings["review_mode"], string> = {
  approval: "Relecture obligatoire avant publication",
  direct: "Publication directe par les postes qui publient",
};

export const REVIEW_MODE_TITLE: Record<EditorialSettings["review_mode"], string> = {
  approval: "Relecture obligatoire",
  direct: "Publication directe",
};

export function signatureLine(showAuthors: boolean): string {
  return showAuthors ? "Articles signés par leur auteur ou autrice" : "Articles signés par l'asso";
}

/** Suspended or archived association, or suspended membership (same order as the page editor). */
export function readOnlyReason(
  ctx: Pick<ManageContext, "membership" | "organization">,
): "membership_suspended" | "organization_suspended" | "organization_archived" | null {
  if (ctx.membership.membership_status === "suspended") return "membership_suspended";
  if (ctx.organization.status === "suspended") return "organization_suspended";
  if (ctx.organization.status === "archived") return "organization_archived";
  return null;
}
