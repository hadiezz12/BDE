import { PERMISSION_CATEGORY_LABEL, PERMISSION_CATEGORY_ORDER } from "@/lib/governance/labels";
import type { PermissionDefinition } from "@/lib/governance/types";
import { Checkbox } from "@/components/ui/Field";

/**
 * The rights of a position (or of a delegation), grouped the way people
 * think about them: Équipe, Postes, Contenus, Événements… Labels only, never
 * a raw key.
 *  - rights nobody can hand out (presidency succession, platform rights)
 *    are left out entirely;
 *  - a right beyond the person's own (their ceiling) is shown, greyed, and
 *    kept as it is: only the database could change it, and it would refuse;
 *  - rights of modules still to come are marked so; they can be given now
 *    and start working when the module arrives.
 * Inputs are named `permissions` (several values).
 */
export function PermissionPicker({
  catalog,
  selected,
  ceiling,
  mode = "position",
  legend = "Droits du poste",
}: {
  catalog: PermissionDefinition[];
  selected: readonly string[];
  /** Keys the person may hand out (held through a position). */
  ceiling: readonly string[];
  mode?: "position" | "delegation";
  legend?: string;
}) {
  const offered = catalog.filter(
    (p) => p.scope === "organization" && p.is_grantable && (mode === "position" || p.is_delegable),
  );
  const shown = mode === "delegation" ? offered.filter((p) => ceiling.includes(p.key)) : offered;
  const groups = PERMISSION_CATEGORY_ORDER.map((category) => ({
    category,
    items: shown.filter((p) => p.category === category),
  })).filter((g) => g.items.length > 0);

  if (groups.length === 0) {
    return (
      <p className="type-small text-muted">
        {mode === "delegation"
          ? "Aucun de tes droits ne peut être délégué (les droits sensibles et ceux qui gèrent l'équipe se donnent par un poste)."
          : "Aucun droit à choisir."}
      </p>
    );
  }

  return (
    <fieldset className="flex flex-col gap-5">
      <legend className="mb-1 text-[0.95rem] font-bold">{legend}</legend>
      {groups.map(({ category, items }) => (
        <div key={category} className="flex flex-col gap-1.5">
          <p className="type-label text-subtle">{PERMISSION_CATEGORY_LABEL[category] ?? category}</p>
          <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {items.map((p) => {
              const isSelected = selected.includes(p.key);
              const allowed = ceiling.includes(p.key);
              const notes = [
                !allowed && "au-delà de tes droits : inchangé",
                !p.module_ready && "module à venir",
                p.is_sensitive && "données personnelles",
              ].filter(Boolean);
              return (
                <div key={p.key}>
                  <Checkbox
                    name="permissions"
                    value={p.key}
                    defaultChecked={isSelected}
                    disabled={!allowed}
                    label={p.label}
                    description={
                      <>
                        {p.description}
                        {notes.length > 0 && <span className="block text-subtle">({notes.join(" · ")})</span>}
                      </>
                    }
                  />
                  {/* A disabled box is not sent: keep what the person cannot change. */}
                  {!allowed && isSelected && <input type="hidden" name="permissions" value={p.key} />}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </fieldset>
  );
}
