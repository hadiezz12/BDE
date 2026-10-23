import Link from "next/link";
import type { CategoryRef, PostItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";
import { POST_KIND_LABEL } from "./labels";

/** The fil filtered on one rubrique. */
export function rubriqueHref(slug: string): string {
  return `${routes.campus}?rubrique=${encodeURIComponent(slug)}`;
}

/**
 * Running head above a story: its kind in the association's colour (square
 * bullet, like a printed section mark) and who wrote it. The article page
 * adds the rubrique, linked to the fil filtered on it; an association's own
 * page marks the stories it pinned.
 */
export function PostKicker({
  post,
  showAssociation = true,
  category,
  pinned = false,
  className,
}: {
  post: Pick<PostItem, "kind" | "association">;
  showAssociation?: boolean;
  /** The rubrique, as a link (only where the kicker is not inside a clickable card). */
  category?: CategoryRef;
  /** Pinned on its association's page (shown there only). */
  pinned?: boolean;
  className?: string;
}) {
  const separator = (
    <>
      <span aria-hidden>· </span>
      <span className="sr-only">, </span>
    </>
  );
  return (
    <p data-accent={post.association.accent} className={cx("flex flex-wrap items-center gap-x-2 gap-y-1 type-label", className)}>
      <span aria-hidden className="size-2 shrink-0 bg-assoc" />
      <span className="text-assoc-text">{POST_KIND_LABEL[post.kind]}</span>
      {category && (
        <span>
          {separator}
          <Link
            href={rubriqueHref(category.slug)}
            className="relative z-10 underline decoration-1 underline-offset-[0.2em] hover:text-assoc-text hover:decoration-2"
          >
            {category.label}
          </Link>
        </span>
      )}
      {showAssociation && (
        <span className="text-muted">
          {separator}
          {post.association.shortName ?? post.association.name}
        </span>
      )}
      {pinned && (
        <span className="inline-flex items-center gap-1 text-muted">
          {separator}
          <Icon name="pushpin" size={13} className="shrink-0" />
          Épinglé
        </span>
      )}
    </p>
  );
}
