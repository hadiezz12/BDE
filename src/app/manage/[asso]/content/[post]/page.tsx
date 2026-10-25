import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { getManageContext } from "@/lib/data/manage";
import { getPostEditor } from "@/lib/posts/editor";
import { instantToParisLocal } from "@/lib/posts/schedule";
import { canOpenSection } from "@/components/manage/sections";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { readOnlyReason } from "@/components/manage/content/desk";
import { PostEditor } from "@/components/manage/post-editor/PostEditor";
import { PostUnavailable } from "@/components/manage/post-editor/PostUnavailable";
import { PostEventLink } from "@/components/manage/post-editor/PostEventLink";
import { getPostEventOptions } from "@/lib/events/editor";
import { PostCampaignLink } from "@/components/manage/post-editor/PostCampaignLink";
import { getPostCampaignOptions } from "@/lib/recruitment/editor";

type Params = Promise<{ asso: string; post: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { post } = await params;
  if (!UUID.test(post)) return { title: "Article introuvable" };
  const editor = await getPostEditor(post.toLowerCase());
  if (!editor.ok || !editor.data) return { title: "Article" };
  return { title: editor.data.working.title.trim() || "Article sans titre" };
}

/**
 * /manage/[asso]/content/[post] — one post in the editor. public.post_editor
 * decides who may read it (its author with posts.create, or posts.edit,
 * posts.approve, posts.publish in its own association) and what they may do;
 * a post of another association never opens here, even for someone who may
 * read it there: it opens in its own association's workspace. Everything
 * else (writing, autosave, review, publication) is the client editor's, and
 * every write goes through a database function that checks it again.
 */
export default async function PostEditorPage({ params }: { params: Params }) {
  const { asso, post } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!canOpenSection("content", ctx.membership.permissions)) return <SectionDenied section="content" ctx={ctx} />;
  if (!UUID.test(post)) return <PostUnavailable ctx={ctx} code="post_not_found" />;

  const editor = await getPostEditor(post.toLowerCase());
  if (!editor.ok) return <PostUnavailable ctx={ctx} code={editor.code} />;
  if (!editor.data) return <PostUnavailable ctx={ctx} code="unexpected" />;
  const data = editor.data;
  if (data.organization.slug !== asso) redirect(routes.manageContentPost(data.organization.slug, data.post.id));
  // The event and the recruitment the article is about (Phases 7 and 8). The editor still opens if they cannot be read.
  const [eventOptions, campaignOptions] = await Promise.all([getPostEventOptions(data.post.id), getPostCampaignOptions(data.post.id)]);

  return (
    <PostEditor
      asso={asso}
      data={data}
      mfa={ctx.aal === "aal2"}
      readOnly={readOnlyReason(ctx)}
      canPublishPage={ctx.can("organization.page.publish")}
      today={instantToParisLocal(new Date().toISOString()).date}
      eventLink={eventOptions.ok ? <PostEventLink postId={data.post.id} data={eventOptions.data} /> : null}
      campaignLink={campaignOptions.ok ? <PostCampaignLink postId={data.post.id} data={campaignOptions.data} /> : null}
    />
  );
}
