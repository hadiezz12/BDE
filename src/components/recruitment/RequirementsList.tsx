import { cx } from "@/lib/cx";

/**
 * "Ce qu'on te demandera": printed like a form checklist, empty boxes and
 * all, so nobody discovers a required CV halfway through. Pure markup — used
 * both in the fiche and inside the apply dialog.
 */
export function RequirementsList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={cx("flex flex-col", className)}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-3.5 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
          <span aria-hidden className="mt-[0.3rem] size-4 shrink-0 rounded-xs border-2 border-fg" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
