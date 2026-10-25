import type { Metadata } from "next";
import { getAuthContext } from "@/lib/auth/context";
import { getMyAccess, hasPlatform } from "@/lib/governance/access";
import { getCategoryCatalog } from "@/lib/associations/categories";
import { getPublicCategories } from "@/lib/data/associations";
import { getPostFacets } from "@/lib/data/posts";
import { getPostCategories, type PostCategory } from "@/lib/posts/editor";
import { plural } from "@/lib/format";
import { createCategory, updateCategory } from "@/app/actions/association-page";
import { createPostCategory, updatePostCategory } from "@/app/actions/posts";
import { createEventCategory, updateEventCategory } from "@/app/actions/events";
import { getEventFacets } from "@/lib/data/events";
import { getEventCategories, type EventCategoryRow } from "@/lib/events/editor";
import { Field, Input } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { MfaNotice } from "@/components/manage/governance/Notices";
import { PlatformDenied } from "@/components/manage/moderation/PlatformDenied";

export const metadata: Metadata = { title: "Catégories" };

/**
 * /manage/plateforme/categories — the two lists the BDE's leadership keeps
 * (platform.organizations.manage, second factor, for both: the database's
 * create/update functions check that key):
 *  - the directory's categories: each association picks up to three of them
 *    for its page;
 *  - the rubriques of the campus fil: each article takes one of them
 *    (public.create_post_category, update_post_category);
 *  - the categories of the agenda: each event takes one of them
 *    (public.create_event_category, update_event_category).
 * Nothing is ever deleted: archiving takes an entry out of the choices and
 * the filters, and what already uses it keeps it. The control center also
 * opens for moderation or "à la une" alone; this page does not.
 */
export default async function PlatformCategoriesPage() {
  const [access, ctx] = await Promise.all([getMyAccess(), getAuthContext()]);
  if (!hasPlatform(access, "platform.organizations.manage")) {
    return <PlatformDenied title="Catégories" right="Créer et archiver les assos" />;
  }
  const [catalog, counts, rubriques, facets, eventCategories, eventFacets] = await Promise.all([
    getCategoryCatalog(),
    getPublicCategories(),
    getPostCategories(),
    getPostFacets().catch(() => null),
    getEventCategories(),
    getEventFacets().catch(() => null),
  ]);
  const eventsBySlug = eventFacets ? new Map(eventFacets.categories.map((c) => [c.slug, c.count])) : null;
  const activeEventCategories = eventCategories.filter((c) => !c.archived_at);
  const archivedEventCategories = eventCategories.filter((c) => c.archived_at);
  const aal2 = ctx.status === "authenticated" && ctx.aal === "aal2";
  const used = new Map(counts.map((c) => [c.slug, c.count]));
  const active = catalog.filter((c) => !c.archived);
  const archived = catalog.filter((c) => c.archived);
  const postsBySlug = facets ? new Map(facets.categories.map((c) => [c.slug, c.count])) : null;
  const activeRubriques = rubriques.filter((r) => !r.archived_at);
  const archivedRubriques = rubriques.filter((r) => r.archived_at);

  return (
    <div className="flex flex-col gap-12">
      <ManagePageHeader
        kicker="Centre de contrôle BDE"
        title="Catégories"
        description={
          <p>
            Trois listes tenues par le BDE&nbsp;: les catégories de la page Associations, les rubriques du fil Campus et les
            catégories de l&apos;agenda. Un
            nom clair et court se lit mieux qu&apos;une longue liste&nbsp;: une dizaine suffit.
          </p>
        }
      />
      {!aal2 && <MfaNotice what="Ajouter ou modifier une catégorie ou une rubrique" />}

      <ManageSection
        title="Catégories des assos"
        count={active.length}
        description={<p>Les filtres de la page Associations. Chaque asso en choisit jusqu&apos;à trois pour sa page.</p>}
      >
        <Disclosure summary="Nouvelle catégorie" icon="plus" tone="primary">
          <ActionForm action={createCategory} submitLabel="Ajouter" resetOnDone>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Nom" hint="Ce que lisent les étudiant·es, ex : « Musique ».">
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} name="label" required minLength={2} maxLength={40} />
                )}
              </Field>
              <Field label="Mot dans l'adresse" hint="Minuscules, chiffres, tirets : ?categorie=…">
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    name="slug"
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    maxLength={40}
                    spellCheck={false}
                  />
                )}
              </Field>
              <Field label="Ordre" optional hint="Plus petit = plus haut.">
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} name="sort_order" type="number" min={0} max={999} defaultValue={100} />
                )}
              </Field>
            </div>
          </ActionForm>
        </Disclosure>
        <CategoryList categories={active} used={used} />
        {archived.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            <h3 className="flex items-baseline gap-2.5 type-label text-subtle">
              Catégories archivées <span className="type-meta normal-case">{archived.length}</span>
            </h3>
            <p className="max-w-2xl type-small text-muted">Plus proposées aux assos ni affichées dans les filtres. Tu peux les remettre en service.</p>
            <CategoryList categories={archived} used={used} />
          </div>
        )}
      </ManageSection>

      <ManageSection
        title="Rubriques des articles"
        count={activeRubriques.length}
        description={
          <p>
            Les assos choisissent une rubrique parmi celles-ci pour chaque article, et le fil Campus les propose en filtre.
            Archiver une rubrique la retire des choix et du filtre&nbsp;; les articles qui l&apos;ont la gardent.
          </p>
        }
      >
        <Disclosure summary="Nouvelle rubrique" icon="plus" tone="primary">
          <ActionForm action={createPostCategory} submitLabel="Ajouter" resetOnDone>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Nom" hint="Ce que lisent les étudiant·es, ex : « Vie de campus ».">
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} name="label" required minLength={2} maxLength={40} />
                )}
              </Field>
              <Field label="Mot dans l'adresse" hint="Minuscules, chiffres, tirets : /campus?rubrique=… Il ne change plus ensuite.">
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    name="slug"
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    maxLength={40}
                    spellCheck={false}
                    autoCapitalize="off"
                  />
                )}
              </Field>
              <Field label="Ordre" optional hint="Plus petit = plus haut dans les choix et le filtre.">
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} name="sort_order" type="number" min={1} max={999} defaultValue={100} />
                )}
              </Field>
            </div>
          </ActionForm>
        </Disclosure>
        {activeRubriques.length ? (
          <RubriqueList rubriques={activeRubriques} posts={postsBySlug} />
        ) : (
          <ManageEmpty icon="list" title="Aucune rubrique en service">
            <p>Sans rubrique, les articles paraissent quand même, sans filtre par thème. Ajoute-en une ci-dessus.</p>
          </ManageEmpty>
        )}
        {archivedRubriques.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            <h3 className="flex items-baseline gap-2.5 type-label text-subtle">
              Rubriques archivées <span className="type-meta normal-case">{archivedRubriques.length}</span>
            </h3>
            <p className="max-w-2xl type-small text-muted">
              Plus proposées pour les nouveaux articles ni dans le filtre&nbsp;; les articles qui l&apos;ont la gardent. Tu peux les
              remettre en service.
            </p>
            <RubriqueList rubriques={archivedRubriques} posts={postsBySlug} />
          </div>
        )}
      </ManageSection>

      <ManageSection
        title="Catégories de l'agenda"
        count={activeEventCategories.length}
        description={
          <p>
            Les assos en choisissent une pour chaque événement, et l&apos;agenda les propose en filtre. Archiver une catégorie
            la retire des choix et du filtre&nbsp;; les événements qui l&apos;ont la gardent.
          </p>
        }
      >
        <Disclosure summary="Nouvelle catégorie d'événements" icon="plus" tone="primary">
          <ActionForm action={createEventCategory} submitLabel="Ajouter" resetOnDone>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Nom" hint="Ce que lisent les étudiant·es, ex : « Sport ».">
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} name="label" required minLength={2} maxLength={40} />
                )}
              </Field>
              <Field label="Mot dans l'adresse" hint="Minuscules, chiffres, tirets : /events?categorie=… Il ne change plus ensuite.">
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    name="slug"
                    required
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    maxLength={40}
                    spellCheck={false}
                    autoCapitalize="off"
                  />
                )}
              </Field>
              <Field label="Ordre" optional hint="Plus petit = plus haut dans les choix et le filtre.">
                {({ id, describedBy }) => (
                  <Input id={id} aria-describedby={describedBy} name="sort_order" type="number" min={1} max={999} defaultValue={100} />
                )}
              </Field>
            </div>
          </ActionForm>
        </Disclosure>
        {activeEventCategories.length ? (
          <EventCategoryList categories={activeEventCategories} events={eventsBySlug} />
        ) : (
          <ManageEmpty icon="list" title="Aucune catégorie en service">
            <p>Sans catégorie, les événements paraissent quand même, sans filtre par thème. Ajoute-en une ci-dessus.</p>
          </ManageEmpty>
        )}
        {archivedEventCategories.length > 0 && (
          <div className="mt-4 flex flex-col gap-3">
            <h3 className="flex items-baseline gap-2.5 type-label text-subtle">
              Catégories archivées <span className="type-meta normal-case">{archivedEventCategories.length}</span>
            </h3>
            <EventCategoryList categories={archivedEventCategories} events={eventsBySlug} />
          </div>
        )}
      </ManageSection>
    </div>
  );
}

function CategoryList({
  categories,
  used,
}: {
  categories: Awaited<ReturnType<typeof getCategoryCatalog>>;
  used: Map<string, number>;
}) {
  if (categories.length === 0) return <p className="type-small text-muted">Aucune.</p>;
  return (
    <ul className="divide-y divide-line border-y border-line">
      {categories.map((c) => (
        <li key={c.id} className="flex flex-col gap-3 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-bold">{c.label}</span>
              <span className="type-meta text-subtle">
                ?categorie={c.slug} · ordre {c.sort_order}
              </span>
            </p>
            {c.archived ? (
              <StatusBadge tone="neutral">Archivée</StatusBadge>
            ) : (
              <span className="type-meta text-subtle">{plural(used.get(c.slug) ?? 0, "page publique", "pages publiques")}</span>
            )}
          </div>
          <Disclosure summary="Modifier" icon="edit">
            <ActionForm action={updateCategory} hidden={{ category_id: c.id }} submitLabel="Enregistrer">
              <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Field label="Nom">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} name="label" required minLength={2} maxLength={40} defaultValue={c.label} />
                  )}
                </Field>
                <Field label="Ordre">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} name="sort_order" type="number" min={0} max={999} defaultValue={c.sort_order} />
                  )}
                </Field>
              </div>
              <label className="flex min-h-11 items-center gap-3 type-small font-semibold">
                <input type="checkbox" name="archived" defaultChecked={c.archived} className="size-5 accent-current" />
                Archivée (retirée des choix et des filtres)
              </label>
            </ActionForm>
          </Disclosure>
        </li>
      ))}
    </ul>
  );
}

/** The fil's rubriques: name, address word, order, articles online; rename, reorder, archive or bring back. */
function RubriqueList({
  rubriques,
  posts,
}: {
  rubriques: PostCategory[];
  /** Articles online per rubrique (active rubriques only), when the count could be read. */
  posts: Map<string, number> | null;
}) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {rubriques.map((r) => (
        <li key={r.id} className="flex flex-col gap-3 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-bold">{r.label}</span>
              <span className="type-meta text-subtle">
                ?rubrique={r.slug} · ordre {r.sort_order}
              </span>
            </p>
            {r.archived_at ? (
              <StatusBadge tone="neutral">Archivée</StatusBadge>
            ) : posts ? (
              <span className="type-meta text-subtle">{plural(posts.get(r.slug) ?? 0, "article en ligne", "articles en ligne")}</span>
            ) : null}
          </div>
          <Disclosure summary="Modifier" icon="edit">
            <ActionForm action={updatePostCategory} hidden={{ category_id: r.id }} submitLabel="Enregistrer">
              <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Field label="Nom" hint="Change partout, y compris sur les articles déjà parus.">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} name="label" required minLength={2} maxLength={40} defaultValue={r.label} />
                  )}
                </Field>
                <Field label="Ordre">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} name="sort_order" type="number" min={1} max={999} defaultValue={r.sort_order} />
                  )}
                </Field>
              </div>
              <label className="flex min-h-11 items-center gap-3 type-small font-semibold">
                <input type="checkbox" name="archived" value="1" defaultChecked={Boolean(r.archived_at)} className="size-5 accent-current" />
                Archivée (retirée des choix et du filtre, gardée sur les articles qui l&apos;ont)
              </label>
            </ActionForm>
          </Disclosure>
        </li>
      ))}
    </ul>
  );
}

function EventCategoryList({ categories, events }: { categories: EventCategoryRow[]; events: Map<string, number> | null }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {categories.map((c) => (
        <li key={c.id} className="flex flex-col gap-3 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-bold">{c.label}</span>
              <span className="type-meta text-subtle">
                ?categorie={c.slug} · ordre {c.sort_order}
              </span>
            </p>
            {c.archived_at ? (
              <StatusBadge tone="neutral">Archivée</StatusBadge>
            ) : events ? (
              <span className="type-meta text-subtle">{plural(events.get(c.slug) ?? 0, "événement à venir", "événements à venir")}</span>
            ) : null}
          </div>
          <Disclosure summary="Modifier" icon="edit">
            <ActionForm action={updateEventCategory} hidden={{ category_id: c.id }} submitLabel="Enregistrer">
              <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <Field label="Nom" hint="Change partout, y compris sur les événements déjà publiés.">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} name="label" required minLength={2} maxLength={40} defaultValue={c.label} />
                  )}
                </Field>
                <Field label="Ordre">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} name="sort_order" type="number" min={1} max={999} defaultValue={c.sort_order} />
                  )}
                </Field>
              </div>
              <label className="flex min-h-11 items-center gap-3 type-small font-semibold">
                <input type="checkbox" name="archived" value="1" defaultChecked={Boolean(c.archived_at)} className="size-5 accent-current" />
                Archivée (retirée des choix et du filtre, gardée sur les événements qui l&apos;ont)
              </label>
            </ActionForm>
          </Disclosure>
        </li>
      ))}
    </ul>
  );
}
