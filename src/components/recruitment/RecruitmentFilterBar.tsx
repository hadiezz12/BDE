import Form from "next/form";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import {
  VIEW_LABEL,
  VIEW_PARAM,
  recruitmentParams,
  type CampaignView,
  type RecruitmentFacets,
  type RecruitmentFilters,
} from "@/lib/recruitment/model";
import { Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { FilterChips, type FilterOption } from "@/components/ui/FilterChips";

const VIEWS: CampaignView[] = ["current", "open", "closing_soon", "upcoming", "closed"];

/**
 * The directory's filters, all in the URL: what to show as chips (with the
 * counts of what is actually online), then a plain GET form — search, the
 * association and the school year. Works without JavaScript; next/form
 * navigates client-side when it can.
 */
export function RecruitmentFilterBar({
  filters,
  facets,
  className,
}: {
  filters: RecruitmentFilters;
  facets: RecruitmentFacets;
  className?: string;
}) {
  const others = recruitmentParams({ ...filters, view: "current", offset: 0 });
  const counts: Record<CampaignView, number | undefined> = {
    current: facets.current,
    open: facets.open,
    closing_soon: facets.closing_soon,
    upcoming: facets.upcoming,
    closed: facets.closed,
    all: undefined,
  };
  const views: FilterOption[] = VIEWS.map((v) => ({
    value: v === "current" ? null : VIEW_PARAM[v],
    label: VIEW_LABEL[v],
    count: filters.association || filters.year || filters.q ? undefined : counts[v],
  }));

  return (
    <div className={cx("flex flex-col gap-4", className)}>
      <FilterChips
        label="Afficher les recrutements"
        param="vue"
        options={views}
        current={filters.view === "current" ? null : VIEW_PARAM[filters.view]}
        basePath={routes.recruitment}
        params={others}
      />
      <Form action={routes.recruitment} role="search" className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {filters.view !== "current" && <input type="hidden" name="vue" value={VIEW_PARAM[filters.view]} />}
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="type-label text-muted">Chercher</span>
          <span className="relative">
            <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <Input
              key={filters.q}
              name="q"
              type="search"
              defaultValue={filters.q}
              minLength={2}
              maxLength={80}
              placeholder="Ex : trésorerie, communication, nom d'une asso…"
              enterKeyHint="search"
              className="pl-10"
            />
          </span>
        </label>
        {facets.organizations.length > 1 && (
          <label className="flex min-w-0 flex-col gap-1.5 sm:w-56">
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
        {facets.academic_years.length > 1 && (
          <label className="flex min-w-0 flex-col gap-1.5 sm:w-40">
            <span className="type-label text-muted">Année scolaire</span>
            <Select key={filters.year ?? ""} name="annee" defaultValue={filters.year ?? ""}>
              <option value="">Toutes</option>
              {facets.academic_years.map((y) => (
                <option key={y} value={y}>
                  {y.replace("-", "–")}
                </option>
              ))}
            </Select>
          </label>
        )}
        <Button type="submit" variant="secondary" icon="arrow-right" className="sm:self-end">
          Filtrer
        </Button>
      </Form>
    </div>
  );
}
