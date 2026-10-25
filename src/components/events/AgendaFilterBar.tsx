import Form from "next/form";
import Link from "next/link";
import type { EventLocationType } from "@/lib/types";
import type { EventFacets } from "@/lib/events/model";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import {
  AVAILABILITY_LABEL,
  PLACE_LABEL,
  WHEN_CHIPS,
  WHEN_LABEL,
  agendaParams,
  availabilityParam,
  hasRefinement,
  isFiltered,
  placeParam,
  whenParam,
  type AgendaAvailability,
  type AgendaFilters,
} from "@/lib/events/filters";
import { Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { FilterChips, type FilterOption } from "@/components/ui/FilterChips";

const PLACES: EventLocationType[] = ["campus", "external", "online"];
const AVAILABILITIES: AgendaAvailability[] = ["registration_open", "no_registration"];

/**
 * The agenda's filters, all in the URL: the period as chips (one tap), then
 * a plain GET form — search always in view, the rest (category, association,
 * place, registration, chosen days) behind "Plus de filtres" on phones,
 * opened when one of them is set. Works without JavaScript; next/form
 * navigates client-side when it can. Categories, associations and places
 * come from what is actually on the agenda, with their counts.
 */
export function AgendaFilterBar({
  filters,
  facets,
  base = routes.events,
  className,
}: {
  filters: AgendaFilters;
  facets: EventFacets;
  base?: string;
  className?: string;
}) {
  const others = Object.fromEntries(agendaParams({ ...filters, when: "upcoming" }));
  const periods: FilterOption[] = WHEN_CHIPS.map((w) => ({ value: whenParam(w), label: WHEN_LABEL[w] }));
  // Chosen days: no chip is current (the dates are in the form below).
  const current = filters.when === "range" ? "dates" : whenParam(filters.when);
  const refined = Boolean(filters.category || filters.association || filters.place || filters.availability || filters.when === "range");
  const categories = facets.categories.length > 0 ? facets.categories : facets.categories_all.map((c) => ({ ...c, count: 0 }));

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <FilterChips label="Filtrer par période" param="quand" options={periods} current={current} basePath={base} params={others} />
      <Form action={base} role="search" className="flex flex-col gap-3">
        {filters.when !== "upcoming" && filters.when !== "range" && (
          <input type="hidden" name="quand" value={whenParam(filters.when) ?? ""} />
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="type-label text-muted">Chercher un événement</span>
            <span className="relative">
              <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
              <Input
                key={filters.q}
                name="q"
                type="search"
                defaultValue={filters.q}
                minLength={2}
                maxLength={80}
                placeholder="Ex : tournoi, atelier, nom d'une asso…"
                enterKeyHint="search"
                className="pl-10"
              />
            </span>
          </label>
          <Button type="submit" variant="secondary" icon="arrow-right" className="sm:self-end">
            Filtrer
          </Button>
        </div>

        <details open={refined} className="group border-y border-line">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 type-label [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <Icon name="sliders" size={16} />
              Plus de filtres
            </span>
            <Icon name="chevron-down" size={16} className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="grid gap-3 pb-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.length > 0 && (
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="type-label text-muted">Catégorie</span>
                <Select key={filters.category ?? ""} name="categorie" defaultValue={filters.category ?? ""}>
                  <option value="">Toutes</option>
                  {categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                      {c.count > 0 ? ` (${c.count})` : ""}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            {facets.organizations.length > 0 && (
              <label className="flex min-w-0 flex-col gap-1.5">
                <span className="type-label text-muted">Association</span>
                <Select key={filters.association ?? ""} name="asso" defaultValue={filters.association ?? ""}>
                  <option value="">Toutes</option>
                  {facets.organizations.map((o) => (
                    <option key={o.slug} value={o.slug}>
                      {o.short_name ?? o.name} ({o.count})
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="type-label text-muted">Lieu</span>
              <Select key={filters.place ?? ""} name="lieu" defaultValue={filters.place ? placeParam(filters.place) : ""}>
                <option value="">Partout</option>
                {PLACES.map((p) => (
                  <option key={p} value={placeParam(p)}>
                    {PLACE_LABEL[p]}
                    {facets.location_types[p] ? ` (${facets.location_types[p]})` : ""}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="type-label text-muted">Inscription</span>
              <Select
                key={filters.availability ?? ""}
                name="dispo"
                defaultValue={filters.availability ? availabilityParam(filters.availability) : ""}
              >
                <option value="">Peu importe</option>
                {AVAILABILITIES.map((a) => (
                  <option key={a} value={availabilityParam(a)}>
                    {AVAILABILITY_LABEL[a]}
                  </option>
                ))}
              </Select>
            </label>
            <fieldset className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
              <legend className="mb-1.5 type-label text-muted">Entre deux dates</legend>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="type-caption">Du</span>
                  <Input key={`du-${filters.from}`} name="du" type="date" defaultValue={filters.from ?? ""} />
                </label>
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="type-caption">Au</span>
                  <Input key={`au-${filters.to}`} name="au" type="date" defaultValue={filters.to ?? ""} />
                </label>
              </div>
            </fieldset>
          </div>
        </details>

        {isFiltered(filters) && (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 type-small text-muted">
            {hasRefinement(filters) || filters.when === "range" ? "Filtres actifs." : null}
            <Link href={base} className="link font-bold text-fg">
              Tout effacer
            </Link>
          </p>
        )}
      </Form>
    </div>
  );
}
