import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { getManageContext } from "@/lib/data/manage";
import { getContentDashboard, type ContentDashboard } from "@/lib/posts/editor";
import { DESK_VIEWS, inView, type DeskView } from "@/lib/posts/model";
import { ButtonLink } from "@/components/ui/Button";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { canOpenSection } from "@/components/manage/sections";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { DoneNotice, MfaNotice, ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { ContentTable } from "@/components/manage/content/ContentTable";
import { ContentTasks } from "@/components/manage/content/ContentTasks";
import { DeskFilters } from "@/components/manage/content/DeskFilters";
import { DeskTabs } from "@/components/manage/content/DeskTabs";
import { PageOfflineNotice } from "@/components/manage/content/DeskNotices";
import {
  REVIEW_MODE_LINE,
  contentTasks,
  deskHref,
  filterPosts,
  parseDeskQuery,
  readOnlyReason,
  signatureLine,
  sortPosts,
  type DeskQuery,
} from "@/components/manage/content/desk";

type Params = Promise<{ asso: string }>;
type Search = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata: Metadata = { title: "Contenus" };

/**
 * /manage/[asso]/content — the association's content desk: what waits for
 * someone (hidden by the BDE, failed schedules, versions to review, changes
 * requested), then every post the person may see, by step (?vue=), search
 * (?q=), kind (?type=) and order (?tri=), all in the URL.
 *
 * public.content_dashboard checks the right and chooses the posts: all of
 * them for those who edit, approve or publish; one's own for an author who
 * only writes; none for a post that only sets the rules. Every action behind
 * these links is checked again by the database.
 */
export default async function ContentDeskPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { asso } = await params;
  const sp = await searchParams;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!canOpenSection("content", ctx.membership.permissions)) return <SectionDenied section="content" ctx={ctx} />;
  const dashboard = await getContentDashboard(ctx.organization.id);
  if (!dashboard.ok) return <SectionDenied section="content" ctx={ctx} code={dashboard.code} />;
  if (!dashboard.data) return <SectionDenied section="content" ctx={ctx} code="unexpected" />;

  const { organization, settings, can, posts } = dashboard.data;
  const now = new Date();
  const short = organization.short_name ?? organization.name;
  const readOnly = readOnlyReason(ctx);
  const writable = !readOnly;
  const seesPosts = can.all || can.create;
  const needsMfa = writable && ctx.aal !== "aal2" && (can.publish || can.approve);
  const done = (Array.isArray(sp.fait) ? sp.fait[0] : sp.fait) === "supprime" ? "Brouillon supprimé." : null;

  const query = parseDeskQuery(sp);
  const searching = Boolean(query.q || query.kind);
  const matching = filterPosts(posts, query);
  const counts = Object.fromEntries(
    DESK_VIEWS.map((v) => [v.key, matching.filter((p) => inView(p, v.key)).length]),
  ) as Record<DeskView, number>;
  const shown = sortPosts(
    matching.filter((p) => inView(p, query.view)),
    query.sort,
  );
  const tasks = contentTasks(dashboard.data, ctx.userId);

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={short}
        title="Contenus"
        description={
          <p>
            Les articles, annonces, récaps et brèves de {organization.name}, du brouillon au fil Campus. Un brouillon
            reste privé jusqu&apos;à sa publication.
          </p>
        }
        meta={
          <>
            <Link href={routes.manageContentSettings(asso)} className="underline-offset-2 hover:text-fg hover:underline">
              {REVIEW_MODE_LINE[settings.review_mode]}
            </Link>
            <span>{signatureLine(settings.show_authors)}</span>
            {seesPosts && posts.length > 0 && <span>{plural(posts.length, "contenu")}</span>}
          </>
        }
        actions={
          <>
            {can.create && writable && (
              <ButtonLink href={routes.manageContentNew(asso)} icon="plus" iconPosition="start">
                Nouvel article
              </ButtonLink>
            )}
            {can.settings && (
              <ButtonLink href={routes.manageContentSettings(asso)} variant="secondary" icon="sliders" iconPosition="start">
                Règles de publication
              </ButtonLink>
            )}
          </>
        }
      />

      {(done || readOnly || needsMfa || !organization.page_public) && (
        <div className="flex flex-col gap-3">
          <DoneNotice message={done} />
          {readOnly && <ReadOnlyNotice reason={readOnly} />}
          {needsMfa && <MfaNotice what="Publier, programmer ou approuver un article" />}
          {!organization.page_public && (
            <PageOfflineNotice
              asso={asso}
              status={organization.status}
              canPublishPage={ctx.can("organization.page.publish")}
            />
          )}
        </div>
      )}

      {tasks.length > 0 && (
        <ManageSection title="À traiter" count={tasks.length}>
          <ContentTasks tasks={tasks} asso={asso} can={can} now={now} />
        </ManageSection>
      )}

      {!seesPosts ? (
        <ManageEmpty
          as="h2"
          icon="sliders"
          title="Ton poste règle la publication, pas les articles"
          actions={
            <ButtonLink href={routes.manageContentSettings(asso)} variant="secondary" icon="arrow-right">
              Règles de publication
            </ButtonLink>
          }
        >
          <p>
            Le droit «&nbsp;Régler la publication&nbsp;» ouvre les règles de l&apos;asso (relecture, signature), pas les
            articles eux-mêmes&nbsp;: ils restent visibles des postes qui les écrivent, les modifient, les relisent ou les
            publient.
          </p>
        </ManageEmpty>
      ) : posts.length === 0 ? (
        <FirstPostEmpty asso={asso} short={short} can={can} writable={writable} />
      ) : (
        <section aria-labelledby="desk-list" className="flex flex-col gap-4">
          <h2 id="desk-list" className="sr-only">
            Articles de {short}
          </h2>
          {!can.all && (
            <p className="max-w-2xl type-small text-muted">
              Tu vois ici les articles que tu as commencés. Ceux des autres membres restent visibles des postes qui
              modifient, relisent ou publient les articles.
            </p>
          )}
          <DeskTabs asso={asso} query={query} counts={counts} />
          {(posts.length > 1 || searching || query.sort !== "modifie") && <DeskFilters asso={asso} query={query} />}
          {searching && (
            <p role="status" className="type-meta text-muted">
              {plural(shown.length, "résultat")}
              {query.view !== "tous" && ` dans « ${DESK_VIEWS.find((v) => v.key === query.view)?.label} »`}
            </p>
          )}
          {shown.length > 0 ? (
            <ContentTable
              posts={shown}
              asso={asso}
              accent={organization.accent}
              can={can}
              userId={ctx.userId}
              caption={`Articles de ${organization.name}`}
              now={now}
            />
          ) : (
            <ViewEmpty asso={asso} query={query} searching={searching} />
          )}
        </section>
      )}
    </div>
  );
}

/** Nothing written yet: who writes here, and how to start. */
function FirstPostEmpty({
  asso,
  short,
  can,
  writable,
}: {
  asso: string;
  short: string;
  can: ContentDashboard["can"];
  writable: boolean;
}) {
  if (!can.create) {
    return (
      <ManageEmpty as="h2" icon="file" title="Pas encore d'article">
        <p>
          Les postes qui ont le droit «&nbsp;Écrire des articles&nbsp;» les commencent. Ils apparaissent ici dès le
          premier brouillon{can.approve ? ", et ceux envoyés en relecture t'attendent dans « À relire »" : ""}.
        </p>
      </ManageEmpty>
    );
  }
  return (
    <ManageEmpty
      as="h2"
      icon="file"
      title={can.all ? "Pas encore d'article" : "Tu n'as encore rien écrit"}
      actions={
        writable ? (
          <ButtonLink href={routes.manageContentNew(asso)} icon="plus" iconPosition="start">
            Nouvel article
          </ButtonLink>
        ) : undefined
      }
    >
      <p>
        Les articles, annonces, récaps et brèves de {short} s&apos;écrivent ici, puis paraissent dans le fil Campus et
        sur la page de l&apos;asso. Choisis un type pour commencer&nbsp;: le brouillon reste privé, enregistré au fil de
        l&apos;écriture.
      </p>
      {!can.all && <p>Tu verras ici les articles que tu commences.</p>}
    </ManageEmpty>
  );
}

const VIEW_EMPTY: Record<Exclude<DeskView, "tous">, { title: string; text: string }> = {
  brouillons: {
    title: "Aucun brouillon en cours",
    text: "Un article reste ici tant qu'il n'est ni envoyé en relecture ni publié, et y revient quand une relecture demande des modifications.",
  },
  relecture: {
    title: "Rien n'attend de relecture",
    text: "Les versions envoyées en relecture attendent ici qu'un poste qui a « Approuver les articles » les approuve ou demande des modifications.",
  },
  programmes: {
    title: "Rien n'est programmé",
    text: "Une publication programmée part toute seule à l'heure dite (heure de Paris). Elle s'affiche ici d'ici là, et y reste si elle échoue.",
  },
  "en-ligne": {
    title: "Aucun article en ligne",
    text: "Un article apparaît ici dès sa publication dans le fil Campus et sur la page de l'asso.",
  },
  archives: {
    title: "Aucun article archivé",
    text: "Archiver retire un article du fil sans casser son adresse : il reste lisible, avec un bandeau qui le signale.",
  },
};

/** A tab, or a search, with nothing in it. */
function ViewEmpty({ asso, query, searching }: { asso: string; query: DeskQuery; searching: boolean }) {
  if (searching) {
    return (
      <ManageEmpty
        icon="search"
        title="Aucun article ne correspond"
        actions={
          <ButtonLink href={deskHref(asso, { view: query.view })} variant="secondary" size="sm" icon="close" iconPosition="start">
            Effacer la recherche
          </ButtonLink>
        }
      >
        <p>
          La recherche porte sur le titre, les mots-clés, le type, la rubrique et l&apos;auteur. Essaie un autre mot, un
          autre type ou un autre onglet.
        </p>
      </ManageEmpty>
    );
  }
  const empty = query.view === "tous" ? null : VIEW_EMPTY[query.view];
  return (
    <ManageEmpty icon="file" title={empty?.title ?? "Aucun article"}>
      {empty && <p>{empty.text}</p>}
    </ManageEmpty>
  );
}
