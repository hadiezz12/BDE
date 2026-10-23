import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { getAuthContext } from "@/lib/auth/context";
import { getMyAccess, hasPlatform } from "@/lib/governance/access";
import { getModerationQueue } from "@/lib/posts/editor";
import { FilterChips } from "@/components/ui/FilterChips";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { MfaNotice, Notice } from "@/components/manage/governance/Notices";
import { PlatformDenied } from "@/components/manage/moderation/PlatformDenied";
import { HiddenPostCard, ModerationHistory, OpenReportCard, ResolvedList } from "@/components/manage/moderation/ModerationLists";
import { MODERATION_VIEWS, parseModerationView } from "@/components/manage/moderation/labels";

type Search = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata: Metadata = { title: "Modération" };

/**
 * /manage/plateforme/moderation — the BDE's moderation desk
 * (platform.content.moderate): posts with open reports, hidden posts, the
 * latest closed reports and the moderation history, one view at a time
 * (?vue=). Everything comes from public.moderation_queue, which checks the
 * right and only ever returns published content, never who reported.
 * Hiding and restoring need a reason and the second factor; dismissing a
 * report needs neither. Moderation is independent of the association's own
 * editorial approval and overrides it: nothing the association does brings
 * a hidden post back.
 */
export default async function PlatformModerationPage({ searchParams }: { searchParams: Search }) {
  const view = parseModerationView((await searchParams).vue);
  const [access, ctx] = await Promise.all([getMyAccess(), getAuthContext()]);
  if (!hasPlatform(access, "platform.content.moderate")) {
    return <PlatformDenied title="Modération" right="Modérer les contenus publics" />;
  }
  const queue = await getModerationQueue();
  if (!queue.ok) {
    if (queue.code === "insufficient_permission") {
      return <PlatformDenied title="Modération" right="Modérer les contenus publics" />;
    }
    return (
      <Notice tone="danger" icon="alert" title="La modération n'a pas pu être chargée.">
        <p>Réessaie dans un instant.</p>
      </Notice>
    );
  }
  const q = queue.data;
  const aal2 = ctx.status === "authenticated" && ctx.aal === "aal2";
  const openReports = q.open.reduce((n, item) => n + item.count, 0);
  const counts: Record<string, number | undefined> = {
    ouverts: q.open.length,
    masques: q.hidden.length,
    traites: q.resolved.length,
  };

  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader
        kicker="Centre de contrôle BDE"
        title="Modération"
        description={
          <p>
            Masquer un article le retire du site tout de suite. L&apos;asso voit la raison dans son espace et ne peut pas le
            remettre en ligne&nbsp;: seul le BDE peut le rétablir. Les personnes qui signalent restent anonymes, ici comme
            pour l&apos;asso. Tu ne vois que ce qui a été publié, jamais un brouillon.
          </p>
        }
        meta={
          openReports > 0 ? (
            <span>
              {plural(openReports, "signalement ouvert", "signalements ouverts")} sur {plural(q.open.length, "article")}
            </span>
          ) : undefined
        }
      />
      {!aal2 && <MfaNotice what="Masquer ou rétablir un article" />}

      <FilterChips
        label="Vues de la modération"
        param="vue"
        basePath={routes.managePlatformModeration}
        current={view === "ouverts" ? null : view}
        options={MODERATION_VIEWS.map((v) => ({
          value: v.key,
          label: v.label,
          count: counts[v.key ?? "ouverts"],
        }))}
      />

      {view === "ouverts" && (
        <ManageSection
          title="Signalements ouverts"
          count={q.open.length}
          description="Les articles signalés par des étudiant·es, le plus récemment signalé en premier. Lis l'article, puis classe chaque signalement sans suite ou masque l'article."
        >
          {q.open.length ? (
            <ul className="flex flex-col gap-4">
              {q.open.map((item) => (
                <li key={item.post.id}>
                  <OpenReportCard item={item} />
                </li>
              ))}
            </ul>
          ) : (
            <ManageEmpty icon="flag" title="Aucun signalement en attente">
              <p>
                Quand un·e étudiant·e signale un article publié, il arrive ici avec la raison choisie et ses précisions. Tu
                décides alors&nbsp;: classer sans suite ou masquer l&apos;article.
              </p>
            </ManageEmpty>
          )}
        </ManageSection>
      )}

      {view === "masques" && (
        <ManageSection
          title="Articles masqués"
          count={q.hidden.length}
          description="Retirés du site par le BDE. L'asso les voit dans son espace avec la raison, sans pouvoir les republier. Rétablir les remet tels qu'elle les a laissés."
        >
          {q.hidden.length ? (
            <ul className="flex flex-col gap-4">
              {q.hidden.map((post) => (
                <li key={post.id}>
                  <HiddenPostCard post={post} />
                </li>
              ))}
            </ul>
          ) : (
            <ManageEmpty icon="eye" title="Aucun article masqué">
              <p>Un article masqué par le BDE apparaît ici, avec la raison donnée, jusqu&apos;à ce qu&apos;il soit rétabli.</p>
            </ManageEmpty>
          )}
        </ManageSection>
      )}

      {view === "traites" && (
        <ManageSection title="Signalements traités" count={q.resolved.length} description="Les 30 derniers signalements fermés, classés sans suite ou suivis d'un masquage.">
          {q.resolved.length ? (
            <ResolvedList items={q.resolved} />
          ) : (
            <ManageEmpty icon="check" title="Aucun signalement traité pour l'instant">
              <p>Chaque signalement classé ou suivi d&apos;un masquage apparaîtra ici, avec la décision, sa date et qui l&apos;a prise.</p>
            </ManageEmpty>
          )}
        </ManageSection>
      )}

      {view === "historique" && (
        <ManageSection
          title="Historique de la modération"
          description="Les 50 dernières actions. Une ligne ne peut être ni modifiée ni effacée depuis le site."
        >
          {q.history.length ? (
            <ModerationHistory events={q.history} />
          ) : (
            <ManageEmpty icon="history" title="Rien dans l'historique pour l'instant">
              <p>Chaque signalement reçu, classement, masquage et rétablissement y laissera une ligne.</p>
            </ManageEmpty>
          )}
        </ManageSection>
      )}
    </div>
  );
}
