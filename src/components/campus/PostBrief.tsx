import Link from "next/link";
import type { PostItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { publishedLabel } from "./labels";

/**
 * One line of the "En bref" column: when · who, then the title. The
 * excerpt is optional — "wide" shows it from lg: only, so phones get a
 * compact list. Separators come from the parent list (divide-y).
 */
export function PostBrief({
  post,
  excerpt = "none",
  as: Heading = "h3",
  className,
}: {
  post: PostItem;
  excerpt?: "none" | "wide" | "always";
  as?: "h2" | "h3" | "h4";
  className?: string;
}) {
  return (
    <article className={cx("group relative flex flex-col gap-1.5 py-4", className)}>
      <p className="type-label text-muted">
        <time dateTime={post.publishedAt}>{publishedLabel(post.publishedAt)}</time>
        <span aria-hidden> · </span>
        <span className="sr-only">, </span>
        <span data-accent={post.association.accent} className="text-assoc-text">
          {post.association.shortName ?? post.association.name}
        </span>
      </p>
      <Heading className="text-[1.0625rem] font-bold leading-snug">
        <Link
          href={routes.post(post.slug)}
          className="underline-offset-[0.15em] after:absolute after:inset-0 group-hover:underline"
        >
          {post.title}
        </Link>
      </Heading>
      {excerpt !== "none" && post.excerpt && (
        <p className={cx("text-muted", excerpt === "wide" && "hidden lg:block")}>{post.excerpt}</p>
      )}
    </article>
  );
}
