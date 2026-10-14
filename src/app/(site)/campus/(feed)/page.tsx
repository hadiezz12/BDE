import type { Metadata } from "next";
import type { AssociationRef, PostItem as Post, PostKind } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { formatDayFull, plural } from "@/lib/format";
import { getPosts } from "@/lib/data/posts";
import { getAssociations, getAssociationsByIds, toRef } from "@/lib/data/associations";
import { getSession } from "@/lib/demo-session";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { FilterChips, type FilterOption } from "@/components/ui/FilterChips";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { FeedHeader } from "@/components/campus/FeedHeader";
import { PostLead } from "@/components/campus/PostLead";
import { PostItem } from "@/components/campus/PostItem";
import { PostBrief } from "@/components/campus/PostBrief";
import { EditoBand } from "@/components/campus/EditoBand";
import { WeekSection } from "@/components/campus/WeekSection";
import { FilColophon } from "@/components/campus/FilColophon";
import {
  POST_KINDS,
  POST_KIND_NONE,
  POST_KIND_PLURAL,
  groupByWeek,
  parsePostKind,
} from "@/components/campus/labels";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const DESCRIPTION =
  "Récaps de soirées, interviews, annonces et brèves des associations du campus de Paris de GEM Alpine Business School.";

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const kind = parsePostKind((await searchParams).kind);
  return {
    title: kind ? `${POST_KIND_PLURAL[kind]} · Le fil du campus` : "Le fil du campus",
    description: DESCRIPTION,
  };
}

/**
 * /campus — the campus news feed, laid out like a student weekly printed on
 * the night surface: the lead story big, brèves in a side column, three
 * column stories, the édito on paper, then back issues grouped by week.
 * A rubrique filter (?kind=) narrows it to one kind of story.
 */
export default async function CampusFeedPage({ searchParams }: { searchParams: SearchParams }) {
  const kind = parsePostKind((await searchParams).kind);
  const [all, session, bde] = await Promise.all([
    getPosts(),
    getSession(),
    getAssociations({ category: "bde" }).then((list) => list[0] ?? null),
  ]);
  const managed = (await getAssociationsByIds(session.user?.managedAssociationIds ?? [])).map(toRef);
  const posts = kind ? all.filter((p) => p.kind === kind) : all;

  const options: FilterOption[] = [
    { value: null, label: "Tout", count: all.length },
    ...POST_KINDS.map((k) => ({
      value: k,
      label: POST_KIND_PLURAL[k],
      count: all.filter((p) => p.kind === k).length,
    })),
  ];

  return (
    <>
      <FeedHeader>
        <FilterChips label="Filtrer par rubrique" param="kind" options={options} current={kind} basePath={routes.campus} />
      </FeedHeader>

      {posts.length === 0 ? (
        <EmptyFeed kind={kind} />
      ) : kind === "breve" ? (
        <BriefsOnly posts={posts} />
      ) : kind ? (
        <KindFeed kind={kind} posts={posts} />
      ) : (
        <FrontPage posts={posts} contactEmail={bde?.contactEmail} managed={managed} />
      )}
    </>
  );
}

/* ---- Views ---------------------------------------------------------------- */

/** Everything: une + brèves, column stories, the édito on paper, back issues. */
function FrontPage({
  posts,
  contactEmail,
  managed,
}: {
  posts: Post[];
  contactEmail?: string;
  managed: AssociationRef[];
}) {
  const briefs = posts.filter((p) => p.kind === "breve");
  const stories = posts.filter((p) => p.kind !== "breve");
  const [lead, ...rest] = stories;
  const edito = rest.find((p) => p.kind === "edito");
  const others = rest.filter((p) => p !== edito);
  const columns = others.slice(0, 3);
  const archive = others.slice(3);

  return (
    <>
      <div className="wrap grid gap-x-10 gap-y-14 pb-section lg:grid-cols-12">
        {lead && (
          <div className="lg:col-span-8">
            <p className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t-2 border-fg pt-3 type-label text-muted">
              <span className="text-accent-text">À la une</span>
              <span>{todayLabel()}</span>
            </p>
            <PostLead post={lead} />
          </div>
        )}

        <section
          aria-labelledby="en-bref"
          className={cx("flex flex-col gap-8", lead ? "lg:col-span-4 lg:border-l lg:border-line lg:pl-10" : "lg:col-span-6")}
        >
          <div>
            <SectionHeader
              id="en-bref"
              title="En bref"
              kicker={plural(briefs.length, "brève")}
              action={briefs.length > 0 ? { href: `${routes.campus}?kind=breve`, label: "Toutes" } : undefined}
            />
            {briefs.length > 0 ? (
              <ul className="mt-2 divide-y divide-line">
                {briefs.slice(0, 5).map((p) => (
                  <li key={p.id}>
                    <PostBrief post={p} excerpt="always" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-muted">Pas de brève en ce moment : le local est calme.</p>
            )}
          </div>
          <FilColophon contactEmail={contactEmail} managed={managed} className="mx-1" />
        </section>
      </div>

      {columns.length > 0 && (
        <section aria-labelledby="a-lire-aussi" className="wrap pb-section">
          <SectionHeader id="a-lire-aussi" title="À lire aussi" />
          <ul className="mt-8 grid gap-y-10 md:grid-cols-3">
            {columns.map((p, i) => (
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
        </section>
      )}

      {edito && <EditoBand post={edito} />}

      {archive.length > 0 && (
        <section aria-labelledby="plus-tot" className={cx("wrap pb-section", edito && "pt-section")}>
          <SectionHeader id="plus-tot" title="Plus tôt dans le fil" kicker="Les numéros précédents" />
          <WeekList posts={archive} className="mt-8" />
        </section>
      )}
    </>
  );
}

/** One rubrique (récaps, interviews…): the latest one as the lead, the rest by week. */
function KindFeed({ kind, posts }: { kind: PostKind; posts: Post[] }) {
  const [lead, ...rest] = posts;
  return (
    <>
      <div className="wrap pb-section">
        <p className="mb-5 border-t-2 border-fg pt-3 type-label text-accent-text">Dernière parution</p>
        <PostLead post={lead} layout="split" />
      </div>
      {rest.length > 0 && (
        <section aria-labelledby="les-autres" className="wrap pb-section">
          <SectionHeader id="les-autres" title={`Les autres ${POST_KIND_PLURAL[kind].toLowerCase()}`} />
          <WeekList posts={rest} className="mt-8" />
        </section>
      )}
    </>
  );
}

/** Brèves only: short items, no pictures, grouped by week. */
function BriefsOnly({ posts }: { posts: Post[] }) {
  return (
    <div className="wrap pb-section">
      {groupByWeek(posts).map((week) => (
        <WeekSection key={week.start} week={week} as="h2">
          <ul className="divide-y divide-line">
            {week.items.map((p) => (
              <li key={p.id} className="first:[&>article]:pt-0">
                <PostBrief post={p} excerpt="always" as="h3" />
              </li>
            ))}
          </ul>
        </WeekSection>
      ))}
    </div>
  );
}

/** Back issues: stories grouped under their week's number. */
function WeekList({ posts, className }: { posts: Post[]; className?: string }) {
  return (
    <div className={className}>
      {groupByWeek(posts).map((week) => (
        <WeekSection key={week.start} week={week}>
          <ul className="divide-y divide-line">
            {week.items.map((p) => (
              <li key={p.id} className="py-5 first:pt-0 last:pb-0">
                <PostItem post={p} size="sm" withImage as="h4" />
              </li>
            ))}
          </ul>
        </WeekSection>
      ))}
    </div>
  );
}

function EmptyFeed({ kind }: { kind: PostKind | null }) {
  return (
    <section aria-labelledby="fil-vide" className="wrap pb-section">
      <h2 id="fil-vide" className="sr-only">
        {kind ? POST_KIND_PLURAL[kind] : "Articles"}
      </h2>
      {kind ? (
        <EmptyState
          title={`${POST_KIND_NONE[kind]} pour l'instant`}
          actions={
            <ButtonLink href={routes.campus} variant="secondary" icon="arrow-right">
              Tout le fil
            </ButtonLink>
          }
        >
          Les assos n&apos;ont rien publié dans cette rubrique cette année. Le reste du fil, lui, bouge.
        </EmptyState>
      ) : (
        <EmptyState
          title="Le fil est vide pour l'instant"
          actions={
            <ButtonLink href={routes.events} icon="arrow-right">
              Voir l&apos;agenda
            </ButtonLink>
          }
        >
          Aucune asso n&apos;a encore publié. Les premiers récaps tombent en général le lendemain des soirées.
        </EmptyState>
      )}
    </section>
  );
}

/** "Mardi 14 octobre" — the dateline above the lead story. */
function todayLabel(now = new Date()): string {
  return formatDayFull(now.toISOString());
}
