import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { getManageContext } from "@/lib/data/manage";
import { getPostEditor } from "@/lib/posts/editor";
import { ButtonLink } from "@/components/ui/Button";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { canOpenSection } from "@/components/manage/sections";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { readOnlyReason } from "@/components/manage/content/desk";
import { PostStageBadge } from "@/components/posts/PostStageBadge";
import { ReviewTimeline, RevisionList } from "@/components/manage/post-editor/History";
import { PostUnavailable } from "@/components/manage/post-editor/PostUnavailable";

type Params = Promise<{ asso: string; post: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { post } = await params;
  if (!UUID.test(post)) return { title: "Article introuvable" };
  const editor = await getPostEditor(post.toLowerCase());
  if (!editor.ok || !editor.data) return { title: "Historique" };
  return { title: `Historique · ${editor.data.working.title.trim() || "Article sans titre"}` };
}

/**
 * /manage/[asso]/content/[post]/historique — every version of a post and
 * every review decision, from public.post_editor (same rights as the
 * editor). Versions open in the private preview; "Reprendre cette version"
 * (public.restore_post_revision, posts.edit or the author) starts a new
 * draft from an old one, without changing anything online.
 */
export default async function PostHistoryPage({ params }: { params: Params }) {
  const { asso, post } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!canOpenSection("content", ctx.membership.permissions)) return <SectionDenied section="content" ctx={ctx} />;
  if (!UUID.test(post)) return <PostUnavailable ctx={ctx} code="post_not_found" />;

  const editor = await getPostEditor(post.toLowerCase());
  if (!editor.ok) return <PostUnavailable ctx={ctx} code={editor.code} />;
  if (!editor.data) return <PostUnavailable ctx={ctx} code="unexpected" />;
  const data = editor.data;
  if (data.organization.slug !== asso) redirect(routes.manageContentHistory(data.organization.slug, data.post.id));

  const { working, history, reviews } = data;
  const readOnly = readOnlyReason(ctx);
  const live = data.post.publication !== "unpublished" ? data.post.published : null;
  const title = working.title.trim() || "Article sans titre";

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={ctx.organization.shortName ?? ctx.organization.name}
        title="Historique"
        description={
          <p>
            Les versions de «&nbsp;{title}&nbsp;», de la plus récente à la première. Une version envoyée en relecture,
            approuvée ou publiée ne change plus jamais&nbsp;: chaque correction en crée une nouvelle.
          </p>
        }
        meta={
          <>
            <span>{plural(history.length, "version")}</span>
            {live && <span>En ligne&nbsp;: version n°{live.number}</span>}
            <span>Version de travail&nbsp;: n°{working.number}</span>
          </>
        }
        actions={
          <ButtonLink
            href={routes.manageContentPost(asso, data.post.id)}
            variant="secondary"
            icon="arrow-left"
            iconPosition="start"
          >
            Retour à l&apos;éditeur
          </ButtonLink>
        }
      />

      <div className="flex flex-col gap-3">
        <PostStageBadge post={data.post} />
        {readOnly && <ReadOnlyNotice reason={readOnly} />}
      </div>

      <div className="grid gap-x-10 gap-y-12 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        <ManageSection
          title="Versions"
          count={history.length}
          description={
            data.can.edit && !readOnly
              ? "Reprendre une ancienne version en fait un nouveau brouillon : l'article en ligne ne change pas, et le texte repasse par la relecture et la publication."
              : undefined
          }
        >
          <RevisionList data={data} canRestore={data.can.edit && !readOnly} />
        </ManageSection>

        <ManageSection title="Relectures" count={reviews.length || undefined}>
          <ReviewTimeline reviews={reviews} />
        </ManageSection>
      </div>
    </div>
  );
}
