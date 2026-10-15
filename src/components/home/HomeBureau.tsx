import type { Association } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { SectionHeader } from "@/components/layout/SectionHeader";

/**
 * "Le bureau qui produit toute l'année", on paper: the BDE's own intro and
 * its three pillars, numbered like the clauses of a manifesto (ruled rows,
 * no icon cards). Everything comes from the BDE's association record.
 */
export function HomeBureau({ bde, index, className }: { bde: Association; index?: string; className?: string }) {
  const intro = bde.description[0];
  const pillars = bde.pillars ?? [];
  if (!intro && pillars.length === 0) return null;

  return (
    <div data-surface="paper" className={cx("grain", className)}>
      <section aria-labelledby="le-bureau" className="wrap grid gap-x-8 gap-y-10 py-section lg:grid-cols-12">
        <SectionHeader
          id="le-bureau"
          index={index}
          kicker={bde.kind}
          title="Le bureau qui produit toute l'année"
          action={{ href: routes.association(bde.slug), label: `Le ${bde.name}` }}
          className="lg:col-span-12"
        />
        {intro && <p className="max-w-2xl type-lead lg:col-span-5">{intro}</p>}
        {pillars.length > 0 && (
          <ol className="border-b border-line lg:col-span-6 lg:col-start-7">
            {pillars.map((p, i) => (
              <li key={p.title} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-4 border-t border-line py-5 sm:grid-cols-[4rem_minmax(0,1fr)]">
                <span aria-hidden className="type-numeral text-[2.2rem] text-accent-text sm:text-[2.6rem]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex min-w-0 flex-col gap-1.5">
                  <h3 className="type-card text-[1.2rem] leading-snug sm:text-[1.35rem]">{p.title}</h3>
                  <p className="text-muted">{p.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
