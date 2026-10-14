import type { PostItem } from "@/lib/types";
import { cx } from "@/lib/cx";
import { POST_KIND_LABEL } from "./labels";

/**
 * Running head above a story: rubrique in the association's colour (square
 * bullet, like a printed section mark) and who wrote it.
 */
export function PostKicker({
  post,
  showAssociation = true,
  className,
}: {
  post: Pick<PostItem, "kind" | "association">;
  showAssociation?: boolean;
  className?: string;
}) {
  return (
    <p data-accent={post.association.accent} className={cx("flex flex-wrap items-center gap-x-2 gap-y-1 type-label", className)}>
      <span aria-hidden className="size-2 shrink-0 bg-assoc" />
      <span className="text-assoc-text">{POST_KIND_LABEL[post.kind]}</span>
      {showAssociation && (
        <span className="text-muted">
          <span aria-hidden>· </span>
          <span className="sr-only">, </span>
          {post.association.shortName ?? post.association.name}
        </span>
      )}
    </p>
  );
}
