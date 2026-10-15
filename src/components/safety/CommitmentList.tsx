import type { SafetyCommitment } from "@/lib/types";
import { cx } from "@/lib/cx";

/**
 * "Ce à quoi nous nous tenons": the BDE's VSS / VDH commitments as a ruled
 * list with their own numbers (01 → 06) in big amber numerals — a charter,
 * not a card grid. One column on phones, two from md. A real ordered list;
 * the printed numbers are decoration.
 */
export function CommitmentList({
  commitments,
  className,
}: {
  commitments: SafetyCommitment[];
  className?: string;
}) {
  if (!commitments.length) return null;
  return (
    <ol className={cx("grid border-b border-line md:grid-cols-2 md:gap-x-12", className)}>
      {commitments.map((c) => (
        <li
          key={c.number}
          className="grid grid-cols-[3rem_minmax(0,1fr)] gap-4 border-t border-line py-6 sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-5"
        >
          <span aria-hidden className="type-numeral text-[2.5rem] leading-none text-warn sm:text-[3.25rem]">
            {c.number}
          </span>
          <div className="flex flex-col gap-1.5">
            <h3 className="text-[1.1rem] font-bold leading-snug">{c.title}</h3>
            <p className="text-muted">{c.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
