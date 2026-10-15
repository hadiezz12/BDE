import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export interface SetupStep {
  key: string;
  /** What to do, as an instruction: "Présente le bureau". */
  label: string;
  /** Why, from what is actually missing. */
  detail: string;
  href: string;
}

/**
 * What the association's public page still lacks, derived from its profile
 * (no bureau listed, no contact, no cover…). Ruled lines like the to-do list,
 * each one link to the section where it gets filled. Nothing is invented:
 * a step exists only because a field is empty.
 */
export function SetupList({ steps }: { steps: SetupStep[] }) {
  return (
    <ol className="border-b border-line">
      {steps.map((s, i) => (
        <li
          key={s.key}
          className="group relative grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-4 border-t border-line py-4 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]"
        >
          <span aria-hidden className="type-numeral pt-0.5 text-[2.1rem] text-subtle">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Link
              href={s.href}
              className="font-bold leading-snug after:absolute after:inset-0 after:content-[''] group-hover:text-assoc-text"
            >
              {s.label}
            </Link>
            <p className="type-small text-muted">{s.detail}</p>
          </div>
          <Icon
            name="arrow-right"
            size={18}
            className="hidden self-center text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg sm:block"
          />
        </li>
      ))}
    </ol>
  );
}
