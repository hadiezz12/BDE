import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Photo } from "@/lib/types";
import { routes } from "@/lib/routes";
import { formatDateLong, plural } from "@/lib/format";
import { getAuthContext } from "@/lib/auth/context";
import { getMyAccess, hasPlatform } from "@/lib/governance/access";
import { mediaUrl } from "@/lib/associations/model";
import { getPostPage } from "@/lib/data/posts";
import { getModeratedPost, getModerationQueue, type ModeratedPost } from "@/lib/posts/editor";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { RichText } from "@/components/posts/RichText";
import { POST_KIND_LABEL } from "@/components/campus/labels";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { MfaNotice, Notice } from "@/components/manage/governance/Notices";
import { HidePostForm, RestorePostForm } from "@/components/manage/moderation/ModerationForms";
import { OpenReportsList, ReasonBreakdown, visibilityOf } from "@/components/manage/moderation/ModerationLists";
import { PlatformDenied } from "@/components/manage/moderation/PlatformDenied";
import { moderationViewHref } from "@/components/manage/moderation/labels";

type Params = Promise<{ post: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const metadata: Metadata = {
  title: "Article signalé",
  robots: { index: false, follow: false },
};

/**
 * /manage/plateforme/moderation/[post] — the published content of a
 * reported or hidden post, for the BDE's moderators
 * (platform.content.moderate): public.moderated_post returns the live
 * revision only (or the last one that was live), never a draft or an older
 * version. With its state, its open reports, and the same decisions as the
 * moderation desk.
 *
 * Images: they are served by the public media route, which only answers
 * while the post is visible. Whether it is (public_post, read as a visitor)
 * decides: a hidden or offline post is shown without its images, and the
 * page says so instead of showing broken ones.
 */
export default async function ModeratedPostPage({ params }: { params: Params }) {
  const { post: postId } = await params;
  if (!UUID.test(postId)) notFound();
  const [access, ctx] = await Promise.all([getMyAccess(), getAuthContext()]);
  if (!hasPlatform(access, "platform.content.moderate")) {
    return <PlatformDenied title="Modération" right="Modérer les contenus publics" />;
  }
  const [result, queue] = await Promise.all([getModeratedPost(postId), getModerationQueue()]);
  if (!result.ok) {
    if (result.code === "insufficient_permission") return <PlatformDenied title="Modération" right="Modérer les contenus publics" />;
    return (
      <div className="flex flex-col gap-8">
        <BackLink />
        <ManageEmpty
          as="h2"
          icon="file"
          title={result.code === "post_not_found" ? "Cet article n'a jamais été publié" : "L'article n'a pas pu être chargé"}
        >
          <p>
            {result.code === "post_not_found"
              ? "La modération ne montre que ce qui a été en ligne. Un brouillon reste à son asso."
              : "Réessaie dans un instant."}
          </p>
        </ManageEmpty>
      </div>
    );
  }

  const post = result.data;
  // Visible to visitors right now (published or archived, not hidden, page online)? When in
  // doubt (read failed), it is treated as offline: the text still shows, the images do not.
  const live =
    !post.hidden &&
    post.publication !== "unpublished" &&
    (await getPostPage(post.slug).then((page) => page.state === "ok", () => false));
  const state = visibilityOf({ hidden: post.hidden, public: live, archived: post.publication === "archived" });
  const reports = queue.ok ? queue.data.open.find((item) => item.post.id === post.id) : undefined;
  const aal2 = ctx.status === "authenticated" && ctx.aal === "aal2";
  const updated = Date.parse(post.published_at) - Date.parse(post.first_published_at) > 60_000;
  const mediaCount = Object.values(post.media ?? {}).filter(Boolean).length + (post.cover ? 1 : 0);

  return (
    <div className="flex flex-col gap-10">
      <BackLink />
      <ManagePageHeader
        kicker={`Modération · ${post.organization.name}`}
        title={<span className="break-words">{post.title}</span>}
        meta={
          <>
            <span>{POST_KIND_LABEL[post.kind]}</span>
            {post.category && <span>{post.category.label}</span>}
            <span>Publié le {formatDateLong(post.first_published_at)}</span>
            {updated && <span>Mis à jour le {formatDateLong(post.published_at)}</span>}
          </>
        }
        actions={
          live ? (
            <ButtonLink href={routes.post(post.slug)} variant="secondary" icon="arrow-up-right">
              Voir en ligne
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4">
        <p className="flex flex-wrap items-center gap-3">
          <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
        </p>
        <StateNotice post={post} live={live} />
        {!aal2 && <MfaNotice what="Masquer ou rétablir un article" />}
        {post.hidden ? <RestorePostForm postId={post.id} /> : <HidePostForm postId={post.id} live={live} />}
      </div>

      {reports && (
        <ManageSection title="Signalements ouverts" count={reports.count}>
          <ReasonBreakdown reasons={reports.reasons} />
          <OpenReportsList reports={reports.reports} className="rounded-md border border-line bg-raised" />
        </ManageSection>
      )}

      <ManageSection
        title="Ce qui a été publié"
        description="La version en ligne, ou la dernière qui l'a été, telle que les étudiant·es la lisent. Les brouillons de l'asso n'apparaissent jamais ici."
      >
        {!live && mediaCount > 0 && (
          <Notice tone="info" icon="image" title={`${plural(mediaCount, "image")} non affichée${mediaCount > 1 ? "s" : ""}`}>
            <p>
              Tant que l&apos;article n&apos;est pas en ligne, ses images ne sont plus publiques&nbsp;: elles ne s&apos;affichent
              pas ici. Le texte, lui, est complet.
            </p>
          </Notice>
        )}
        <PublishedArticle post={post} live={live} />
      </ManageSection>
    </div>
  );
}

function BackLink() {
  return (
    <p>
      <Link
        href={moderationViewHref("ouverts")}
        className="inline-flex min-h-9 items-center gap-1.5 type-small font-semibold text-muted hover:text-fg"
      >
        <Icon name="arrow-left" size={16} />
        Modération
      </Link>
    </p>
  );
}

/** Why the post is, or is not, on the site — the hide reason first. */
function StateNotice({ post, live }: { post: ModeratedPost; live: boolean }) {
  if (post.hidden) {
    return (
      <Notice tone="danger" icon="eye" title="Masqué par le BDE">
        <p className="break-words">Raison donnée&nbsp;: {post.hidden_reason}</p>
        <p>L&apos;asso voit cette raison dans son espace. Rien de ce qu&apos;elle fait ne le remet en ligne.</p>
      </Notice>
    );
  }
  if (post.publication === "unpublished") {
    return (
      <Notice tone="info" icon="info" title="L'asso a retiré cet article du site">
        <p>Il revient si elle le republie. Le masquer l&apos;en empêche.</p>
      </Notice>
    );
  }
  if (!live) {
    return (
      <Notice tone="info" icon="info" title="La page de l'asso n'est pas en ligne">
        <p>Ses articles ne le sont pas non plus. Ils reviennent avec la page, sauf s&apos;ils sont masqués.</p>
      </Notice>
    );
  }
  if (post.publication === "archived") {
    return (
      <Notice tone="info" icon="info" title="Archivé par l'asso">
        <p>Hors du fil et de la page de l&apos;asso, mais toujours lisible à son adresse, avec un bandeau.</p>
      </Notice>
    );
  }
  return null;
}

/** The article as printed on the site: standfirst, cover, body (RichText only). */
function PublishedArticle({ post, live }: { post: ModeratedPost; live: boolean }) {
  const media: Record<string, Photo> = {};
  if (live) {
    for (const [id, m] of Object.entries(post.media ?? {})) {
      if (m) media[id] = { src: mediaUrl(m.path), alt: m.alt ?? "", width: m.width, height: m.height };
    }
  }
  return (
    <article
      data-surface="paper"
      data-accent={post.organization.accent}
      aria-label={`Article publié : ${post.title}`}
      className="flex flex-col gap-6 rounded-md border border-line px-5 py-7 sm:px-10 sm:py-10"
    >
      <p className="type-label text-assoc-text">
        {POST_KIND_LABEL[post.kind]}
        {post.category && ` · ${post.category.label}`}
      </p>
      {post.intro && <p className="max-w-[40rem] break-words type-lead">{post.intro}</p>}
      {live && post.cover && (
        <Image
          src={mediaUrl(post.cover.path)}
          alt={post.cover.alt ?? ""}
          width={post.cover.width}
          height={post.cover.height}
          sizes="(min-width: 1024px) 40rem, 100vw"
          className="h-auto w-full max-w-[40rem] border-2 border-fg"
        />
      )}
      <RichText doc={post.body} media={media} kind={post.kind} accent={post.organization.accent} className="break-words" />
      {post.tags.length > 0 && (
        <p className="type-meta text-subtle">Mots-clés&nbsp;: {post.tags.join(", ")}</p>
      )}
      {post.author_name && <p className="type-small text-muted">Par {post.author_name}</p>}
    </article>
  );
}
