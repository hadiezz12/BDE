import type { Metadata } from "next";
import Link from "next/link";
import type { Association } from "@/lib/types";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { getSession } from "@/lib/session";
import { getMyAccess } from "@/lib/governance/access";
import {
  getAssociations,
  getPublicAssociations,
  getPublicCategories,
  legacyId,
  toRef,
  type AssociationSort,
} from "@/lib/data/associations";
import { cleanQuery } from "@/lib/associations/search";
import { getOpenCampaigns } from "@/lib/data/recruitment";
import { getMemberCardOffer } from "@/lib/data/member-card";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { AssociationRow } from "@/components/associations/AssociationRow";
import { AssociationTile } from "@/components/associations/AssociationTile";
import {
  associationCategoryOptions,
  parseCategory,
  recruitingSticker,
} from "@/components/associations/association-facts";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChips } from "@/components/ui/FilterChips";
import { Icon } from "@/components/ui/Icon";
import { Sticker } from "@/components/ui/Sticker";
import { AssociationSearchForm } from "../_components/AssociationSearchForm";
import { TILE_GRID, tileLayout } from "../_components/tile-layout";

export const metadata: Metadata = {
  title: "Associations",
  description:
    "Les associations de GEM Alpine Business School à Paris : le Very Pink Club, le BDE, et chaque asso qui a publié sa page.",
  alternates: { canonical: routes.associations },
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function parseSort(value: string | string[] | undefined): AssociationSort {
  return (Array.isArray(value) ? value[0] : value) === "recentes" ? "recentes" : "nom";
}

/**
 * /associations — the directory, read from the database: every published
 * page of an active association, never a placeholder. The BDE gets its own
 * band first; every other association is a poster on an asymmetric wall.
 * Filters live in the URL (?categorie=…&q=…&tri=recentes): shareable,
 * back-button friendly, no JS needed. Categories come from the catalog the
 * BDE maintains, and only those with a public page become chips.
 *
 * While the BDE is the only page, the wall is a designed empty state saying
 * who will add the others, and search, chips and order stay hidden (nothing
 * to filter); they come back on their own.
 */
export default async function AssociationsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const [catalog, all, session] = await Promise.all([getPublicCategories(), getPublicAssociations(), getSession()]);
  const category = parseCategory(sp.categorie, catalog);
  const q = cleanQuery(sp.q);
  const sort = parseSort(sp.tri);
  const user = session.user;

  const [list, openCampaigns, access] = await Promise.all([
    getAssociations({ category, q: q || undefined, sort }),
    getOpenCampaigns(100),
    user ? getMyAccess() : Promise.resolve(null),
  ]);

  // The student's associations that have a public page, with their role there.
  const mine = (access?.organizations ?? [])
    .map((o) => ({ org: o, page: all.find((a) => a.id === o.id) }))
    .filter((m): m is { org: (typeof m)["org"]; page: Association } => Boolean(m.page));
  const roleOf = (o: (typeof mine)[number]["org"]) => {
    const titles = [...new Set(o.positions.map((p) => p.title))];
    return titles.length > 0 ? titles.join(" · ") : "Membre";
  };

  // Open recruitment, by association: "Recrute · 3 places" when every position announced its places.
  const recruitingBy = new Map<string, number | null>();
  for (const c of openCampaigns) {
    const before = recruitingBy.get(c.associationId);
    recruitingBy.set(c.associationId, before === undefined ? c.seats : before === null || c.seats === null ? null : before + c.seats);
  }
  const stickerFor = (a: Association) => {
    if (!recruitingBy.has(a.id)) return undefined;
    return recruitingSticker(recruitingBy.get(a.id) ?? undefined);
  };

  const bde = list.find((a) => a.isBde);
  const others = list.filter((a) => !a.isBde);
  const offer = bde ? await getMemberCardOffer(legacyId(bde)) : null;
  const total = all.length;
  /** Associations other than the BDE, whatever the filter. */
  const othersTotal = all.filter((a) => !a.isBde).length;
  const filtered = Boolean(category || q);
  const categoryLabel = catalog.find((c) => c.slug === category)?.label;

  // Filters only when there is something to filter: a chip per non-empty category, beyond "Toutes".
  const categoryOptions = associationCategoryOptions(catalog, total);
  const showSearch = total > 1;
  const showChips = categoryOptions.length > 2;
  const showSort = others.length > 1;
  const keep = { q: q || undefined, categorie: category ?? undefined, tri: sort === "recentes" ? sort : undefined };

  let index = 0;
  const nextIndex = () => String(++index).padStart(2, "0");

  const othersTitle = categoryLabel ?? (filtered ? "Résultats" : "Toutes les assos");
  const othersKicker = [plural(others.length, "asso"), q ? `« ${q} »` : null].filter(Boolean).join(" · ");

  return (
    <>
      <PageHeader
        kicker="Associations · GEM Alpine Business School, Paris"
        title={
          <>
            Trouve ta bande<span className="text-accent-text">.</span>
          </>
        }
        aside={
          recruitingBy.size > 0 ? (
            <Sticker tone="ok" tilt={-3}>
              {plural(recruitingBy.size, "asso recrute", "assos recrutent")}
            </Sticker>
          ) : undefined
        }
        intro={
          othersTotal > 0
            ? `${plural(total, "asso")} sur la plateforme. Chacune tient sa page : présentation, équipe, réseaux.`
            : "Le Very Pink Club, le BDE, ouvre la marche. Les autres associations arrivent : chaque présidente ou président publiera la page de son asso."
        }
      >
        {(showSearch || showChips) && (
          <div className="flex flex-col gap-5">
            {showSearch && (
              <AssociationSearchForm
                query={q}
                category={category}
                sort={keep.tri}
                className="max-w-xl"
              />
            )}
            {showChips && (
              <FilterChips
                label="Filtrer par catégorie"
                param="categorie"
                options={categoryOptions}
                current={category}
                basePath={routes.associations}
                params={keep}
              />
            )}
          </div>
        )}
      </PageHeader>

      {/* Personal line: the student's associations and role, or how to get there. */}
      <div className="wrap">
        <div className="flex flex-col gap-4 border-y border-line py-4">
          {user ? (
            mine.length > 0 ? (
              <>
                <p id="tes-assos" className="type-label text-muted">
                  Tes assos
                </p>
                <ul
                  aria-labelledby="tes-assos"
                  className="rail -my-1 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
                >
                  {mine.map((m) => (
                    <li key={m.org.id} className="w-[16.5rem]">
                      <AssociationRow association={toRef(m.page)} detail={roleOf(m.org)} as="p" size="sm" boxed />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="flex items-start gap-3">
                <Icon name="users" size={20} className="mt-0.5 shrink-0 text-muted" />
                <span>Tu ne fais partie d&apos;aucune asso sur la plateforme pour l&apos;instant.</span>
              </p>
            )
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
              <p className="flex items-start gap-3">
                <Icon name="lock" size={20} className="mt-0.5 shrink-0 text-muted" />
                <span>Tout se lit sans compte. Connecte-toi pour retrouver tes assos et ton rôle dans chacune.</span>
              </p>
              <ButtonLink href={routes.login} variant="secondary" size="sm" icon="arrow-right" className="self-start">
                Se connecter
              </ButtonLink>
            </div>
          )}
        </div>
      </div>

      {filtered && list.length > 0 && (
        <p className="wrap flex flex-wrap items-baseline gap-x-4 gap-y-2 pt-8 type-meta text-muted">
          <span role="status">
            {plural(list.length, "asso trouvée", "assos trouvées")}
            {q && <> pour « {q} »</>}
            {categoryLabel && <> en {categoryLabel}</>}
          </span>
          <Link
            href={routes.associations}
            className="inline-flex min-h-10 items-center gap-1.5 type-label text-fg hover:text-accent-text"
          >
            <Icon name="close" size={14} />
            Tout effacer
          </Link>
        </p>
      )}

      {list.length === 0 && (
        <div className="wrap pt-12">
          <EmptyState
            title={
              total === 0
                ? "Les pages arrivent"
                : q
                  ? `Aucune asso pour « ${q} »`
                  : "Aucune asso dans cette catégorie"
            }
            actions={
              total > 0 && (
                <>
                  {q && category && (
                    <ButtonLink
                      href={`${routes.associations}?categorie=${category}`}
                      variant="secondary"
                      icon="arrow-right"
                    >
                      Garder {categoryLabel}, sans le mot
                    </ButtonLink>
                  )}
                  <ButtonLink href={routes.associations} icon="arrow-right">
                    {total > 1 ? `Voir les ${total} assos` : "Voir les associations"}
                  </ButtonLink>
                </>
              )
            }
          >
            {total === 0
              ? "Aucune page n'est publiée pour l'instant. Chaque présidente ou président publiera la page de son asso."
              : q
                ? "Essaie un mot plus court : la recherche lit le nom, l'accroche, la présentation et les catégories de chaque asso."
                : "Les associations arrivent au fur et à mesure : chaque présidente ou président publie la page de son asso."}
          </EmptyState>
        </div>
      )}

      {bde && (
        <section aria-labelledby="le-bde" className="wrap pt-12 sm:pt-16">
          <SectionHeader id="le-bde" index={nextIndex()} kicker={bde.kind} title="Le BDE, d'abord" />
          <div className="mt-8 grid gap-x-12 gap-y-10 md:grid-cols-12">
            <AssociationTile
              association={bde}
              sticker={stickerFor(bde)}
              priority
              sizes="(min-width: 1024px) 30vw, (min-width: 768px) 40vw, 100vw"
              className="max-md:max-w-[26rem] md:col-span-5 lg:col-span-4"
            />
            <div className="flex min-w-0 flex-col gap-8 md:col-span-7 lg:col-span-7 lg:col-start-6">
              {bde.description[0] && <p className="type-lead">{bde.description[0]}</p>}
              {bde.highlights && bde.highlights.length > 0 && (
                <ol aria-label="À savoir sur le BDE" className="border-b border-line">
                  {bde.highlights.map((h, i) => (
                    <li
                      key={`${i}-${h}`}
                      className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-baseline gap-3 border-t border-line py-3.5"
                    >
                      <span aria-hidden className="type-numeral text-[1.9rem] text-accent-text">
                        {i + 1}
                      </span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ol>
              )}
              <div className="flex flex-wrap gap-3">
                {offer && (
                  <ButtonLink href={`${routes.association(bde.slug)}#carte`} icon="arrow-right">
                    La carte cotisante · {offer.price}&nbsp;€
                  </ButtonLink>
                )}
                <ButtonLink href={routes.association(bde.slug)} variant="secondary">
                  La page du BDE
                </ButtonLink>
              </div>
            </div>
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section aria-labelledby="les-assos" className="wrap pt-16 sm:pt-20">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <SectionHeader id="les-assos" index={nextIndex()} kicker={othersKicker} title={othersTitle} />
            {showSort && (
              <FilterChips
                label="Ordre"
                param="tri"
                options={[
                  { value: null, label: "De A à Z" },
                  { value: "recentes", label: "Les plus récentes" },
                ]}
                current={sort === "recentes" ? "recentes" : null}
                basePath={routes.associations}
                params={keep}
                className="shrink-0"
              />
            )}
          </div>
          <ul className={`mt-8 ${TILE_GRID}`}>
            {others.map((a, i) => {
              const layout = tileLayout(i, others.length);
              return (
                <li key={a.id} className={layout.className}>
                  <AssociationTile association={a} sticker={stickerFor(a)} sizes={layout.sizes} />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* No other association yet: say so, and who will add them. */}
      {!filtered && othersTotal === 0 && total > 0 && (
        <section aria-label="Les autres associations" className="wrap pt-16 sm:pt-20">
          <EmptyState mark={<Icon name="users" size={44} />} title="Les autres associations arrivent">
            Chaque présidente ou président d&apos;asso publiera la page de son asso : présentation, équipe, réseaux.
            Elles s&apos;afficheront ici au fur et à mesure.
          </EmptyState>
        </section>
      )}

      {list.length > 0 && recruitingBy.size > 0 && (
        <p className="wrap pt-16">
          <Link
            href={`${routes.recruitment}?vue=ouverts`}
            className="group inline-flex min-h-10 items-center gap-1.5 type-label hover:text-accent-text"
          >
            Tous les postes ouverts, asso par asso
            <Icon name="arrow-right" size={14} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </p>
      )}

      <div aria-hidden className="h-[var(--section)]" />
    </>
  );
}
