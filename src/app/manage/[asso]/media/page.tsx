import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { plural, relativeDay } from "@/lib/format";
import { MEDIA_SLOTS, type MediaSlot } from "@/lib/media-slots";
import { getManageContext } from "@/lib/data/manage";
import { getMedia } from "@/lib/data/users";
import { FilterChips, type FilterOption } from "@/components/ui/FilterChips";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { MediaGrid } from "@/components/manage/media/MediaGrid";
import { MediaUpload } from "@/components/manage/media/MediaUpload";

type Params = Promise<{ asso: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

type Usage = "utilisees" | "libres";

function parseUsage(value: string | string[] | undefined): Usage | null {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "utilisees" || v === "libres" ? v : null;
}

const USAGE_TITLE: Record<Usage, string> = { utilisees: "Utilisées", libres: "Libres" };

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const usage = parseUsage((await searchParams).usage);
  return { title: usage ? `Images ${USAGE_TITLE[usage].toLowerCase()} · Médias` : "Médias" };
}

/** The placements an association feeds, with the sizes that look sharp there. */
const GUIDE_SLOTS: { slot: MediaSlot; label: string }[] = [
  { slot: "association-cover", label: "Couverture de l'association" },
  { slot: "event-cover", label: "Visuel d'événement" },
  { slot: "post-cover", label: "Photo d'article" },
  { slot: "gallery", label: "Galerie" },
];

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/**
 * /manage/[asso]/media — every image the association has added: logo,
 * covers, event visuals, photos. Filter in the URL (?usage=utilisees|libres)
 * to find what is online somewhere or what can go. Adding images is a demo
 * file picker in Phase 1: nothing is uploaded.
 */
export default async function ManageMediaPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;

  const { association } = ctx;
  const usage = parseUsage((await searchParams).usage);
  const now = new Date();
  const assets = await getMedia(association.id);

  const used = assets.filter((a) => a.usedIn);
  const free = assets.filter((a) => !a.usedIn);
  const shown = usage === "utilisees" ? used : usage === "libres" ? free : assets;
  const latest = assets[0];

  const options: FilterOption[] = [
    { value: null, label: "Toutes", count: assets.length },
    { value: "utilisees", label: "Utilisées", count: used.length },
    { value: "libres", label: "Libres", count: free.length },
  ];

  const upload = (
    <MediaUpload hint="JPG, PNG ou WebP. Plusieurs fichiers à la fois, c'est possible." />
  );

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={association.shortName ?? association.name}
        title="Médias"
        description={
          <p>
            Logo, couvertures, visuels d&apos;événements, photos de soirée&nbsp;: les images que {association.name}
            ajoute au site. Une image «&nbsp;utilisée&nbsp;» est visible quelque part sur le site, regarde où avant de la
            remplacer.
          </p>
        }
        meta={
          latest ? (
            <>
              <span>{plural(assets.length, "image")}</span>
              <span>
                Dernier ajout{" "}
                <time dateTime={latest.uploadedAt}>{lowerFirst(relativeDay(latest.uploadedAt, now))}</time>, par{" "}
                {latest.uploadedBy}
              </span>
            </>
          ) : undefined
        }
        actions={upload}
      />

      {assets.length === 0 ? (
        <ManageEmpty
          as="h2"
          icon="image"
          title="La médiathèque est vide"
          demo="le choix de fichiers fonctionne, mais rien n'est envoyé : les images restent sur ton appareil."
        >
          <p>
            {association.logo
              ? "Le logo est déjà sur la page publique. Ajoute une photo de couverture et les photos de vos événements"
              : "Ajoute le logo, une photo de couverture et les photos de vos événements"}
            &nbsp;: chaque image ajoutée par le bureau s&apos;affichera ici, avec l&apos;endroit du site où elle sert.
          </p>
        </ManageEmpty>
      ) : (
        <ManageSection
          title={usage ? `Images ${USAGE_TITLE[usage].toLowerCase()}` : "Toutes les images"}
          count={shown.length}
          description="Les plus récentes d'abord. Les logos et les emblèmes sont montrés en entier, les photos recadrées au carré."
        >
          <FilterChips
            label="Filtrer les images"
            param="usage"
            options={options}
            current={usage}
            basePath={routes.manageMedia(association.slug)}
            className="mb-2"
          />
          {shown.length > 0 ? (
            <MediaGrid
              assets={shown}
              accent={association.accent}
              label={usage ? `Images ${USAGE_TITLE[usage].toLowerCase()} de ${association.name}` : `Images de ${association.name}`}
            />
          ) : usage === "libres" ? (
            <ManageEmpty icon="check" title="Toutes tes images servent quelque part">
              <p>Chaque image de la médiathèque est en ligne&nbsp;: couverture, événement, article ou galerie.</p>
            </ManageEmpty>
          ) : (
            <ManageEmpty icon="image" title="Aucune image en ligne pour l'instant">
              <p>
                Une image devient «&nbsp;utilisée&nbsp;» dès qu&apos;elle sert de couverture, de visuel d&apos;événement
                ou de photo d&apos;article.
              </p>
            </ManageEmpty>
          )}
        </ManageSection>
      )}

      <ManageSection
        title="Formats qui rendent bien"
        description="Les tailles minimales pour que l'image reste nette sur un grand écran. En dessous, elle s'affiche quand même, mais floue."
      >
        <dl className="border-b border-line">
          {GUIDE_SLOTS.map(({ slot, label }) => {
            const spec = MEDIA_SLOTS[slot];
            return (
              <div
                key={slot}
                className="grid gap-1 border-t border-line py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,9rem)_minmax(0,1fr)] sm:gap-6"
              >
                <dt className="font-semibold">{label}</dt>
                <dd className="type-meta text-muted">
                  {spec.ratio === "variable" ? "Format libre" : spec.ratio} · {spec.minSize}
                </dd>
                <dd className="type-small text-subtle">{spec.brief}</dd>
              </div>
            );
          })}
        </dl>
      </ManageSection>
    </div>
  );
}
