import type { Metadata } from "next";
import type { ReactNode } from "react";
import type { PostItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { getManageContext } from "@/lib/data/manage";
import { getPosts } from "@/lib/data/posts";
import { FilterChips, type FilterOption } from "@/components/ui/FilterChips";
import { ButtonLink } from "@/components/ui/Button";
import { publishedPhrase } from "@/components/campus/labels";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { DataTable, type DataColumn } from "@/components/manage/DataTable";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { DemoActionButton } from "@/components/manage/DemoActions";
import { PublicationStatusBadge } from "@/components/manage/StatusBadges";
import { PublicLink } from "@/components/manage/links/PublicLink";
import {
  POST_STATUSES,
  POST_STATUS_PLURAL,
  PostDateCell,
  PostTitleCell,
  parsePostStatus,
} from "@/components/manage/content/PostCells";

type Params = Promise<{ asso: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const status = parsePostStatus((await searchParams).statut);
  return { title: status ? `${POST_STATUS_PLURAL[status]} · Contenus` : "Contenus" };
}

const CREATE_NOTICE = "l'éditeur d'articles n'est pas encore branché, rien n'est créé.";

/** What the filter shows when it is empty: why that's normal, in a sentence. */
const EMPTY_FILTER: Record<PostItem["publication"], { title: string; body: string }> = {
  brouillon: {
    title: "Aucun brouillon en cours",
    body: "Un brouillon reste entre les membres du bureau tant que personne ne le publie. Pratique pour faire relire un récap avant qu'il parte.",
  },
  programme: {
    title: "Rien de programmé",
    body: "Programmer un article, c'est l'écrire à l'avance et le laisser partir tout seul à l'heure dite, par exemple l'ouverture d'une billetterie.",
  },
  publie: {
    title: "Rien de publié pour l'instant",
    body: "Ce que tu publies ici arrive dans le fil du campus et sur la page publique de l'association.",
  },
};

/**
 * /manage/[asso]/content — the association's posts in the campus fil,
 * drafts and scheduled ones included. Filter by state in the URL
 * (?statut=brouillon|programme|publie); unfiltered, what still waits for
 * publication comes first, then what is online.
 */
export default async function ManageContentPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;

  const { association } = ctx;
  const status = parsePostStatus((await searchParams).statut);
  const now = new Date();
  const posts = await getPosts({ associationId: association.id, includeUnpublished: true });

  const count = (s: PostItem["publication"]) => posts.filter((p) => p.publication === s).length;
  const lastPublished = posts.find((p) => p.publication === "publie");
  const basePath = routes.manageContent(association.slug);

  const options: FilterOption[] = [
    { value: null, label: "Tous", count: posts.length },
    ...POST_STATUSES.map((s) => ({ value: s, label: POST_STATUS_PLURAL[s], count: count(s) })),
  ];

  const columns: DataColumn<PostItem>[] = [
    { key: "title", header: "Titre", primary: true, cell: (p) => <PostTitleCell post={p} />, className: "min-w-[15rem]" },
    {
      key: "status",
      header: "Statut",
      cell: (p) => <PublicationStatusBadge status={p.publication} />,
    },
    { key: "date", header: "Date", cell: (p) => <PostDateCell post={p} now={now} />, className: "min-w-[9rem]" },
    { key: "author", header: "Auteur·rice", cell: (p) => <span className="whitespace-nowrap">{p.authorName}</span> },
    {
      key: "reading",
      header: "Lecture",
      align: "end",
      hideOnPhone: true,
      cell: (p) => <span className="type-meta whitespace-nowrap">{p.readingMinutes}&nbsp;min</span>,
    },
  ];

  const table = (rows: PostItem[], caption: string, empty: ReactNode) => (
    <DataTable
      caption={caption}
      columns={columns}
      rows={rows}
      rowKey={(p) => p.id}
      actions={(p) => (p.publication === "publie" ? <PublicLink href={routes.post(p.slug)} title={p.title} label="Lire" /> : null)}
      actionsLabel="Page publique"
      empty={empty}
    />
  );

  const createButton = (label: string) => (
    <DemoActionButton icon="plus" iconPosition="start" notice={CREATE_NOTICE}>
      {label}
    </DemoActionButton>
  );

  const waiting = posts.filter((p) => p.publication !== "publie");
  const online = posts.filter((p) => p.publication === "publie");

  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader
        kicker={association.shortName ?? association.name}
        title="Contenus"
        description={
          <p>
            Les récaps, annonces et brèves de {association.name} dans le fil du campus. Un brouillon reste entre vous,
            un article programmé part tout seul à l&apos;heure dite.
          </p>
        }
        meta={
          lastPublished ? (
            <span>Dernière publication&nbsp;: {publishedPhrase(lastPublished.publishedAt, now).replace(/^Publié /, "")}</span>
          ) : undefined
        }
        actions={createButton("Nouvel article")}
      />

      {posts.length === 0 ? (
        <ManageEmpty
          as="h2"
          title={`${association.shortName ?? association.name} n'a encore rien publié dans le fil`}
          demo={CREATE_NOTICE}
          actions={
            <>
              {createButton("Écrire un premier article")}
              <ButtonLink href={routes.campus} variant="secondary" size="md">
                Voir le fil du campus
              </ButtonLink>
            </>
          }
        >
          <p>
            Le récap d&apos;une soirée, l&apos;ouverture d&apos;une billetterie, une brève pour la promo&nbsp;: les
            articles que le bureau publie ici arrivent dans le fil du campus et sur la page publique de
            l&apos;association.
          </p>
        </ManageEmpty>
      ) : (
        <div className="flex flex-col gap-6">
          <FilterChips label="Filtrer par statut" param="statut" options={options} current={status} basePath={basePath} />

          {status ? (
            table(
              posts.filter((p) => p.publication === status),
              `${POST_STATUS_PLURAL[status]} de ${association.name}`,
              <ManageEmpty
                as="h2"
                title={EMPTY_FILTER[status].title}
                actions={
                  <ButtonLink href={basePath} variant="secondary" size="sm">
                    Voir tous les contenus
                  </ButtonLink>
                }
              >
                <p>{EMPTY_FILTER[status].body}</p>
              </ManageEmpty>,
            )
          ) : (
            <>
              <ManageSection
                title="En attente de publication"
                count={waiting.length}
                description="Brouillons et articles programmés : visibles du bureau seulement."
              >
                {table(
                  waiting,
                  `Contenus de ${association.name} en attente de publication`,
                  <ManageEmpty title="Rien en attente">
                    <p>Tout ce que le bureau a écrit est en ligne.</p>
                  </ManageEmpty>,
                )}
              </ManageSection>
              <ManageSection title="En ligne" count={online.length}>
                {table(
                  online,
                  `Contenus publiés de ${association.name}`,
                  <ManageEmpty title={EMPTY_FILTER.publie.title}>
                    <p>{EMPTY_FILTER.publie.body}</p>
                  </ManageEmpty>,
                )}
              </ManageSection>
            </>
          )}
        </div>
      )}
    </div>
  );
}
