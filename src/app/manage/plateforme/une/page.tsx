import type { Metadata } from "next";
import type { ReactNode } from "react";
import Form from "next/form";
import Link from "next/link";
import type { Association, CampaignItem, PostItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { getAuthContext } from "@/lib/auth/context";
import { getMyAccess, hasPlatform } from "@/lib/governance/access";
import { getFeaturedPosts, getFeed } from "@/lib/data/posts";
import { getCampaigns, getFeaturedCampaigns } from "@/lib/data/recruitment";
import { getFeaturedAssociations, getPublicAssociations } from "@/lib/data/associations";
import { CAMPAIGN_STATUS_LABEL, formatDayShort } from "@/lib/format";
import { feedQuery } from "@/lib/posts/model";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { AssociationLogo } from "@/components/associations/AssociationLogo";
import { POST_KIND_LABEL, publishedLabel } from "@/components/campus/labels";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { MfaNotice, Notice } from "@/components/manage/governance/Notices";
import { PlatformDenied } from "@/components/manage/moderation/PlatformDenied";
import { ClearProminenceForm, FeaturePostForm, MarkImportantForm } from "@/components/manage/moderation/ProminenceForms";
import { PROMINENCE_LIMIT, SPOTLIGHT_LIMIT } from "@/components/manage/moderation/labels";
import {
  ClearAssociationForm,
  ClearCampaignForm,
  FeatureAssociationForm,
  FeatureCampaignForm,
} from "@/components/manage/moderation/SpotlightForms";

type Search = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata: Metadata = { title: "À la une" };

/**
 * /manage/plateforme/une — the school-wide front page of the campus fil
 * (platform.content.feature): up to three stories "à la une", from any
 * association, and up to two important notices, BDE posts only. What is live
 * comes from public_featured_posts; candidates are the 30 latest published
 * posts (public_posts, with ?q= search). Below, the front page's two other
 * spotlights (Phase 12, same mechanism): up to three recruitments "à la
 * une" and one association "à l'honneur". Associations pin posts on their
 * own page themselves; nothing here touches their content. Every change
 * needs the second factor and is checked again by the database.
 */
export default async function PlatformFeaturedPage({ searchParams }: { searchParams: Search }) {
  const q = feedQuery((await searchParams).q);
  const [access, ctx] = await Promise.all([getMyAccess(), getAuthContext()]);
  if (!hasPlatform(access, "platform.content.feature")) {
    return <PlatformDenied title="À la une" right="Mettre à la une" />;
  }

  let highlights: { featured: PostItem[]; important: PostItem[] };
  let recent: PostItem[];
  let spotCampaigns: (CampaignItem & { featuredUntil: string | null })[];
  let currentCampaigns: CampaignItem[];
  let spotAssociations: { id: string; until: string | null }[];
  let associations: Association[];
  try {
    [highlights, recent, spotCampaigns, currentCampaigns, spotAssociations, associations] = await Promise.all([
      getFeaturedPosts(),
      getFeed({ limit: 30, q: q || null }).then((page) => page.items),
      getFeaturedCampaigns(),
      getCampaigns({ view: "current", limit: 30 }),
      getFeaturedAssociations(),
      getPublicAssociations(),
    ]);
  } catch {
    return (
      <Notice tone="danger" icon="alert" title="La une n'a pas pu être chargée.">
        <p>Réessaie dans un instant.</p>
      </Notice>
    );
  }

  const { featured, important } = highlights;
  const current = new Set([...featured, ...important].map((p) => p.id));
  const candidates = recent.filter((p) => !current.has(p.id));
  const featuredFull = featured.length >= PROMINENCE_LIMIT.featured;
  const importantFull = important.length >= PROMINENCE_LIMIT.important;
  const aal2 = ctx.status === "authenticated" && ctx.aal === "aal2";
  const spotIds = new Set(spotCampaigns.map((c) => c.id));
  const campaignCandidates = currentCampaigns.filter(
    (c) => !spotIds.has(c.id) && (c.status === "ouverte" || c.status === "derniere-chance" || c.status === "a-venir"),
  );
  const campaignsFull = spotCampaigns.length >= SPOTLIGHT_LIMIT.campaigns;
  const honoured = spotAssociations
    .map((x) => ({ association: associations.find((a) => a.id === x.id), until: x.until }))
    .filter((x): x is { association: Association; until: string | null } => Boolean(x.association));
  const associationCandidates = associations.filter((a) => !a.isBde && !spotAssociations.some((x) => x.id === a.id));

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker="Centre de contrôle BDE"
        title="À la une"
        description={
          <p>
            La une du fil Campus, pour toute l&apos;école&nbsp;: trois articles au plus, de n&apos;importe quelle asso, et
            deux annonces importantes au plus, du BDE seulement. Les assos épinglent elles-mêmes leurs articles sur leur
            propre page&nbsp;; ici, c&apos;est la une de l&apos;école.
          </p>
        }
      />
      {!aal2 && <MfaNotice what="Mettre un article à la une ou l'en retirer" />}

      <StatGroup label="Places de la une" columns={2}>
        <StatTile
          label="À la une"
          value={featured.length}
          of={PROMINENCE_LIMIT.featured}
          comparison={featuredFull ? "Complet : retires-en un pour en mettre un autre" : undefined}
          tone={featuredFull ? "accent" : "neutral"}
        />
        <StatTile
          label="Annonces importantes"
          value={important.length}
          of={PROMINENCE_LIMIT.important}
          comparison={importantFull ? "Complet : retires-en une pour en marquer une autre" : undefined}
          tone={importantFull ? "accent" : "neutral"}
        />
      </StatGroup>

      <ManageSection
        title="Annonces importantes"
        count={important.length}
        description="Imprimées sur papier tout en haut du fil : la seule mise en forme urgente du site. Réservées aux articles du BDE, pour qu'aucune annonce ne se fasse passer pour lui."
      >
        {important.length ? (
          <PostList
            posts={important}
            actions={(p) => <ClearProminenceForm postId={p.id} label="Retirer l'annonce" />}
          />
        ) : (
          <ManageEmpty icon="megaphone" title="Aucune annonce importante en ce moment">
            <p>Un article du BDE marqué important ci-dessous s&apos;affiche ici et en tête du fil, jusqu&apos;à la date choisie.</p>
          </ManageEmpty>
        )}
      </ManageSection>

      <ManageSection
        title="À la une du fil"
        count={featured.length}
        description="Le plus récent prend la grande place du fil ; les autres passent en tête de « À lire aussi »."
      >
        {featured.length ? (
          <PostList posts={featured} actions={(p) => <ClearProminenceForm postId={p.id} label="Retirer de la une" />} />
        ) : (
          <ManageEmpty icon="bookmark" title="Rien à la une en ce moment">
            <p>Sans choix du BDE, le fil met en avant le dernier article paru. Choisis-en un ci-dessous pour le garder en tête.</p>
          </ManageEmpty>
        )}
      </ManageSection>

      <ManageSection
        title="Choisir un article"
        description="Les 30 derniers articles en ligne, toutes assos confondues. Cherche par titre, mot-clé ou nom d'asso."
      >
        <Form action={routes.managePlatformFeatured} role="search" className="flex max-w-xl items-stretch gap-2">
          <label htmlFor="une-q" className="sr-only">
            Chercher un article en ligne
          </label>
          <Input
            key={q}
            id="une-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Titre, mot-clé ou asso"
            autoComplete="off"
            maxLength={80}
            enterKeyHint="search"
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="secondary" icon="search">
            <span className="max-sm:sr-only">Chercher</span>
          </Button>
        </Form>
        {q && (
          <p className="type-small text-muted">
            Résultats pour «&nbsp;{q}&nbsp;» ·{" "}
            <Link href={routes.managePlatformFeatured} className="link font-semibold">
              Tout afficher
            </Link>
          </p>
        )}

        {candidates.length ? (
          <PostList
            posts={candidates}
            actions={(p) => (
              <>
                {p.kind === "breve" ? (
                  <p className="type-small text-subtle">Une brève reste dans «&nbsp;En bref&nbsp;»&nbsp;: elle ne passe pas à la une.</p>
                ) : featuredFull ? (
                  <p className="type-small text-subtle">Les {PROMINENCE_LIMIT.featured} places à la une sont prises&nbsp;: retires-en un d&apos;abord.</p>
                ) : (
                  <FeaturePostForm postId={p.id} />
                )}
                {p.association.isBde &&
                  (importantFull ? (
                    <p className="type-small text-subtle">
                      Déjà {PROMINENCE_LIMIT.important} annonces importantes&nbsp;: retires-en une d&apos;abord.
                    </p>
                  ) : (
                    <MarkImportantForm postId={p.id} />
                  ))}
              </>
            )}
          />
        ) : (
          <ManageEmpty icon="search" title={q ? "Aucun article en ligne ne correspond" : "Aucun autre article en ligne"}>
            <p>
              {q
                ? "Essaie un autre mot, ou le nom de l'asso."
                : "Les articles que les assos et le BDE publient arrivent ici, du plus récent au plus ancien."}
            </p>
          </ManageEmpty>
        )}
      </ManageSection>

      <ManageSection
        title="Recrutements à la une"
        count={spotCampaigns.length}
        description={`En tête de « Ça recrute » sur la page d'accueil, ${SPOTLIGHT_LIMIT.campaigns} au plus. Un recrutement clôturé, en pause ou masqué en sort de lui-même.`}
      >
        {spotCampaigns.length > 0 ? (
          <SpotList
            items={spotCampaigns.map((c) => ({
              key: c.id,
              accent: c.association.accent,
              title: c.title,
              href: routes.campaign(c.slug),
              meta: [
                c.association.name,
                CAMPAIGN_STATUS_LABEL[c.status],
                c.featuredUntil ? `à la une jusqu'au ${formatDayShort(c.featuredUntil)}` : null,
              ],
              actions: <ClearCampaignForm campaignId={c.id} />,
            }))}
          />
        ) : (
          <ManageEmpty icon="megaphone" title="Aucun recrutement à la une">
            <p>Sans choix du BDE, «&nbsp;Ça recrute&nbsp;» montre d&apos;abord ceux qui ferment le plus tôt.</p>
          </ManageEmpty>
        )}
        {campaignCandidates.length > 0 && (
          <SpotList
            label="Recrutements ouverts ou sur le point d'ouvrir"
            items={campaignCandidates.map((c) => ({
              key: c.id,
              accent: c.association.accent,
              title: c.title,
              href: routes.campaign(c.slug),
              meta: [c.association.name, CAMPAIGN_STATUS_LABEL[c.status]],
              actions: campaignsFull ? (
                <p className="type-small text-subtle">
                  Les {SPOTLIGHT_LIMIT.campaigns} places sont prises&nbsp;: retires-en un d&apos;abord.
                </p>
              ) : (
                <FeatureCampaignForm campaignId={c.id} />
              ),
            }))}
          />
        )}
      </ManageSection>

      <ManageSection
        title="Asso à l'honneur"
        count={honoured.length}
        description="Une asso à la fois, en premier dans « Trouve ta bande » sur la page d'accueil. Le BDE n'y figure pas : la page d'accueil est déjà la sienne."
      >
        {honoured.length > 0 ? (
          <SpotList
            items={honoured.map(({ association: a, until }) => ({
              key: a.id,
              accent: a.accent,
              title: a.name,
              href: routes.association(a.slug),
              meta: [a.kind, until ? `à l'honneur jusqu'au ${formatDayShort(until)}` : null],
              actions: <ClearAssociationForm organizationId={a.id} />,
            }))}
          />
        ) : (
          <ManageEmpty icon="users" title="Aucune asso à l'honneur">
            <p>Choisis-en une ci-dessous pour la présenter en premier aux étudiantes et étudiants.</p>
          </ManageEmpty>
        )}
        {associationCandidates.length > 0 ? (
          <SpotList
            label="Associations dont la page est en ligne"
            items={associationCandidates.map((a) => ({
              key: a.id,
              accent: a.accent,
              title: a.name,
              href: routes.association(a.slug),
              meta: [a.kind],
              actions:
                honoured.length >= SPOTLIGHT_LIMIT.associations ? (
                  <p className="type-small text-subtle">Une asso est déjà à l&apos;honneur&nbsp;: retire-la d&apos;abord.</p>
                ) : (
                  <FeatureAssociationForm organizationId={a.id} />
                ),
            }))}
          />
        ) : (
          honoured.length === 0 && <p className="type-small text-muted">Aucune autre asso n&apos;a encore sa page en ligne.</p>
        )}
      </ManageSection>
    </div>
  );
}

/** A spotlight list: the item (a link), what it is, and the BDE's action. */
function SpotList({
  label,
  items,
}: {
  label?: string;
  items: { key: string; accent: string; title: string; href: string; meta: (string | null)[]; actions: ReactNode }[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {label && <h3 className="type-label text-muted">{label}</h3>}
      <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
        {items.map((it) => (
          <li
            key={it.key}
            data-accent={it.accent}
            className="flex flex-col gap-3 px-4 py-4 sm:px-5 md:flex-row md:items-start md:justify-between md:gap-6"
          >
            <div className="flex min-w-0 flex-col gap-1.5">
              <h4 className="type-card break-words">
                <Link href={it.href} className="link">
                  {it.title}
                </Link>
              </h4>
              <p className="type-meta text-subtle">{it.meta.filter(Boolean).join(" · ")}</p>
            </div>
            <div className="flex flex-col gap-2 md:w-80 md:shrink-0">{it.actions}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Posts as the fil shows them, with the BDE's actions on the right (under, on phones). */
function PostList({ posts, actions }: { posts: PostItem[]; actions: (post: PostItem) => ReactNode }) {
  return (
    <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
      {posts.map((p) => (
        <li
          key={p.id}
          data-accent={p.association.accent}
          className="flex flex-col gap-3 px-4 py-4 sm:px-5 md:flex-row md:items-start md:justify-between md:gap-6"
        >
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-meta text-subtle">
              <AssociationLogo association={p.association} size={22} />
              <span className="font-semibold text-muted">{p.association.name}</span>
              <span aria-hidden>·</span>
              <span>{POST_KIND_LABEL[p.kind]}</span>
              <span aria-hidden>·</span>
              <time dateTime={p.publishedAt}>{publishedLabel(p.publishedAt)}</time>
            </p>
            <h3 className="type-card break-words">
              <Link href={routes.post(p.slug)} className="link">
                {p.title}
              </Link>
            </h3>
            {p.pinned && (
              <p>
                <StatusBadge tone="neutral">Épinglé par l&apos;asso sur sa page</StatusBadge>
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2 md:w-80 md:shrink-0">{actions(p)}</div>
        </li>
      ))}
    </ul>
  );
}
