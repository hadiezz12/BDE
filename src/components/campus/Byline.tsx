import type { PostItem } from "@/lib/types";
import { formatDateLong } from "@/lib/format";
import { cx } from "@/lib/cx";
import { Avatar } from "@/components/ui/Avatar";
import { AssociationIdentity } from "@/components/associations/AssociationIdentity";
import { publishedLabel, publishedPhrase } from "./labels";

type BylinePost = Pick<PostItem, "authorName" | "association" | "publishedAt" | "readingMinutes">;

/**
 * Who, for whom, when, how long.
 *  - full    : article pages and the lead story — author initials, association
 *              lockup, relative date, reading time, between two hairlines.
 *  - compact : one mono line under column stories.
 */
export function Byline({
  post,
  variant = "full",
  linkAssociation = true,
  className,
}: {
  post: BylinePost;
  variant?: "full" | "compact";
  /** Off inside a clickable card, so the card stays one link. */
  linkAssociation?: boolean;
  className?: string;
}) {
  const time = (label: string) => (
    <time dateTime={post.publishedAt} title={formatDateLong(post.publishedAt)}>
      {label}
    </time>
  );

  if (variant === "compact") {
    return (
      <p className={cx("type-meta text-muted", className)}>
        Par {post.authorName} · {time(publishedLabel(post.publishedAt))} · {post.readingMinutes} min
      </p>
    );
  }

  return (
    <div
      className={cx(
        "flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-line py-3.5",
        className,
      )}
    >
      <p className="flex items-center gap-2.5">
        <span aria-hidden>
          <Avatar name={post.authorName} accent={post.association.accent} size={36} />
        </span>
        <span>
          Par <strong className="font-bold">{post.authorName}</strong>
        </span>
      </p>
      <AssociationIdentity association={post.association} size="sm" link={linkAssociation} className="relative z-10" />
      <p className="type-meta text-muted">
        {time(publishedPhrase(post.publishedAt))} · {post.readingMinutes} min de lecture
      </p>
    </div>
  );
}
