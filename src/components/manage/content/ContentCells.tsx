import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import type { AccentKey } from "@/lib/types";
import type { ContentDashboard } from "@/lib/posts/editor";
import { postStage, SCHEDULE_ERROR_LABEL, type PostSummary } from "@/lib/posts/model";
import { formatScheduled } from "@/lib/posts/schedule";
import { mediaUrl } from "@/lib/associations/model";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { formatDateLong, formatDayShort, formatTime } from "@/lib/format";
import { dayDiff, parisDateKey } from "@/lib/time";
import { POST_KIND_LABEL } from "@/components/campus/labels";
import { PostStageBadge } from "@/components/posts/PostStageBadge";
import { canReview } from "./desk";

/**
 * Pieces of the content desk's rows, shared by the desktop table and the
 * phone list (ContentTable) and by the "à traiter" lines (ContentTasks).
 * Server components: they only format what public.content_dashboard sent.
 */

/** "21 oct." this year, "21 octobre 2025" before. */
export function shortDate(iso: string, now = new Date()): string {
  return parisDateKey(iso).slice(0, 4) === parisDateKey(now).slice(0, 4) ? formatDayShort(iso) : formatDateLong(iso);
}

/** "aujourd'hui à 14h05" · "hier à 9h" · "il y a 3 jours" · "le 21 oct." — to follow "Modifié". */
export function editedWhen(iso: string, now = new Date()): string {
  const days = dayDiff(iso, now);
  if (days <= 0) return `aujourd'hui à ${formatTime(iso)}`;
  if (days === 1) return `hier à ${formatTime(iso)}`;
  if (days < 7) return `il y a ${days} jours`;
  return `le ${shortDate(iso, now)}`;
}

export function postTitle(post: Pick<PostSummary, "title">): string {
  return post.title.trim() || "Sans titre";
}

/** Who started the post, as the desk says it ("toi" for the reader). */
export function authorName(post: Pick<PostSummary, "created_by_you" | "created_by_name">): string {
  return post.created_by_you ? "toi" : post.created_by_name;
}

/**
 * The cover, small. Drafts' images are private: they come from the preview
 * route (never the shared image optimizer). Without a cover, a little
 * screen-printed poster in the association's accent with the kind's name.
 * Decorative either way: the title sits right next to it.
 */
export function CoverThumb({
  post,
  accent,
  className,
}: {
  post: Pick<PostSummary, "cover" | "kind">;
  accent: AccentKey;
  className?: string;
}) {
  if (post.cover) {
    return (
      <span className={cx("relative block aspect-[4/3] shrink-0 overflow-hidden rounded-xs bg-sunken", className)}>
        <Image src={mediaUrl(post.cover.path, true)} alt="" fill unoptimized sizes="5rem" className="object-cover" />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      data-accent={accent}
      className={cx(
        "grain relative flex aspect-[4/3] shrink-0 items-end overflow-hidden rounded-xs bg-assoc p-1.5 text-assoc-fg",
        className,
      )}
    >
      <span
        className="halftone absolute -right-3 -top-3 size-10 rounded-full opacity-60"
        style={{ "--dot": "rgb(12 10 14 / 0.3)", "--dot-gap": "5px" } as CSSProperties}
      />
      <span className="relative type-label text-[0.56rem] leading-none">{POST_KIND_LABEL[post.kind]}</span>
    </span>
  );
}

/** Where the post stands, with what the badge alone cannot say: when, why, what stays online. */
export function PostStatus({ post, now = new Date() }: { post: PostSummary; now?: Date }) {
  const stage = postStage(post);
  const liveMeanwhile =
    post.publication === "published" && !post.hidden && stage !== "live" && stage !== "live_draft";
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <PostStageBadge post={post} className="whitespace-normal!" />
      {stage === "failed" && post.schedule && (
        <span className="type-small text-danger">
          Prévue {formatScheduled(post.schedule.at)}&nbsp;: {SCHEDULE_ERROR_LABEL[post.schedule.error ?? ""] ?? SCHEDULE_ERROR_LABEL.unexpected}.
        </span>
      )}
      {stage === "hidden" && post.hidden && (
        <span className="line-clamp-2 type-small break-words text-danger">Raison du BDE&nbsp;: {post.hidden.reason}</span>
      )}
      {stage === "archived" && post.archived_at && (
        <span className="type-meta text-subtle">Depuis le {shortDate(post.archived_at, now)}, lisible à son adresse</span>
      )}
      {stage === "offline" && post.unpublished_at && (
        <span className="type-meta text-subtle">Le {shortDate(post.unpublished_at, now)}</span>
      )}
      {liveMeanwhile && (
        <span className="type-meta text-subtle">
          {stage === "scheduled" ? "La version en ligne reste visible d'ici là" : "La version publiée reste en ligne"}
        </span>
      )}
    </div>
  );
}

/** What opening the post means for this person: review it, edit it, or just look. */
export function openLabel(post: PostSummary, can: ContentDashboard["can"], userId: string): "Relire" | "Modifier" | "Ouvrir" {
  if (canReview(post, can, userId)) return "Relire";
  if (can.edit || post.created_by_you) return "Modifier";
  return "Ouvrir";
}

/** The post's title as a link to its editor, with its kind and author under it. */
export function PostTitleLink({ post, asso, className }: { post: PostSummary; asso: string; className?: string }) {
  return (
    <Link
      href={routes.manageContentPost(asso, post.id)}
      className={cx("font-bold leading-snug break-words hover:text-assoc-text hover:underline", !post.title.trim() && "italic", className)}
    >
      {postTitle(post)}
    </Link>
  );
}

export function PostByline({ post }: { post: PostSummary }) {
  return (
    <span className="type-meta text-subtle">
      {POST_KIND_LABEL[post.kind]}
      {post.category && ` · ${post.category}`} · par {authorName(post)}
      {post.pinned && " · épinglé"}
    </span>
  );
}
