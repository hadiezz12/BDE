import Form from "next/form";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * Text filter of the associations index: a plain GET form on the same page
 * (works without JavaScript; next/form adds client-side navigation). The
 * active category rides along as a hidden field so typing never resets it.
 * Keyed on the query so the field follows the URL after "Tout effacer".
 */
export function AssociationSearchForm({
  query,
  category,
  className,
}: {
  query: string;
  category: string | null;
  className?: string;
}) {
  return (
    <Form action={routes.associations} role="search" className={cx("flex items-stretch gap-2", className)}>
      {category && <input type="hidden" name="categorie" value={category} />}
      <div className="relative min-w-0 flex-1">
        <label htmlFor="assos-q" className="sr-only">
          Chercher une association par nom ou par activité
        </label>
        <Icon
          name="search"
          size={20}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-accent-text"
        />
        <Input
          key={query}
          id="assos-q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Escalade, radio, conseil…"
          autoComplete="off"
          enterKeyHint="search"
          spellCheck={false}
          maxLength={60}
          className="h-full pl-11 font-semibold"
        />
      </div>
      <Button type="submit" variant="secondary" icon="arrow-right">
        <span className="max-sm:sr-only">Filtrer</span>
      </Button>
    </Form>
  );
}
