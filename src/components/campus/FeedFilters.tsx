import Form from "next/form";
import Link from "next/link";
import type { PostKind } from "@/lib/types";
import type { PostFacets } from "@/lib/posts/model";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { FilterChips, type FilterOption } from "@/components/ui/FilterChips";
import { POST_KINDS, POST_KIND_PLURAL } from "./labels";

export interface FeedFilterValues {
  kind: PostKind | null;
  category: string | null;
  association: string | null;
  q: string;
}

/**
 * The fil's filters, all in the URL so a filtered page can be shared:
 * the kind as chips (one click), then search, association and rubrique in a
 * plain GET form (works without JavaScript; next/form navigates client-side
 * when it can). Only associations and rubriques that have published posts
 * are offered, with their counts.
 */
export function FeedFilters({ values, facets, className }: { values: FeedFilterValues; facets: PostFacets; className?: string }) {
  const kinds: FilterOption[] = [
    { value: null, label: "Tout", count: facets.total },
    ...POST_KINDS.filter((k) => (facets.kinds[k] ?? 0) > 0).map((k) => ({
      value: k,
      label: POST_KIND_PLURAL[k],
      count: facets.kinds[k] ?? 0,
    })),
  ];
  const keep = {
    q: values.q || undefined,
    asso: values.association ?? undefined,
    rubrique: values.category ?? undefined,
  };
  const filtered = Boolean(values.kind || values.category || values.association || values.q);

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      {kinds.length > 2 && (
        <FilterChips label="Filtrer par type" param="kind" options={kinds} current={values.kind} basePath={routes.campus} params={keep} />
      )}
      <Form action={routes.campus} role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
        {values.kind && <input type="hidden" name="kind" value={values.kind} />}
        <label className="flex min-w-0 flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
          <span className="type-label text-muted">Chercher dans le fil</span>
          <span className="relative">
            <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <Input
              key={values.q}
              name="q"
              type="search"
              defaultValue={values.q}
              minLength={2}
              maxLength={80}
              placeholder="Ex : tournoi, assemblée générale…"
              enterKeyHint="search"
              className="pl-10"
            />
          </span>
        </label>
        {facets.organizations.length > 1 && (
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="type-label text-muted">Association</span>
            <Select key={values.association ?? ""} name="asso" defaultValue={values.association ?? ""}>
              <option value="">Toutes</option>
              {facets.organizations.map((o) => (
                <option key={o.slug} value={o.slug}>
                  {o.short_name ?? o.name} ({o.count})
                </option>
              ))}
            </Select>
          </label>
        )}
        {facets.categories.length > 0 && (
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="type-label text-muted">Rubrique</span>
            <Select key={values.category ?? ""} name="rubrique" defaultValue={values.category ?? ""}>
              <option value="">Toutes</option>
              {facets.categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label} ({c.count})
                </option>
              ))}
            </Select>
          </label>
        )}
        <div className="flex items-center gap-3">
          <Button type="submit" variant="secondary" icon="arrow-right">
            Filtrer
          </Button>
          {filtered && (
            <Link href={routes.campus} className="link type-small whitespace-nowrap">
              Tout effacer
            </Link>
          )}
        </div>
      </Form>
    </div>
  );
}
