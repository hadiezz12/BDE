import { setMyInterests } from "@/app/actions/saved";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";

/**
 * Optional interests, from the association categories the BDE keeps (no
 * other taxonomy, nothing inferred). Ticking none removes them all. Private
 * to the student (public.set_my_interests; nobody else reads them).
 */
export function InterestsForm({
  categories,
  chosen,
}: {
  categories: { slug: string; label: string }[];
  chosen: string[];
}) {
  if (categories.length === 0) return null;
  const selected = new Set(chosen);
  return (
    <Disclosure summary={chosen.length ? "Changer mes centres d'intérêt" : "Choisir des centres d'intérêt"} icon="edit">
      <ActionForm action={setMyInterests} submitLabel="Enregistrer mes choix" variant="secondary" size="sm">
        <fieldset className="flex flex-col gap-3">
          <legend className="type-small text-muted">
            Facultatif, huit au plus. Seulement pour toi&nbsp;: aucune asso ni le BDE ne les voit, et rien n&apos;est
            déduit de ce que tu lis ou de tes candidatures.
          </legend>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <label
                key={c.slug}
                className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-sm border-2 border-line-strong/60 px-3 type-button text-[0.78rem] has-checked:border-fg has-checked:bg-fg has-checked:text-bg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent"
              >
                <input type="checkbox" name="interest" value={c.slug} defaultChecked={selected.has(c.slug)} className="sr-only" />
                {c.label}
              </label>
            ))}
          </div>
        </fieldset>
      </ActionForm>
    </Disclosure>
  );
}
