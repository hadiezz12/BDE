import Link from "next/link";
import type { ReactNode } from "react";
import type { PostArticle } from "@/lib/posts/model";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { AssociationIdentity } from "@/components/associations/AssociationIdentity";
import { MediaFrame } from "@/components/media/MediaFrame";
import { RichText } from "@/components/posts/RichText";
import { Icon } from "@/components/ui/Icon";
import { Byline } from "./Byline";
import { PostKicker } from "./PostKicker";
import { POST_KIND_LABEL } from "./labels";

/**
 * What an article shows: the published post, or one version of it in its
 * private preview. A post never published has no date yet (null), and the
 * preview has no address, prominence or pin to show.
 */
export type ArticleViewPost = Omit<PostArticle, "slug" | "publishedAt" | "prominence" | "pinned"> & {
  publishedAt: string | null;
};

/** The fil searched for one tag (tags are stored as plain slugs). */
function tagHref(tag: string): string {
  return `${routes.campus}?q=${encodeURIComponent(tag)}`;
}

/**
 * One article, shared by its public page and its private preview so the
 * team sees exactly what students will read. The headline, standfirst,
 * byline and photo stay on the night surface; the text itself is printed on
 * paper (RichText: long-reading measure, subheads, quotes ruled in the
 * association's colour, inline figures, the sticker drop cap), signed at the
 * end, with its tags, then the event it is about (a live ticket) and
 * `actions` (share and report, public page only).
 * The association's signature sits in the margin with the way to its page
 * and to everything it published. Brèves are text only: no photo, no poster.
 */
export function ArticleView({
  post,
  tagline,
  event,
  actions,
  className,
}: {
  post: ArticleViewPost;
  /** The association's one line, under "Publié par" (when its page has one). */
  tagline?: string | null;
  /** The event the article is about, as a live ticket (public page only). */
  event?: ReactNode;
  /** Share and report, closing the text. */
  actions?: ReactNode;
  className?: string;
}) {
  const { association } = post;
  const short = association.shortName ?? association.name;
  const brief = post.kind === "breve";
  const hasBody = post.body.content.length > 0;

  return (
    <article aria-labelledby="titre-article" className={className}>
      <header className="wrap pt-6 sm:pt-10">
        <Link
          href={routes.campus}
          className="group inline-flex min-h-10 items-center gap-2 type-label text-muted hover:text-fg"
        >
          <Icon name="arrow-left" size={14} className="transition-transform group-hover:-translate-x-0.5" />
          Le fil du campus
        </Link>
        <div className="mt-6 flex max-w-5xl flex-col gap-5 sm:mt-10">
          {post.archived && (
            <p className="flex items-start gap-2.5 self-start border-2 border-line-strong px-3.5 py-2.5 type-small">
              <Icon name="history" size={16} className="mt-0.5 shrink-0 text-muted" />
              <span>
                <strong className="font-bold">Archivé</strong> — cet article n&apos;est plus dans le fil, il reste
                lisible ici.
              </span>
            </p>
          )}
          <PostKicker post={post} category={post.category} />
          <h1
            id="titre-article"
            className="type-headline break-words hyphens-auto text-[clamp(2.1rem,0.9rem+4.2vw,4.75rem)]"
          >
            {post.title}
          </h1>
          {post.excerpt && <p className="max-w-3xl type-lead text-muted">{post.excerpt}</p>}
          <Byline post={post} className="mt-1 max-w-3xl" />
        </div>
      </header>

      {!brief && (
        <div className="wrap mt-8 grid sm:mt-12 lg:grid-cols-12">
          <MediaFrame
            photo={post.cover}
            ratio="3/2"
            slot="post-cover"
            priority
            sizes="(min-width: 1024px) 70vw, 100vw"
            fallback={{ title: post.title, accent: association.accent, kicker: POST_KIND_LABEL[post.kind] }}
            className="max-sm:mx-[calc(var(--gutter)*-1)] sm:border-2 sm:border-fg lg:col-span-9"
          />
        </div>
      )}

      <div data-surface="paper" className="grain mt-10 py-12 sm:mt-14 sm:py-16 lg:py-20">
        <div className="wrap grid gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="min-w-0 lg:col-span-7">
            {hasBody && (
              <RichText doc={post.body} media={post.media} kind={post.kind} accent={association.accent} />
            )}
            <p
              data-accent={association.accent}
              className={cx("flex items-center gap-3 type-meta text-muted", hasBody && "mt-10")}
            >
              <span aria-hidden className="size-2.5 shrink-0 bg-assoc" />
              {post.authorName ? `${post.authorName} pour ${association.name}` : association.name}
            </p>

            {post.tags.length > 0 && (
              <section aria-labelledby="mots-cles" className="mt-8 flex flex-col gap-3">
                <h2 id="mots-cles" className="type-label text-muted">
                  Mots-clés
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <li key={tag}>
                      <Link
                        href={tagHref(tag)}
                        className="inline-flex min-h-10 items-center rounded-sm border border-line-strong px-3 type-meta transition-colors hover:border-fg hover:bg-fg/5"
                      >
                        <span aria-hidden className="text-subtle">
                          #
                        </span>
                        {tag}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {event && (
              <section aria-labelledby="article-evenement" className="mt-12 flex flex-col gap-4">
                <h2 id="article-evenement" className="type-label text-muted">
                  L&apos;événement
                </h2>
                {event}
              </section>
            )}

            {actions && (
              <div className="mt-10 flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-t-2 border-fg pt-4">
                {actions}
              </div>
            )}
          </div>

          <aside
            aria-label="Autour de l'article"
            className="flex min-w-0 flex-col gap-12 self-start lg:sticky lg:top-[calc(var(--header-h)+2rem)] lg:col-span-4 lg:col-start-9"
          >
            <section aria-labelledby="publie-par" className="flex flex-col gap-4">
              <h2 id="publie-par" className="border-t-2 border-fg pt-3 type-label text-muted">
                Publié par
              </h2>
              <AssociationIdentity association={association} size="lg" showKind link={false} />
              {tagline && <p className="text-muted">{tagline}</p>}
              <ul data-accent={association.accent} className="flex flex-col">
                <li>
                  <AsideLink href={routes.association(association.slug)}>La page de {short}</AsideLink>
                </li>
                <li>
                  <AsideLink href={routes.campusFor(association.slug)}>Tous ses articles</AsideLink>
                </li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </article>
  );
}

function AsideLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="group inline-flex min-h-10 items-center gap-1.5 type-label hover:text-assoc-text">
      {children}
      <Icon name="arrow-right" size={14} className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
