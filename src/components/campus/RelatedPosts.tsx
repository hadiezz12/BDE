import type { PostItem as Post } from "@/lib/types";
import { cx } from "@/lib/cx";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { PostItem } from "./PostItem";

/**
 * Published articles that point to this event or recruitment (their
 * announcement or their recap), by the link their association set
 * (public_related_posts), never by shared words. Nothing rendered when
 * there are none; only what is public right now is ever passed in.
 */
export function RelatedPosts({
  posts,
  id,
  kicker,
  title,
  className,
}: {
  posts: Post[];
  id: string;
  kicker: string;
  title: string;
  className?: string;
}) {
  if (posts.length === 0) return null;
  return (
    <section aria-labelledby={id} className={cx("wrap", className)}>
      <SectionHeader id={id} kicker={kicker} title={title} />
      <ul className="mt-8 grid gap-y-10 md:grid-cols-3">
        {posts.map((p, i) => (
          <li
            key={p.id}
            className={cx(
              "flex md:px-6 md:first:pl-0 md:last:pr-0",
              i > 0 && "border-t border-line pt-8 md:border-l md:border-t-0 md:pt-0",
            )}
          >
            <PostItem post={p} withImage={p.kind !== "breve"} className="w-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}
