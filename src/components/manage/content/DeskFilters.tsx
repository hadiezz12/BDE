import Form from "next/form";
import Link from "next/link";
import { POST_KINDS } from "@/lib/posts/model";
import { routes } from "@/lib/routes";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Input, Select } from "@/components/ui/Field";
import { POST_KIND_PLURAL } from "@/components/campus/labels";
import { DESK_SORTS, deskHref, type DeskQuery } from "./desk";

/**
 * Search, kind and order of the desk, in a plain GET form: works without
 * JavaScript, next/form navigates client-side when it can, and the result is
 * a URL that can be shared. The current tab rides along as a hidden field.
 * Defaults are sent as empty values, so the plain URL stays the default view.
 */
export function DeskFilters({ asso, query }: { asso: string; query: DeskQuery }) {
  const filtered = Boolean(query.q || query.kind || query.sort !== "modifie");
  return (
    <Form
      action={routes.manageContent(asso)}
      role="search"
      aria-label="Chercher dans les articles"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end"
    >
      {query.view !== "tous" && <input type="hidden" name="vue" value={query.view} />}
      <label className="flex min-w-0 flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
        <span className="type-label text-muted">Chercher</span>
        <span className="relative">
          <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
          <Input
            key={query.q}
            name="q"
            type="search"
            defaultValue={query.q}
            maxLength={80}
            placeholder="Titre, mot-clé, auteur ou autrice"
            autoComplete="off"
            enterKeyHint="search"
            className="pl-10"
          />
        </span>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="type-label text-muted">Type</span>
        <Select key={query.kind ?? ""} name="type" defaultValue={query.kind ?? ""}>
          <option value="">Tous les types</option>
          {POST_KINDS.map((k) => (
            <option key={k} value={k}>
              {POST_KIND_PLURAL[k]}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex min-w-0 flex-col gap-1.5">
        <span className="type-label text-muted">Trier par</span>
        <Select key={query.sort} name="tri" defaultValue={query.sort === "modifie" ? "" : query.sort}>
          {DESK_SORTS.map((s) => (
            <option key={s.key} value={s.key === "modifie" ? "" : s.key}>
              {s.label}
            </option>
          ))}
        </Select>
      </label>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:col-span-2 lg:col-span-1">
        <Button type="submit" variant="secondary" icon="arrow-right">
          Filtrer
        </Button>
        {filtered && (
          <Link href={deskHref(asso, { view: query.view })} className="link type-small whitespace-nowrap">
            Tout effacer
          </Link>
        )}
      </div>
    </Form>
  );
}
