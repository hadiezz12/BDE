import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Photo } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { getAuthContext } from "@/lib/auth/context";
import { getPostPreview, type PostPreview } from "@/lib/posts/editor";
import { organizationRef, type RevisionStatus } from "@/lib/posts/model";
import { mediaUrl, toPhoto } from "@/lib/associations/model";
import { governanceErrorMessage, type GovernanceErrorCode } from "@/lib/governance/messages";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { ArticleView, type ArticleViewPost } from "@/components/campus/ArticleView";

type Props = {
  params: Promise<{ post: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const metadata: Metadata = {
  title: "Aperçu de l'article",
  robots: { index: false, follow: false },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where the version shown stands, after "Aperçu · version n°X ·". */
const REVISION_WORDS: Record<RevisionStatus, string> = {
  draft: "brouillon",
  submitted: "envoyée en relecture",
  changes_requested: "modifications demandées",
  approved: "approuvée",
  superseded: "ancienne version",
};

/**
 * A version in the article's shape: the same layout as the public page, its
 * images (draft ones included) served by the private preview route. Dates
 * are the post's own: null while it has never been published.
 */
function previewArticle(p: PostPreview): ArticleViewPost {
  const media: Record<string, Photo> = {};
  for (const [id, m] of Object.entries(p.media ?? {})) {
    if (m) media[id] = { src: mediaUrl(m.path, true), alt: m.alt ?? "", width: m.width, height: m.height };
  }
  const updated =
    p.first_published_at && p.published_at && Date.parse(p.published_at) - Date.parse(p.first_published_at) > 60_000;
  return {
    id: p.id,
    kind: p.kind,
    title: p.title,
    excerpt: p.intro ?? "",
    cover: toPhoto(p.cover, p.title, null, true),
    publishedAt: p.first_published_at,
    updatedAt: updated ? (p.published_at ?? undefined) : undefined,
    readingMinutes: p.reading_minutes,
    authorName: p.author_name ?? undefined,
    association: organizationRef(p.organization, true),
    category: p.category ?? undefined,
    tags: p.tags,
    archived: false,
    body: p.body,
    media,
  };
}

/**
 * /campus/apercu/[post] — one version of a post exactly as its article page
 * shows it, for its association's content team only: post_preview checks the
 * right (any refusal is the lock below, never data), draft images come from
 * the private preview route, and the page is never indexed. The working
 * version by default; ?version=<revision id> shows one from the history.
 *
 * ?vue=telephone frames the same article at phone width (?cadre=1 is the
 * framed article itself, without this banner). No share, no report: nothing
 * here is public.
 */
export default async function PostPreviewPage({ params, searchParams }: Props) {
  const { post: postId } = await params;
  const sp = await searchParams;
  const rawVersion = Array.isArray(sp.version) ? sp.version[0] : sp.version;
  const versionId = rawVersion && UUID.test(rawVersion) ? rawVersion.toLowerCase() : undefined;
  const validPost = UUID.test(postId);
  const self = routes.postPreview(validPost ? postId.toLowerCase() : postId, versionId);

  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") redirect(`${routes.login}?next=${encodeURIComponent(self)}`);

  if (!validPost) return <Refusal code="post_not_found" />;
  if (rawVersion !== undefined && !versionId) return <Refusal code="revision_not_found" />;

  const preview = await getPostPreview(postId.toLowerCase(), versionId);
  if (!preview.ok) return <Refusal code={preview.code} />;

  const p = preview.data;
  const article = <ArticleView post={previewArticle(p)} />;
  if (sp.cadre === "1") return article;

  const phone = sp.vue === "telephone";
  const join = self.includes("?") ? "&" : "?";
  const where = p.revision.live
    ? "C'est la version en ligne : tout le monde la lit à l'adresse de l'article."
    : p.first_published_at
      ? "Cette version n'est pas en ligne : seule l'équipe de l'asso la voit ici."
      : "Cet article n'a jamais été publié : seule l'équipe de l'asso le voit.";

  return (
    <>
      <section aria-label="Aperçu de l'article" data-surface="paper" className="border-b-2 border-dashed border-fg">
        <div className="wrap flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <p className="type-label">
              Aperçu · version n°{p.revision.number} · {REVISION_WORDS[p.revision.status]}
            </p>
            <p className="type-small text-muted">{where}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <nav aria-label="Taille de l'aperçu" className="flex rounded-sm border border-line-strong p-0.5">
              {[
                { href: self, label: "Ordinateur", active: !phone },
                { href: `${self}${join}vue=telephone`, label: "Téléphone", active: phone },
              ].map((v) => (
                <Link
                  key={v.label}
                  href={v.href}
                  aria-current={v.active ? "page" : undefined}
                  className={cx(
                    "inline-flex min-h-10 items-center px-3 type-small font-semibold",
                    v.active ? "rounded-xs bg-fg text-bg" : "text-muted hover:text-fg",
                  )}
                >
                  {v.label}
                </Link>
              ))}
            </nav>
            <ButtonLink
              href={routes.manageContentPost(p.organization.slug, p.id)}
              variant="secondary"
              size="sm"
              icon="edit"
              iconPosition="start"
            >
              Revenir à l&apos;éditeur
            </ButtonLink>
            {p.revision.live && p.slug && (
              <ButtonLink href={routes.post(p.slug)} variant="ghost" size="sm" icon="arrow-up-right">
                Voir en ligne
              </ButtonLink>
            )}
          </div>
        </div>
      </section>

      {phone ? (
        <div className="wrap flex justify-center py-8">
          <iframe
            src={`${self}${join}cadre=1`}
            title={`Aperçu de « ${p.title || "l'article"} » sur téléphone`}
            className="h-[844px] max-h-[80dvh] w-[390px] max-w-full rounded-[2rem] border-[10px] border-fg bg-bg"
          />
        </div>
      ) : (
        article
      )}
    </>
  );
}

/** Not signed in to the right team, an unknown post or version: one sentence, nothing else. */
function Refusal({ code }: { code: GovernanceErrorCode }) {
  return (
    <div className="wrap py-[var(--section)]">
      <EmptyState
        mark={<Icon name="lock" size={44} />}
        title="Aperçu réservé à l'équipe de l'asso"
        actions={
          <ButtonLink href={routes.campus} variant="secondary" icon="arrow-right">
            Le fil du campus
          </ButtonLink>
        }
      >
        {governanceErrorMessage(code)}
      </EmptyState>
    </div>
  );
}
