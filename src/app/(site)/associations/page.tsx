import type { Metadata } from "next";
import Link from "next/link";
import type { Association } from "@/lib/types";
import { routes } from "@/lib/routes";
import { ASSOCIATION_CATEGORY_LABEL, plural } from "@/lib/format";
import { getSession } from "@/lib/demo-session";
import {
  getAssociationCategoryCounts,
  getAssociations,
  getAssociationsByIds,
  toRef,
} from "@/lib/data/associations";
import { getCampaigns } from "@/lib/data/recruitment";
import { getMemberCardOffer } from "@/lib/data/member-card";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { AssociationRow } from "@/components/associations/AssociationRow";
import { AssociationTile } from "@/components/associations/AssociationTile";
import {
  associationCategoryOptions,
  parseAssociationCategory,
  recruitingSticker,
} from "@/components/associations/association-facts";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChips } from "@/components/ui/FilterChips";
import { Icon } from "@/components/ui/Icon";
import { Sticker } from "@/components/ui/Sticker";
import { AssociationSearchForm } from "./_components/AssociationSearchForm";
import { TILE_GRID, tileLayout } from "./_components/tile-layout";

export const metadata: Metadata = {
  title: "Associations",
  description:
    "Les associations du campus de Paris de GEM : le BDE, le sport, la scène, la radio, le conseil… Où les trouver, qui les tient et lesquelles recrutent.",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function parseQuery(value: string | string[] | undefined): string {
  const v = Array.isArray(value) ? value[0] : value;
  return (v ?? "").trim().slice(0, 60);
}

/**
 * /associations — the index. The BDE gets its own band first; every other
 * association is a poster on an asymmetric wall. Filters live in the URL
 * (?categorie=sport&q=radio): shareable, back-button friendly, no JS needed.
 */
export default async function AssociationsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const category = parseAssociationCategory(sp.categorie);
  const q = parseQuery(sp.q);
  const session = await getSession();
  const memberships = session.user?.memberships ?? [];

  const [list, counts, openCampaigns, mine] = await Promise.all([
    getAssociations({ category: category ?? undefined, q: q || undefined }),
    getAssociationCategoryCounts(),
    getCampaigns({ scope: "open" }),
    getAssociationsByIds(memberships.map((m) => m.associationId)),
  ]);

  const seatsByAssociation = new Map<string, number>();
  for (const c of openCampaigns) {
    seatsByAssociation.set(c.associationId, (seatsByAssociation.get(c.associationId) ?? 0) + c.seats);
  }
  const stickerFor = (a: Association) => {
    const seats = seatsByAssociation.get(a.id);
    return seats === undefined ? undefined : recruitingSticker(seats);
  };

  const bde = list.find((a) => a.category === "bde");
  const others = list.filter((a) => a.category !== "bde");
  const offer = bde ? await getMemberCardOffer(bde.id) : null;
  const total = Object.values(counts).reduce((n, c) => n + (c ?? 0), 0);
  const filtered = Boolean(category || q);
  const roleOf = (id: string) => memberships.find((m) => m.associationId === id)?.role;

  let index = 0;
  const nextIndex = () => String(++index).padStart(2, "0");

  const othersTitle = category ? ASSOCIATION_CATEGORY_LABEL[category] : filtered ? "Résultats" : "Toutes les assos";
  const othersKicker = [
    plural(others.length, "asso"),
    q ? `« ${q} »` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader
        kicker="Associations · campus de Paris"
        title={
          <>
            Trouve ta bande<span className="text-accent-text">.</span>
          </>
        }
        aside={
          seatsByAssociation.size > 0 ? (
            <Sticker tone="ok" tilt={-3}>
              {plural(seatsByAssociation.size, "asso recrute", "assos recrutent")}
            </Sticker>
          ) : undefined
        }
        intro={`${total} assos, du BDE qui fait la nuit à l'atelier vélo du jeudi. Chacune dit où la trouver, qui la tient et quand elle recrute.`}
      >
        <div className="flex flex-col gap-5">
          <AssociationSearchForm query={q} category={category} className="max-w-xl" />
          <FilterChips
            label="Filtrer par catégorie"
            param="categorie"
            options={associationCategoryOptions(counts)}
            current={category}
            basePath={routes.associations}
            params={{ q: q || undefined }}
          />
        </div>
      </PageHeader>

      {/* Personal line: the student's associations and role, or how to get there. */}
      <div className="wrap">
        <div className="flex flex-col gap-4 border-y border-line py-4">
          {session.user ? (
            mine.length > 0 ? (
              <>
                <p id="tes-assos" className="type-label text-muted">
                  Tes assos
                </p>
                <ul
                  aria-labelledby="tes-assos"
                  className="rail -my-1 py-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0"
                >
                  {mine.map((a) => (
                    <li key={a.id} className="w-[16.5rem]">
                      <AssociationRow
                        association={toRef(a)}
                        detail={roleOf(a.id)}
                        as="p"
                        size="sm"
                        boxed
                      />
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="flex items-start gap-3">
                <Icon name="users" size={20} className="mt-0.5 shrink-0 text-muted" />
                <span>
                  Tu ne fais partie d&apos;aucune asso pour l&apos;instant. Celles qui cherchent du monde portent
                  l&apos;autocollant vert « Recrute ».
                </span>
              </p>
            )
          ) : (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
              <p className="flex items-start gap-3">
                <Icon name="lock" size={20} className="mt-0.5 shrink-0 text-muted" />
                <span>
                  Tout se lit sans compte. Connecte-toi pour retrouver tes assos et ton rôle dans chacune.
                </span>
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
          <span>
            {plural(list.length, "asso trouvée", "assos trouvées")}
            {q && <> pour « {q} »</>}
            {category && <> en {ASSOCIATION_CATEGORY_LABEL[category]}</>}
          </span>
          <Link href={routes.associations} className="inline-flex min-h-10 items-center gap-1.5 type-label text-fg hover:text-accent-text">
            <Icon name="close" size={14} />
            Tout effacer
          </Link>
        </p>
      )}

      {list.length === 0 && (
        <div className="wrap pt-12">
          <EmptyState
            title={q ? `Aucune asso pour « ${q} »` : "Aucune asso dans cette catégorie"}
            actions={
              <>
                {q && category && (
                  <ButtonLink
                    href={`${routes.associations}?categorie=${category}`}
                    variant="secondary"
                    icon="arrow-right"
                  >
                    Garder {ASSOCIATION_CATEGORY_LABEL[category]}, sans le mot
                  </ButtonLink>
                )}
                <ButtonLink href={routes.associations} icon="arrow-right">
                  Voir les {total} assos
                </ButtonLink>
              </>
            }
          >
            Essaie un mot plus court ou une activité (« ski », « radio », « vin ») : la recherche lit le nom, la
            présentation et l&apos;accroche de chaque asso.
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
                    <li key={h} className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-baseline gap-3 border-t border-line py-3.5">
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
          <SectionHeader id="les-assos" index={nextIndex()} kicker={othersKicker} title={othersTitle} />
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

      {list.length > 0 && seatsByAssociation.size > 0 && (
        <p className="wrap pt-16">
          <Link
            href={`${routes.recruitment}?scope=open`}
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
