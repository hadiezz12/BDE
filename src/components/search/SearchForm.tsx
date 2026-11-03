import Form from "next/form";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * The /search field: a plain GET form (works without JavaScript; next/form
 * adds client-side navigation when it is there). The chosen type and its
 * filters ride along as hidden fields, so a new query stays in the same
 * tab. The button sets the row height and the field stretches to it. Keyed
 * on the query so the field shows the new words after a suggestion link.
 */
export function SearchForm({
  query,
  keep = {},
  className,
}: {
  query: string;
  /** Other parameters of the current search to keep (type, filters). */
  keep?: Record<string, string>;
  className?: string;
}) {
  return (
    <Form action={routes.search} role="search" className={cx("flex items-stretch gap-2 sm:gap-3", className)}>
      {Object.entries(keep).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <div className="relative min-w-0 flex-1">
        <label htmlFor="recherche-q" className="sr-only">
          Rechercher une association, un événement, un recrutement ou un article
        </label>
        <Icon
          name="search"
          size={22}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-accent-text"
        />
        <Input
          key={query}
          id="recherche-q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Asso, événement, poste, article…"
          autoComplete="off"
          enterKeyHint="search"
          spellCheck={false}
          maxLength={80}
          className="h-full pl-12 text-[1.1rem] font-semibold sm:text-[1.25rem]"
        />
      </div>
      <Button type="submit" size="lg" icon="arrow-right" className="sm:min-h-16">
        <span className="max-sm:sr-only">Chercher</span>
      </Button>
    </Form>
  );
}
