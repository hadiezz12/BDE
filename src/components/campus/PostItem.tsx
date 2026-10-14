import Link from "next/link";
import type { PostItem as Post } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { MediaFrame } from "@/components/media/MediaFrame";
import { Byline } from "./Byline";
import { PostKicker } from "./PostKicker";
import { POST_KIND_LABEL } from "./labels";

/**
 * A column story. Sentence-case title, rubrique kicker, compact byline.
 *  - md : photo on top (optional), title, excerpt — the secondary stories
 *  - sm : title + byline, optional thumbnail on the right — archive lists
 * The whole story is one link (stretched title), no nested controls.
 */
export function PostItem({
  post,
  size = "md",
  withImage = false,
  as: Heading = "h3",
  className,
}: {
  post: Post;
  size?: "md" | "sm";
  withImage?: boolean;
  as?: "h2" | "h3" | "h4";
  className?: string;
}) {
  const fallback = { title: post.title, accent: post.association.accent, kicker: POST_KIND_LABEL[post.kind] };
  const title = (
    <Heading
      className={cx(
        "type-card break-words",
        size === "md" ? "text-[1.4rem] leading-[1.12] sm:text-[1.55rem]" : "text-[1.15rem]",
      )}
    >
      <Link
        href={routes.post(post.slug)}
        className="decoration-2 underline-offset-[0.15em] after:absolute after:inset-0 group-hover:underline"
      >
        {post.title}
      </Link>
    </Heading>
  );

  if (size === "sm") {
    return (
      <article className={cx("group relative flex items-start gap-4", className)}>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <PostKicker post={post} />
          {title}
          <Byline post={post} variant="compact" />
        </div>
        {withImage && (
          <MediaFrame
            photo={post.cover}
            ratio="1/1"
            slot="post-cover"
            sizes="112px"
            fallback={fallback}
            className="w-20 shrink-0 border border-fg sm:w-28"
          />
        )}
      </article>
    );
  }

  return (
    <article className={cx("group relative flex flex-col gap-3", className)}>
      {withImage && (
        <MediaFrame
          photo={post.cover}
          ratio="3/2"
          slot="post-cover"
          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw"
          fallback={fallback}
          className="mb-1 border-2 border-fg"
          imgClassName="transition-transform duration-500 ease-out group-hover:scale-[1.03]"
        />
      )}
      <PostKicker post={post} />
      {title}
      <p className="text-muted">{post.excerpt}</p>
      <Byline post={post} variant="compact" className="mt-auto pt-1" />
    </article>
  );
}
