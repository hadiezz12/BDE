import Link from "next/link";
import { cx } from "@/lib/cx";
import { routes } from "@/lib/routes";
import { Icon } from "@/components/ui/Icon";

const SAFETY = /\b(VSS|VDH)\b/;

/**
 * The event's practical lines as a ruled list ("Départ à 20h30 précises…",
 * "Vestiaire 2 €"). Lines about the VSS / VDH referents get the amber shield
 * (amber is reserved for safety) and the list ends with a link to the
 * safety page, so nobody has to look for it at 2 a.m.
 */
export function PracticalList({ items, className }: { items: string[]; className?: string }) {
  const mentionsSafety = items.some((line) => SAFETY.test(line));
  return (
    <div className={cx("flex flex-col gap-5", className)}>
      <ul className="border-b border-line">
        {items.map((line) => {
          const safety = SAFETY.test(line);
          return (
            <li key={line} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 border-t border-line py-3.5">
              {safety ? (
                <Icon name="shield" size={18} className="mt-0.5 text-warn" />
              ) : (
                <span aria-hidden className="mt-[0.7rem] block h-0.5 w-3 bg-assoc" />
              )}
              <p className={cx(safety && "font-semibold")}>{line}</p>
            </li>
          );
        })}
      </ul>
      {mentionsSafety && (
        <Link
          href={routes.safety}
          className="inline-flex items-center gap-1.5 self-start type-small font-bold text-warn hover:underline"
        >
          Nos engagements VSS / VDH et le canal d&apos;alerte
          <Icon name="arrow-right" size={15} className="shrink-0" />
        </Link>
      )}
    </div>
  );
}
