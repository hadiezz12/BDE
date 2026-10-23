import Link from "next/link";
import type { PostItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { formatDateLong } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { publishedPhrase } from "./labels";

/**
 * The BDE's important announcements (two at most, for a limited time),
 * printed on paper across the night feed: the only notice that looks
 * urgent. Only the BDE's own posts can be marked "important", and only by
 * the BDE's leadership (platform.content.feature), so no association can
 * dress up a post as an institutional notice.
 */
export function ImportantBand({ posts, className }: { posts: PostItem[]; className?: string }) {
  if (posts.length === 0) return null;
  return (
    <section data-surface="paper" aria-labelledby="important-bde" className={cx("grain py-8 sm:py-10", className)}>
      <div className="wrap">
        <div className="grid gap-6 border-t-4 border-fg pt-4 lg:grid-cols-12 lg:gap-10">
          <h2 id="important-bde" className="flex items-start gap-2 type-label lg:col-span-3">
            <Icon name="alert" size={18} className="shrink-0 text-accent-text" />
            <span>
              Important
              <span className="block text-muted">Le bureau des étudiants</span>
            </span>
          </h2>
          <ul className={cx("grid gap-6 lg:col-span-9", posts.length > 1 && "md:grid-cols-2 md:gap-10")}>
            {posts.map((p) => (
              <li key={p.id}>
                <article className="group relative flex flex-col gap-2">
                  <h3 className="type-title break-words text-[clamp(1.5rem,1.1rem+1.4vw,2.25rem)]">
                    <Link
                      href={routes.post(p.slug)}
                      className="decoration-[3px] underline-offset-[0.12em] after:absolute after:inset-0 group-hover:underline"
                    >
                      {p.title}
                    </Link>
                  </h3>
                  {p.excerpt && <p className="max-w-2xl text-muted">{p.excerpt}</p>}
                  <p className="type-meta text-subtle">
                    <time dateTime={p.publishedAt} title={formatDateLong(p.publishedAt)}>
                      {publishedPhrase(p.publishedAt)}
                    </time>
                  </p>
                </article>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
