import type { PostItem, PublicationStatus } from "@/lib/types";
import { formatTime, relativeDay } from "@/lib/format";
import { POST_KIND_LABEL, publishedLabel, publishedPhrase } from "@/components/campus/labels";

/**
 * Cells and filter values of the workspace content table
 * (/manage/[asso]/content and the home digest). Pure formatting.
 */

/** Filter order in the URL (?statut=): what needs a hand first. */
export const POST_STATUSES: PublicationStatus[] = ["brouillon", "programme", "publie"];

export const POST_STATUS_PLURAL: Record<PublicationStatus, string> = {
  brouillon: "Brouillons",
  programme: "Programmés",
  publie: "Publiés",
};

export function parsePostStatus(value: string | string[] | undefined): PublicationStatus | null {
  const v = Array.isArray(value) ? value[0] : value;
  return POST_STATUSES.includes(v as PublicationStatus) ? (v as PublicationStatus) : null;
}

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * When, in the words of the post's state:
 * "Publié hier" · "En ligne jeudi à 12h" · "Rédigé il y a 4 jours".
 */
export function postDatePhrase(post: Pick<PostItem, "publication" | "publishedAt" | "scheduledFor">, now = new Date()) {
  if (post.publication === "publie") return publishedPhrase(post.publishedAt, now);
  if (post.publication === "programme") {
    const at = post.scheduledFor ?? post.publishedAt;
    return `En ligne ${lowerFirst(relativeDay(at, now))} à ${formatTime(at)}`;
  }
  const label = publishedLabel(post.publishedAt, now);
  return /^\d/.test(label) ? `Rédigé le ${label}` : `Rédigé ${lowerFirst(label)}`;
}

/** Rubrique in mono, then the title. */
export function PostTitleCell({ post }: { post: PostItem }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="type-label text-[0.68rem] text-subtle">{POST_KIND_LABEL[post.kind]}</span>
      <span className="font-bold break-words">{post.title}</span>
    </div>
  );
}

export function PostDateCell({ post, now = new Date() }: { post: PostItem; now?: Date }) {
  const iso = post.publication === "programme" ? (post.scheduledFor ?? post.publishedAt) : post.publishedAt;
  return (
    <time dateTime={iso} className="type-small">
      {postDatePhrase(post, now)}
    </time>
  );
}
