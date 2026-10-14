import type { ReactNode } from "react";

export interface SafetyStep {
  title: string;
  body: ReactNode;
}

/**
 * "What to do now", as a short ruled checklist with big amber numerals. A
 * real ordered list, so the order is announced; the numerals are decoration.
 */
export function StepList({ id, title, steps }: { id: string; title: string; steps: SafetyStep[] }) {
  return (
    <section aria-labelledby={id}>
      <h3 id={id} className="type-headline">
        {title}
      </h3>
      <ol className="mt-6 border-b border-line">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-4 border-t border-line py-5 sm:grid-cols-[3.25rem_minmax(0,1fr)] sm:gap-5"
          >
            <span aria-hidden className="type-numeral text-[2.5rem] text-warn sm:text-[3rem]">
              {i + 1}
            </span>
            <div className="flex flex-col gap-1.5">
              <p className="text-[1.05rem] font-bold leading-snug">{step.title}</p>
              <div className="text-muted">{step.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
