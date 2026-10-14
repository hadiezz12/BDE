import Link from "next/link";
import type { PostItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";
import { Byline } from "./Byline";

/**
 * The édito, printed on paper in the middle of the night feed: a change of
 * material for a change of voice (an opinion, not a recap). The whole story
 * is one link (stretched title); "Lire l'édito" is only a visual cue.
 */
export function EditoBand({ post, className }: { post: PostItem; className?: string }) {
  return (
    <section data-surface="paper" aria-labelledby="edito-titre" className={cx("grain py-section", className)}>
      <div className="wrap">
        <div className="grid gap-6 border-t-2 border-fg pt-4 lg:grid-cols-12 lg:gap-10">
          <h2 id="edito-titre" className="type-poster lg:col-span-4">
            L&apos;édito
          </h2>
          <article className="group relative flex flex-col gap-5 lg:col-span-8">
            <h3 className="type-title break-words hyphens-auto">
              <Link
                href={routes.post(post.slug)}
                className="decoration-[3px] underline-offset-[0.12em] after:absolute after:inset-0 group-hover:underline"
              >
                {post.title}
              </Link>
            </h3>
            <p className="max-w-3xl type-lead text-muted">{post.excerpt}</p>
            <Byline post={post} linkAssociation={false} className="max-w-3xl" />
            <span aria-hidden className="inline-flex items-center gap-2 type-button">
              Lire l&apos;édito
              <Icon name="arrow-right" size={18} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </article>
        </div>
      </div>
    </section>
  );
}
