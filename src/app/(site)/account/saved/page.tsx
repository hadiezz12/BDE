import type { Metadata } from "next";
import type { SavedItem, SavedKind } from "@/lib/types";
import { routes } from "@/lib/routes";
import { formatDayShort, plural } from "@/lib/format";
import { withNext } from "@/lib/auth/next-path";
import { getMySavedItems } from "@/lib/saved/data";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { FilterChips, type FilterOption } from "@/components/ui/FilterChips";
import { Icon } from "@/components/ui/Icon";
import { SearchResultRow } from "@/components/search/SearchResultRow";
import { SaveButton } from "@/components/saved/SaveButton";

export const metadata: Metadata = {
  title: "Enregistrés",
  description: "Les associations, articles, événements et recrutements que tu as gardés pour plus tard.",
  robots: { index: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const KIND_PARAM: Record<SavedKind, string> = {
  association: "associations",
  post: "articles",
  event: "evenements",
  campaign: "recrutements",
  position: "postes",
};
const KIND_OF = new Map(Object.entries(KIND_PARAM).map(([k, v]) => [v, k as SavedKind]));

const KIND_LABEL: Record<SavedKind, { one: string; many: string }> = {
  association: { one: "Association", many: "Associations" },
  post: { one: "Article", many: "Articles" },
  event: { one: "Événement", many: "Événements" },
  campaign: { one: "Recrutement", many: "Recrutements" },
  position: { one: "Poste", many: "Postes" },
};

const EXPLORE: Record<SavedKind, { href: string; label: string }> = {
  association: { href: routes.associations, label: "Voir les associations" },
  post: { href: routes.campus, label: "Lire le fil" },
  event: { href: routes.events, label: "Ouvrir l'agenda" },
  campaign: { href: routes.recruitment, label: "Voir les recrutements" },
  position: { href: routes.recruitment, label: "Voir les recrutements" },
};

/**
 * /account/saved (public.my_saved_items: the student's own rows, nobody
 * else's — not the associations', not the BDE's). Each item with its live
 * public state: a cancelled event says so, a closed recruitment says so.
 * An item that is no longer public keeps only its kind and the day it was
 * saved (nothing it said), with the way to remove it. Saving is a bookmark:
 * not a registration, an application or a membership.
 */
export default async function SavedPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = (await searchParams).type;
  const kind = KIND_OF.get(Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "")) ?? null;
  const all = await getMySavedItems();

  const counts = new Map<SavedKind, number>();
  for (const item of all ?? []) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  const items = (all ?? []).filter((i) => !kind || i.kind === kind);
  const options: FilterOption[] = [
    { value: null, label: "Tout", count: all?.length ?? 0 },
    ...(Object.keys(KIND_PARAM) as SavedKind[])
      .filter((k) => counts.has(k) || k === kind)
      .map((k) => ({ value: KIND_PARAM[k], label: KIND_LABEL[k].many, count: counts.get(k) ?? 0 })),
  ];
  const login = withNext(routes.login, routes.accountSaved);

  return (
    <>
      <PageHeader
        variant="document"
        kicker="Mon espace"
        title="Enregistrés"
        intro="Ce que tu as gardé pour plus tard. Enregistrer ne t'inscrit pas, n'envoie aucune candidature et ne fait pas de toi un membre : c'est une liste pour toi seul·e, que personne d'autre ne voit."
        meta={all ? <span>{plural(all.length, "contenu enregistré", "contenus enregistrés")}</span> : undefined}
      />

      <div className="wrap flex flex-col gap-8">
        {all === null ? (
          <EmptyState title="Tes enregistrements n'ont pas pu être chargés." mark={<Icon name="alert" size={44} />}>
            <p>Réessaie dans un instant.</p>
          </EmptyState>
        ) : all.length === 0 ? (
          <EmptyState
            title="Rien d'enregistré pour l'instant."
            mark={<Icon name="bookmark" size={48} />}
            actions={
              <>
                <ButtonLink href={routes.events} variant="primary" icon="arrow-right">
                  Ouvrir l&apos;agenda
                </ButtonLink>
                <ButtonLink href={routes.search} variant="secondary" icon="search">
                  Chercher sur le campus
                </ButtonLink>
              </>
            }
          >
            <p>
              Sur la page d&apos;une asso, d&apos;un article, d&apos;un événement ou d&apos;un recrutement, le bouton
              «&nbsp;Enregistrer&nbsp;» le garde ici.
            </p>
          </EmptyState>
        ) : (
          <>
            {options.length > 2 && (
              <FilterChips label="Filtrer par type" param="type" options={options} current={kind ? KIND_PARAM[kind] : null} basePath={routes.accountSaved} />
            )}
            {items.length === 0 && kind ? (
              <EmptyState
                title={`Rien dans « ${KIND_LABEL[kind].many} » pour l'instant.`}
                tone="quiet"
                actions={
                  <ButtonLink href={EXPLORE[kind].href} variant="secondary" icon="arrow-right">
                    {EXPLORE[kind].label}
                  </ButtonLink>
                }
              />
            ) : (
              <ul className="border-b border-line">
                {items.map((item) => (
                  <li key={`${item.kind}-${item.id}`} className="flex items-start gap-3 sm:gap-4">
                    <div className="min-w-0 flex-1">
                      {item.entry ? <SearchResultRow entry={item.entry} query="" kindLabel={item.kind === "post" ? undefined : KIND_LABEL[item.kind].one} /> : <Unavailable item={item} />}
                    </div>
                    <div className="border-t border-line py-4 sm:py-5">
                      <SaveButton kind={item.kind} id={item.id} initialSaved signedIn loginHref={login} compact />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </>
  );
}

/** An item that is no longer public: its kind and the day it was saved, nothing it said. */
function Unavailable({ item }: { item: SavedItem }) {
  return (
    <div className="flex items-start gap-4 border-t border-line py-4 text-muted sm:gap-5 sm:px-3 sm:py-5">
      <span aria-hidden className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-full border-2 border-line-strong">
        <Icon name="minus" size={19} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="type-card">{KIND_LABEL[item.kind].one} qui n&apos;est plus en ligne</span>
        <span className="type-meta text-subtle">
          Enregistré le {formatDayShort(item.savedAt)} · retiré du site, masqué ou supprimé depuis
        </span>
      </span>
    </div>
  );
}
