import type { Association } from "@/lib/types";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { AssociationTile } from "@/components/associations/AssociationTile";
import { recruitingSticker } from "@/components/associations/association-facts";

/**
 * The associations as a rail of flyers on the paper surface (BDE first, as
 * the index orders them). A tile only wears a sticker for a fact the page
 * already knows: it recruits right now, with how many places. The caller
 * only renders it once associations other than the BDE have their page:
 * a rail of one would be noise (the BDE has its own section).
 */
export function AssociationsRail({
  associations,
  recruitingSeats,
  index,
}: {
  associations: Association[];
  /** Open recruitment per association id: its places, or null when a position did not say. */
  recruitingSeats: Map<string, number | null>;
  index?: string;
}) {
  if (associations.length === 0) return null;

  return (
    <div data-surface="paper" className="grain">
      <section aria-labelledby="les-assos" className="wrap py-section">
        <SectionHeader
          id="les-assos"
          index={index}
          kicker={plural(associations.length, "association")}
          title="Trouve ta bande"
          action={{ href: routes.associations, label: "Toutes les assos" }}
          description="Chaque asso dit qui elle est, quand elle se réunit et comment la rejoindre."
        />
        <ul className="rail mt-10 py-2">
          {associations.map((a) => {
            const recruiting = recruitingSeats.has(a.id);
            const seats = recruitingSeats.get(a.id) ?? undefined;
            return (
              <li key={a.id} className="w-[15rem] sm:w-[16.5rem]">
                <AssociationTile
                  association={a}
                  sticker={recruiting ? recruitingSticker(seats) : undefined}
                  sizes="(min-width: 640px) 16.5rem, 15rem"
                  className="h-full"
                />
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
