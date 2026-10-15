import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { EventItem, PostItem as Post, UserProfile } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { getPost, getPosts } from "@/lib/data/posts";
import { getEventsByIds } from "@/lib/data/events";
import { getAssociationById } from "@/lib/data/associations";
import { getSession } from "@/lib/demo-session";
import { Icon } from "@/components/ui/Icon";
import { MediaFrame } from "@/components/media/MediaFrame";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { AssociationIdentity } from "@/components/associations/AssociationIdentity";
import { ArticleBody } from "@/components/campus/ArticleBody";
import { Byline } from "@/components/campus/Byline";
import { PostItem } from "@/components/campus/PostItem";
import { PostKicker } from "@/components/campus/PostKicker";
import { RelatedEventTicket, type EventAttendance } from "@/components/campus/RelatedEventTicket";
import { POST_KIND_LABEL } from "@/components/campus/labels";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const post = await getPost((await params).slug);
  if (!post) return { title: "Article introuvable" };
  return {
    title: post.title,
    description: post.excerpt,
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      publishedTime: post.publishedAt,
      authors: [post.authorName],
      images: post.cover ? [{ url: post.cover.src, alt: post.cover.alt }] : undefined,
    },
  };
}

/**
 * /campus/[slug] — one article. The headline and photo stay on the night
 * surface; the text itself is printed on paper (long reading, sticker drop
 * cap), with the related event as a ticket and the association's signature
 * in the margin. Unknown or unpublished slugs are a 404.
 */
export default async function CampusPostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const [association, session, related, sameAssociation, latest] = await Promise.all([
    getAssociationById(post.associationId),
    getSession(),
    post.relatedEventId ? getEventsByIds([post.relatedEventId]) : Promise.resolve([] as EventItem[]),
    getPosts({ associationId: post.associationId }),
    getPosts(),
  ]);

  const event = related.find((e) => e.publication === "publie") ?? null;
  const eventUpcoming = event ? isUpcoming(event) : false;
  const more = sameAssociation.filter((p) => p.id !== post.id).slice(0, 3);
  const elsewhere = latest.filter((p) => p.associationId !== post.associationId).slice(0, 3);
  const short = post.association.shortName ?? post.association.name;
  // Brèves are text-only; every other story gets its photo (or the designed poster).
  const showCover = Boolean(post.cover) || post.kind !== "breve";

  return (
    <>
      <article aria-labelledby="titre-article">
        <header className="wrap pt-6 sm:pt-10">
          <Link
            href={routes.campus}
            className="group inline-flex min-h-10 items-center gap-2 type-label text-muted hover:text-fg"
          >
            <Icon name="arrow-left" size={14} className="transition-transform group-hover:-translate-x-0.5" />
            Le fil du campus
          </Link>
          <div className="mt-6 flex max-w-5xl flex-col gap-5 sm:mt-10">
            <PostKicker post={post} />
            <h1
              id="titre-article"
              className="type-headline break-words hyphens-auto text-[clamp(2.1rem,0.9rem+4.2vw,4.75rem)]"
            >
              {post.title}
            </h1>
            <p className="max-w-3xl type-lead text-muted">{post.excerpt}</p>
            <Byline post={post} className="mt-1 max-w-3xl" />
          </div>
        </header>

        {showCover && (
          <figure className="wrap mt-8 grid gap-3 sm:mt-12 lg:grid-cols-12 lg:items-end lg:gap-8">
            <MediaFrame
              photo={post.cover}
              ratio="3/2"
              slot="post-cover"
              priority
              sizes="(min-width: 1024px) 70vw, 100vw"
              fallback={{ title: post.title, accent: post.association.accent, kicker: POST_KIND_LABEL[post.kind] }}
              className="max-sm:mx-[calc(var(--gutter)*-1)] sm:border-2 sm:border-fg lg:col-span-9"
            />
            {post.cover?.credit && (
              <figcaption className="type-caption lg:col-span-3 lg:pb-1">Photo : {post.cover.credit}</figcaption>
            )}
          </figure>
        )}

        <div data-surface="paper" className="grain mt-10 py-12 sm:mt-14 sm:py-16 lg:py-20">
          <div className="wrap grid gap-14 lg:grid-cols-12 lg:gap-10">
            <div className="min-w-0 lg:col-span-7">
              <ArticleBody paragraphs={post.body} kind={post.kind} accent={post.association.accent} />
              <p data-accent={post.association.accent} className="mt-10 flex items-center gap-3 type-meta text-muted">
                <span aria-hidden className="size-2.5 shrink-0 bg-assoc" />
                {post.authorName} pour {post.association.name}
              </p>
            </div>

            <aside
              aria-label="Autour de l'article"
              className="flex min-w-0 flex-col gap-12 self-start lg:sticky lg:top-[calc(var(--header-h)+2rem)] lg:col-span-4 lg:col-start-9"
            >
              {event && (
                <section aria-labelledby="evenement-lie" className="flex flex-col gap-4">
                  <h2 id="evenement-lie" className="border-t-2 border-fg pt-3 type-label text-muted">
                    {eventUpcoming ? "L'événement" : "L'événement raconté"}
                  </h2>
                  <RelatedEventTicket event={event} attendance={attendanceOf(event, session.user)} />
                  {eventUpcoming && session.role === "visiteur" && (
                    <p className="type-small text-muted">
                      <Link href={routes.login} className="link text-fg">
                        Connecte-toi
                      </Link>{" "}
                      pour retrouver tes billets et tes événements enregistrés.
                    </p>
                  )}
                </section>
              )}

              <section aria-labelledby="publie-par" className="flex flex-col gap-4">
                <h2 id="publie-par" className="border-t-2 border-fg pt-3 type-label text-muted">
                  Publié par
                </h2>
                <AssociationIdentity association={post.association} size="lg" showKind link={false} />
                {association?.tagline && <p className="text-muted">{association.tagline}</p>}
                <Link
                  href={routes.association(post.association.slug)}
                  data-accent={post.association.accent}
                  className="group inline-flex min-h-10 items-center gap-1.5 self-start type-label hover:text-assoc-text"
                >
                  La page de {short}
                  <Icon name="arrow-right" size={14} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </section>
            </aside>
          </div>
        </div>
      </article>

      {(more.length > 0 || elsewhere.length > 0) && (
        <div className="wrap grid gap-14 py-section lg:grid-cols-12 lg:gap-10">
          {more.length > 0 && (
            <section aria-labelledby="meme-asso" className="lg:col-span-6">
              <SectionHeader
                id="meme-asso"
                kicker={post.association.name}
                title="Même asso, autres papiers"
                action={{ href: routes.association(post.association.slug), label: "Page de l'asso" }}
              />
              <StoryList posts={more} />
            </section>
          )}
          {elsewhere.length > 0 && (
            <section aria-labelledby="ailleurs" className={more.length > 0 ? "lg:col-span-6" : "lg:col-span-12"}>
              <SectionHeader
                id="ailleurs"
                kicker="Le fil"
                title="Ailleurs sur le campus"
                action={{ href: routes.campus, label: "Tout le fil" }}
              />
              {more.length > 0 ? <StoryList posts={elsewhere} /> : <StoryColumns posts={elsewhere} />}
            </section>
          )}
        </div>
      )}
    </>
  );
}

/** Compact archive rows, thumbnail on the right. */
function StoryList({ posts }: { posts: Post[] }) {
  return (
    <ul className="mt-6 divide-y divide-line">
      {posts.map((p) => (
        <li key={p.id} className="py-5 first:pt-0 last:pb-0">
          <PostItem post={p} size="sm" withImage />
        </li>
      ))}
    </ul>
  );
}

/** Full-width variant: three ruled columns with photos. */
function StoryColumns({ posts }: { posts: Post[] }) {
  return (
    <ul className="mt-8 grid gap-y-10 md:grid-cols-3">
      {posts.map((p, i) => (
        <li
          key={p.id}
          className={cx(
            "flex md:px-6 md:first:pl-0 md:last:pr-0",
            i > 0 && "border-t border-line pt-8 md:border-l md:border-t-0 md:pt-0",
          )}
        >
          <PostItem post={p} withImage className="w-full" />
        </li>
      ))}
    </ul>
  );
}

/** Not over yet: it has neither ended nor (when it has no end) started. */
function isUpcoming(event: EventItem, now = new Date()): boolean {
  return Date.parse(event.endsAt ?? event.startsAt) >= now.getTime();
}

/** Students see whether they're going; visitors and other events get nothing. */
function attendanceOf(event: EventItem, user: UserProfile | null): EventAttendance {
  if (!user) return null;
  if (user.registeredEventIds.includes(event.id)) return "inscrit";
  if (user.savedEventIds.includes(event.id)) return "favori";
  return null;
}
