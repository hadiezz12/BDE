import Image from "next/image";
import type { EventSeries } from "@/lib/types";
import { Marquee } from "@/components/brand/Marquee";

/**
 * The maquette's carousel ticker, fed with the BDE's 8 events of the year:
 * each name with its small emblem and what it is, in the emblem's colour.
 * Plain text on purpose — the copy row is hidden from assistive tech, so it
 * must hold no links; the programme below carries them. Below three items
 * the loop would show its seam, so it stays off.
 */
export function YearTicker({ series, className }: { series: EventSeries[]; className?: string }) {
  if (series.length < 3) return null;

  const items = series.map((s) => (
    <span key={s.id} data-accent={s.accent} className="flex items-center gap-3 whitespace-nowrap">
      <Image src={s.emblem} alt="" width={40} height={40} className="size-8 rounded-full sm:size-10" />
      <span className="type-headline text-[clamp(1.3rem,1rem+1.2vw,2.05rem)]">{s.name}</span>
      <span className="type-label text-assoc-text">{s.subtitle}</span>
    </span>
  ));

  return (
    <div className={className}>
      <Marquee
        items={items}
        label="Les 8 événements de l'année"
        duration={Math.max(40, series.length * 8)}
        className="border-y border-line py-4 sm:py-5"
      />
    </div>
  );
}
