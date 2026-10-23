import type { Metadata } from "next";
import Link from "next/link";
import type { AssociationRef, PostItem as Post, PostKind } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { formatDayFull, plural } from "@/lib/format";
import { getFeaturedPosts, getFeed, getPostFacets } from "@/lib/data/posts";
import { getAssociationsByIds, getBde, toRef } from "@/lib/data/associations";
import { encodeFeedCursor, feedQuery, feedSlug, parseFeedCursor, type PostFacets } from "@/lib/posts/model";
import { getSession } from "@/lib/session";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { FeedHeader } from "@/components/campus/FeedHeader";
import { FeedFilters, type FeedFilterValues } from "@/components/campus/FeedFilters";
import { ImportantBand } from "@/components/campus/ImportantBand";
import { PostLead } from "@/components/campus/PostLead";
import { PostItem } from "@/components/campus/PostItem";
import { PostBrief } from "@/components/campus/PostBrief";
import { WeekSection } from "@/components/campus/WeekSection";
import { FilColophon } from "@/components/campus/FilColophon";
import { campusRssAlternate } from "@/components/campus/campus-rss";
import { POST_KIND_NONE, POST_KIND_PLURAL, groupByWeek, parsePostKind } from "@/components/campus/labels";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const PAGE_SIZE = 24;

const DESCRIPTION =
  "Les articles, annonces, récaps et brèves du Very Pink Club et des associations de GEM Alpine Business School — Paris.";

function readFilters(sp: Record<string, string | string[] | undefined>): FeedFilterValues {
  return {
    kind: parsePostKind(sp.kind),
    category: feedSlug(sp.rubrique),
    association: feedSlug(sp.asso),
    q: feedQuery(sp.q),
  };
}

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const sp = await searchParams;
  const f = readFilters(sp);
  const filtered = Boolean(f.category || f.association || f.q || parseFeedCursor(sp.suite));
  return {
    title: f.kind ? `${POST_KIND_PLURAL[f.kind]} · Le fil du campus` : "Le fil du campus",
    description: DESCRIPTION,
    alternates: { types: campusRssAlternate() },
    // Filtered and paged views are for sharing, not for search engines (the sitemap lists every article).
    robots: filtered ? { index: false, follow: true } : undefined,
  };
}

/**
 * /campus — the campus fil, from the published posts of every public
 * association page and of the BDE (public_posts, read as a visitor).
 *
 * Unfiltered first page, laid out like a student weekly: the BDE's
 * important notices on paper, the lead story (a story the BDE put "à la
 * une", otherwise the latest), brèves in a side column, three column
 * stories, then the rest grouped by week. Any filter, a search or the
 * "older" link switches to a plain list by week. Order is always the first
 * publication, newest first, with keyset pages (?suite=) that never repeat
 * or skip a story when new ones come out meanwhile. No ranking, no metrics.
 */
export default async function CampusFeedPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const filters = readFilters(sp);
  const cursor = parseFeedCursor(sp.suite);
  const front = !filters.kind && !filters.category && !filters.association && !filters.q && !cursor;

  const [page, facets, highlights, session, bde] = await Promise.all([
    getFeed({ ...filters, before: cursor, limit: PAGE_SIZE }),
    getPostFacets(),
    front ? getFeaturedPosts() : Promise.resolve({ featured: [], important: [] }),
    getSession(),
    getBde(),
  ]);
  const managed = (await getAssociationsByIds(session.user?.managedAssociationIds ?? [])).map(toRef);
  const olderHref = page.next ? hrefWith(sp, { suite: encodeFeedCursor(page.next) }) : null;

  return (
    <>
      <FeedHeader>{facets.total > 0 && <FeedFilters values={filters} facets={facets} />}</FeedHeader>

      {facets.total === 0 ? (
        <FirstIssue managed={managed} />
      ) : front ? (
        <FrontPage
          posts={page.items}
          featured={highlights.featured}
          important={highlights.important}
          contactEmail={bde?.contactEmail}
          managed={managed}
          olderHref={olderHref}
        />
      ) : page.items.length === 0 ? (
        <EmptyFeed filters={filters} paged={Boolean(cursor)} />
      ) : (
        <FilteredFeed filters={filters} facets={facets} posts={page.items} paged={Boolean(cursor)} olderHref={olderHref} />
      )}
    </>
  );
}

/** The current URL with some params replaced (null removes one). */
function hrefWith(sp: Record<string, string | string[] | undefined>, set: Record<string, string | null>): string {
  const out = new URLSearchParams();
  for (const key of ["kind", "rubrique", "asso", "q"]) {
    const v = sp[key];
    const value = Array.isArray(v) ? v[0] : v;
    if (value) out.set(key, value);
  }
  for (const [k, v] of Object.entries(set)) {
    if (v === null) out.delete(k);
    else out.set(k, v);
  }
  const qs = out.toString();
  return qs ? `${routes.campus}?${qs}` : routes.campus;
}

/* ---- Views ---------------------------------------------------------------- */

/** The unfiltered first page: important notices, une + brèves, column stories, the rest by week. */
function FrontPage({
  posts,
  featured,
  important,
  contactEmail,
  managed,
  olderHref,
}: {
  posts: Post[];
  featured: Post[];
  important: Post[];
  contactEmail?: string;
  managed: AssociationRef[];
  olderHref: string | null;
}) {
  // Each story appears once: the notices first, then the une, then the rest.
  const shown = new Set(important.map((p) => p.id));
  const leadCandidates = [...featured, ...posts].filter((p) => p.kind !== "breve" && !shown.has(p.id));
  const lead = leadCandidates[0] ?? null;
  if (lead) shown.add(lead.id);
  const briefs = posts.filter((p) => p.kind === "breve" && !shown.has(p.id)).slice(0, 5);
  briefs.forEach((p) => shown.add(p.id));
  // The other featured stories first, then the latest ones.
  const columns: Post[] = [];
  for (const p of [...featured, ...posts]) {
    if (columns.length === 3) break;
    if (p.kind === "breve" || shown.has(p.id)) continue;
    shown.add(p.id);
    columns.push(p);
  }
  const archive = posts.filter((p) => !shown.has(p.id));

  return (
    <>
      <ImportantBand posts={important} className="mb-section" />

      <div className="wrap grid gap-x-10 gap-y-14 pb-section lg:grid-cols-12">
        {lead && (
          <div className="lg:col-span-8">
            <p className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t-2 border-fg pt-3 type-label text-muted">
              <span className="text-accent-text">{lead.prominence === "featured" ? "À la une" : "Dernière parution"}</span>
              <span>{formatDayFull(new Date().toISOString())}</span>
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
                {briefs.map((p) => (
                  <li key={p.id}>
                    <PostBrief post={p} excerpt="always" />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-4 text-muted">Pas de brève en ce moment.</p>
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

      {archive.length > 0 && (
        <section aria-labelledby="plus-tot" className="wrap pb-section">
          <SectionHeader id="plus-tot" title="Plus tôt dans le fil" kicker="Les semaines précédentes" />
          <WeekList posts={archive} className="mt-8" />
        </section>
      )}

      {olderHref && <OlderLink href={olderHref} className="pb-section" />}
    </>
  );
}

/** Filtered, searched or paged: what matches, by week, newest first. */
function FilteredFeed({
  filters,
  facets,
  posts,
  paged,
  olderHref,
}: {
  filters: FeedFilterValues;
  facets: PostFacets;
  posts: Post[];
  paged: boolean;
  olderHref: string | null;
}) {
  const association = facets.organizations.find((o) => o.slug === filters.association);
  const category = facets.categories.find((c) => c.slug === filters.category);
  // The title names the main filter (search, then association, rubrique, type); the kicker the others.
  const labels = [
    filters.q ? `« ${filters.q} »` : null,
    association ? (association.short_name ?? association.name) : null,
    category?.label ?? null,
    filters.kind ? POST_KIND_PLURAL[filters.kind] : null,
  ].filter((l): l is string => Boolean(l));
  const [title = "Le fil", ...others] = labels;
  const kicker = [paged ? "Plus tôt dans le fil" : null, ...others].filter(Boolean).join(" · ");

  return (
    <section aria-labelledby="resultats-fil" className="wrap pb-section">
      <SectionHeader
        id="resultats-fil"
        title={title}
        kicker={kicker || undefined}
        action={paged ? { href: routes.campus, label: "Revenir aux dernières parutions" } : undefined}
      />
      {filters.kind === "breve" ? (
        <BriefList posts={posts} className="mt-8" />
      ) : (
        <WeekList posts={posts} className="mt-8" />
      )}
      {olderHref && <OlderLink href={olderHref} className="pt-10" />}
    </section>
  );
}

/** Brèves only: short items, no pictures, grouped by week. */
function BriefList({ posts, className }: { posts: Post[]; className?: string }) {
  return (
    <div className={className}>
      {groupByWeek(posts).map((week) => (
        <WeekSection key={week.start} week={week}>
          <ul className="divide-y divide-line">
            {week.items.map((p) => (
              <li key={p.id} className="first:[&>article]:pt-0">
                <PostBrief post={p} excerpt="always" as="h4" />
              </li>
            ))}
          </ul>
        </WeekSection>
      ))}
    </div>
  );
}

/** Stories grouped under their week. */
function WeekList({ posts, className }: { posts: Post[]; className?: string }) {
  return (
    <div className={className}>
      {groupByWeek(posts).map((week) => (
        <WeekSection key={week.start} week={week}>
          <ul className="divide-y divide-line">
            {week.items.map((p) => (
              <li key={p.id} className="py-5 first:pt-0 last:pb-0">
                {p.kind === "breve" ? <PostBrief post={p} excerpt="always" as="h4" /> : <PostItem post={p} size="sm" withImage as="h4" />}
              </li>
            ))}
          </ul>
        </WeekSection>
      ))}
    </div>
  );
}

/** The next page: older stories, from where this one stops. */
function OlderLink({ href, className }: { href: string; className?: string }) {
  return (
    <div className={cx("wrap flex justify-center", className)}>
      <Link
        href={href}
        className="group inline-flex min-h-12 items-center gap-2 border-2 border-fg px-5 type-button hover:bg-fg hover:text-bg"
      >
        Articles plus anciens
        <Icon name="arrow-right" size={16} className="transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}

/** Published articles exist, but none match (or the pages ran out). */
function EmptyFeed({ filters, paged }: { filters: FeedFilterValues; paged: boolean }) {
  const kind: PostKind | null = filters.kind;
  return (
    <section aria-labelledby="fil-vide" className="wrap pb-section">
      <h2 id="fil-vide" className="sr-only">
        Aucun article
      </h2>
      <EmptyState
        title={
          paged
            ? "C'est tout pour ce fil"
            : filters.q
              ? `Rien pour « ${filters.q} »`
              : kind && !filters.category && !filters.association
                ? `${POST_KIND_NONE[kind]} pour l'instant`
                : "Rien ici pour l'instant"
        }
        actions={
          <ButtonLink href={routes.campus} variant="secondary" icon="arrow-right">
            Tout le fil
          </ButtonLink>
        }
      >
        {paged
          ? "Il n'y a pas d'article plus ancien avec ces filtres."
          : filters.q
            ? "Aucun article publié ne contient ces mots. Essaie un autre mot, ou retire un filtre."
            : "Aucun article publié ne correspond à ces filtres. Le reste du fil est à un clic."}
      </EmptyState>
    </section>
  );
}

/**
 * Nothing published yet, anywhere: say who writes here. Officers get the
 * way to their association's content desk; everyone else, the BDE's events.
 */
function FirstIssue({ managed }: { managed: AssociationRef[] }) {
  return (
    <section aria-labelledby="fil-a-venir" className="wrap pb-section">
      <h2 id="fil-a-venir" className="sr-only">
        Articles
      </h2>
      <EmptyState
        mark={<Icon name="file" size={44} />}
        title="Les premiers articles arrivent"
        actions={
          managed.length > 0 ? (
            managed.map((a) => (
              <ButtonLink key={a.id} href={routes.manageContent(a.slug)} icon="arrow-right">
                Écrire pour {a.shortName ?? a.name}
              </ButtonLink>
            ))
          ) : (
            <ButtonLink href={routes.events} variant="secondary" icon="arrow-right">
              Les événements de l&apos;année
            </ButtonLink>
          )
        }
      >
        Aucun article n&apos;est encore paru. Le bureau et les associations publieront ici leurs annonces, leurs
        récaps et leurs brèves, depuis leur espace asso.
      </EmptyState>
    </section>
  );
}
