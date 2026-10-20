import type { Metadata } from "next";
import { getMyAccess } from "@/lib/governance/access";
import { getCategoryCatalog } from "@/lib/associations/categories";
import { getPublicCategories } from "@/lib/data/associations";
import { plural } from "@/lib/format";
import { createCategory, updateCategory } from "@/app/actions/association-page";
import { Field, Input } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";

export const metadata: Metadata = { title: "Catégories" };

/**
 * /manage/plateforme/categories — the directory's categories, maintained by
 * the BDE's leadership (platform.organizations.manage, second factor). Each
 * association picks up to three of them for its page. A category is never
 * deleted: archiving takes it out of the choices and the filters, and the
 * pages that used it keep their other categories.
 */
export default async function PlatformCategoriesPage() {
  const [catalog, counts, access] = await Promise.all([getCategoryCatalog(), getPublicCategories(), getMyAccess()]);
  const canEdit = Boolean(access?.platform.includes("platform.organizations.manage"));
  const used = new Map(counts.map((c) => [c.slug, c.count]));
  const active = catalog.filter((c) => !c.archived);
  const archived = catalog.filter((c) => c.archived);

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker="Centre de contrôle BDE"
        title="Catégories"
        description={
          <p>
            Les filtres de la page Associations. Chaque asso en choisit jusqu&apos;à trois. Un nom clair et court se lit
            mieux qu&apos;une longue liste&nbsp;: une dizaine suffit.
          </p>
        }
      />

      {canEdit && (
        <ManageSection title="Ajouter une catégorie">
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
        </ManageSection>
      )}

      <ManageSection title="En service" count={active.length}>
        <CategoryList categories={active} used={used} canEdit={canEdit} />
      </ManageSection>

      {archived.length > 0 && (
        <ManageSection
          title="Archivées"
          count={archived.length}
          description={<p>Plus proposées aux assos ni affichées dans les filtres. Tu peux les remettre en service.</p>}
        >
          <CategoryList categories={archived} used={used} canEdit={canEdit} />
        </ManageSection>
      )}
    </div>
  );
}

function CategoryList({
  categories,
  used,
  canEdit,
}: {
  categories: Awaited<ReturnType<typeof getCategoryCatalog>>;
  used: Map<string, number>;
  canEdit: boolean;
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
          {canEdit && (
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
          )}
        </li>
      ))}
    </ul>
  );
}
