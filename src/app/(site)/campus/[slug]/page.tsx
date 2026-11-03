import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import type { PostItem as Post } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { siteUrl } from "@/lib/site-url";
import { getLatestPosts, getPostPage, getRelatedPosts } from "@/lib/data/posts";
import { getAssociationById } from "@/lib/data/associations";
import { getSession } from "@/lib/session";
import { withNext } from "@/lib/auth/next-path";
import { isSaved } from "@/lib/saved/data";
import { SaveButton } from "@/components/saved/SaveButton";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ArticleView } from "@/components/campus/ArticleView";
import { PostItem } from "@/components/campus/PostItem";
import { ReportPost } from "@/components/campus/ReportPost";
import { ShareArticle } from "@/components/campus/ShareArticle";
import { RelatedEventTicket, type EventAttendance } from "@/components/campus/RelatedEventTicket";
import { CampaignCard } from "@/components/recruitment/CampaignCard";
import { getMyEvents } from "@/lib/events/me";
import { personalStates } from "@/lib/events/model";
import { campusRssAlternate } from "@/components/campus/campus-rss";
import { POST_KIND_LABEL } from "@/components/campus/labels";

type Params = Promise<{ slug: string }>;

/** Absolute once the site knows its domain (SITE_URL); relative on a bare localhost. */
function absolute(path: string): string {
  const base = siteUrl();
  return base ? new URL(path, base).toString() : path;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const page = await getPostPage((await params).slug);
  if (page.state === "moved") permanentRedirect(routes.post(page.slug));
  if (page.state === "not_found") return { title: "Article introuvable" };

  const post = page.post;
  const url = absolute(routes.post(post.slug));
  const description = post.excerpt || `${POST_KIND_LABEL[post.kind]} de ${post.association.name}.`;
  return {
    title: post.title,
    description,
    alternates: { canonical: url, types: campusRssAlternate() },
    // Archived: still readable at its address, but no longer offered to search engines.
    robots: post.archived ? { index: false, follow: true } : undefined,
    openGraph: {
      type: "article",
      siteName: "Very Pink Club",
      locale: "fr_FR",
      url,
      title: post.title,
      description,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt ?? post.publishedAt,
      section: post.category?.label,
      tags: post.tags.length > 0 ? post.tags : undefined,
      authors: post.authorName ? [post.authorName] : undefined,
      images: post.cover
        ? [{ url: absolute(post.cover.src), alt: post.cover.alt, width: post.cover.width, height: post.cover.height }]
        : undefined,
    },
    twitter: { card: post.cover ? "summary_large_image" : "summary" },
  };
}

/**
 * /campus/[slug] — one published article (public_post, read as a visitor:
 * never a draft, a hidden post or a post of a page that is not public). A
 * former address redirects for good to the current one; anything else
 * unknown is a plain 404 that says nothing about why. Archived posts stay
 * readable here, with a banner.
 *
 * After the text: save, share, and report for signed-in students. Then two
 * short lists to keep reading: related articles by real links (the same
 * event or recruitment, the same association, the same rubrique) and the
 * latest from the other associations.
 */
export default async function CampusPostPage({ params }: { params: Params }) {
  const { slug } = await params;
  const page = await getPostPage(slug);
  if (page.state === "moved") permanentRedirect(routes.post(page.slug));
  if (page.state !== "ok") notFound();
  const post = page.post;

  // The article never fails because a side list could not load.
  const [association, session, related, latest, saved] = await Promise.all([
    getAssociationById(post.association.id).catch(() => null),
    getSession(),
    getRelatedPosts("post", post.id, 3).catch(() => [] as Post[]),
    getLatestPosts(12).catch(() => [] as Post[]),
    isSaved("post", post.id),
  ]);
  // The student's own relation to the event the article is about (none for a visitor).
  const mine = post.event && session.user ? personalStates(await getMyEvents()).get(post.event.id) : undefined;
  const attendance: EventAttendance = mine?.registered ? "inscrit" : mine?.waitlisted ? "attente" : mine?.saved ? "favori" : null;

  const more = related;
  const shown = new Set([post.id, ...more.map((p) => p.id)]);
  const elsewhere = latest.filter((p) => p.association.id !== post.association.id && !shown.has(p.id)).slice(0, 3);
  const path = routes.post(post.slug);

  return (
    <>
      <ArticleView
        post={post}
        tagline={association?.tagline}
        event={post.event ? <RelatedEventTicket event={post.event} attendance={attendance} /> : undefined}
        campaign={post.campaign ? <CampaignCard campaign={post.campaign} headingLevel={3} className="max-w-md" /> : undefined}
        actions={
          <>
            <SaveButton
              kind="post"
              id={post.id}
              initialSaved={saved}
              signedIn={session.user !== null}
              loginHref={withNext(routes.login, path)}
            />
            <ShareArticle title={post.title} path={path} />
            <ReportPost
              postId={post.id}
              signedIn={session.user !== null}
              loginHref={`${routes.login}?next=${encodeURIComponent(path)}`}
            />
          </>
        }
      />

      {(more.length > 0 || elsewhere.length > 0) && (
        <div className="wrap grid gap-14 py-section lg:grid-cols-12 lg:gap-10">
          {more.length > 0 && (
            <section aria-labelledby="meme-asso" className={elsewhere.length > 0 ? "lg:col-span-6" : "lg:col-span-12"}>
              <SectionHeader
                id="meme-asso"
                kicker="Même sujet, même asso ou même rubrique"
                title="À lire aussi"
                action={{ href: routes.campusFor(post.association.slug), label: `Tous les articles de ${post.association.shortName ?? post.association.name}` }}
              />
              {elsewhere.length > 0 ? <StoryList posts={more} /> : <StoryColumns posts={more} />}
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
          <PostItem post={p} size="sm" withImage={p.kind !== "breve"} />
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
          <PostItem post={p} withImage={p.kind !== "breve"} className="w-full" />
        </li>
      ))}
    </ul>
  );
}
