import type { ManageContext } from "@/lib/data/manage";
import type { GovernanceErrorCode } from "@/lib/governance/messages";
import { routes } from "@/lib/routes";
import { ButtonLink } from "@/components/ui/Button";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";

/**
 * The post cannot be opened: it no longer exists (a draft can be deleted),
 * the link is wrong, or it is someone else's draft for an author who only
 * sees their own. Says which, without telling anything about the post.
 */
export function PostUnavailable({ ctx, code }: { ctx: ManageContext; code: GovernanceErrorCode }) {
  if (code !== "post_not_found" && code !== "insufficient_permission") {
    return <SectionDenied section="content" ctx={ctx} code={code} />;
  }
  const missing = code === "post_not_found";
  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader kicker={ctx.organization.shortName ?? ctx.organization.name} title="Article" />
      <ManageEmpty
        as="h2"
        icon={missing ? "search" : "lock"}
        title={missing ? "Cet article n'existe plus" : "Cet article ne t'est pas ouvert"}
        actions={
          <ButtonLink
            href={routes.manageContent(ctx.organization.slug)}
            variant="secondary"
            icon="arrow-left"
            iconPosition="start"
          >
            Contenus
          </ButtonLink>
        }
      >
        <p>
          {missing
            ? "Le lien est peut-être incomplet, ou l'article a été supprimé : un brouillon qui n'a jamais été en ligne peut l'être, avec toutes ses versions."
            : "Avec tes droits actuels, tu ouvres les articles que tu as commencés. Ceux des autres membres s'ouvrent aux postes qui les modifient, les relisent ou les publient."}
        </p>
      </ManageEmpty>
    </div>
  );
}
