import type { Association } from "@/lib/types";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { AssociationTile } from "@/components/associations/AssociationTile";
import { recruitingSticker } from "@/components/associations/association-facts";

/**
 * Every association as a rail of flyers on the paper surface (BDE first, as
 * the index orders them). A tile only wears a sticker for a fact the page
 * already knows: it recruits right now, with how many places.
 */
export function AssociationsRail({
  associations,
  recruitingSeats,
  index,
}: {
  associations: Association[];
  /** Open seats per association id, from the open campaigns. */
  recruitingSeats: Map<string, number>;
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
          description="Du five entre potes à la chambre noire, de la Junior-Entreprise à la radio du B-14 : chaque asso dit qui elle est, quand elle se réunit et comment la rejoindre."
        />
        <ul className="rail mt-10 py-2">
          {associations.map((a) => {
            const seats = recruitingSeats.get(a.id);
            return (
              <li key={a.id} className="w-[15rem] sm:w-[16.5rem]">
                <AssociationTile
                  association={a}
                  sticker={seats !== undefined ? recruitingSticker(seats) : undefined}
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
