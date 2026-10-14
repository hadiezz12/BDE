import Link from "next/link";
import type { PostItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { MediaFrame } from "@/components/media/MediaFrame";
import { Byline } from "./Byline";
import { PostKicker } from "./PostKicker";
import { POST_KIND_LABEL } from "./labels";

/**
 * The front-page story: a big photo, a condensed all-caps headline, the
 * standfirst and the byline. The whole block is one link (stretched title).
 *  - stacked : photo above text (lead next to the "En bref" column)
 *  - split   : photo and text side by side from lg: (lead alone on its row)
 */
export function PostLead({
  post,
  layout = "stacked",
  className,
}: {
  post: PostItem;
  layout?: "stacked" | "split";
  className?: string;
}) {
  const split = layout === "split";
  return (
    <article className={cx("group relative grid gap-5", split && "lg:grid-cols-12 lg:items-end lg:gap-8", className)}>
      <MediaFrame
        photo={post.cover}
        ratio="3/2"
        slot="post-cover"
        priority
        sizes={split ? "(min-width: 1024px) 55vw, 100vw" : "(min-width: 1024px) 62vw, 100vw"}
        fallback={{ title: post.title, accent: post.association.accent, kicker: POST_KIND_LABEL[post.kind] }}
        className={cx(
          "max-sm:mx-[calc(var(--gutter)*-1)] sm:border-2 sm:border-fg",
          split && "lg:col-span-7",
        )}
        imgClassName="transition-transform duration-500 ease-out group-hover:scale-[1.02]"
      />
      <div className={cx("flex flex-col gap-4", split && "lg:col-span-5 lg:pb-1")}>
        <PostKicker post={post} />
        <h2
          className={cx(
            "type-headline break-words hyphens-auto",
            split ? "text-[clamp(2rem,1rem+3vw,3.6rem)]" : "text-[clamp(2.1rem,0.9rem+4.2vw,4.75rem)]",
          )}
        >
          <Link
            href={routes.post(post.slug)}
            className="decoration-[3px] underline-offset-[0.12em] after:absolute after:inset-0 group-hover:underline"
          >
            {post.title}
          </Link>
        </h2>
        <p className="max-w-3xl type-lead text-muted">{post.excerpt}</p>
        <Byline post={post} linkAssociation={false} className="mt-1" />
      </div>
    </article>
  );
}
