import Link from "next/link";
import type { EventItem, MemberCardOffer, PostItem, UserProfile } from "@/lib/types";
import { routes } from "@/lib/routes";
import { formatDayMonth, formatDayShort, plural } from "@/lib/format";
import { MemberCard } from "@/components/brand/MemberCard";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { Icon } from "@/components/ui/Icon";

/** "8 €", with a non-breaking space so the sign never wraps alone. */
const eur = (n: number) => `${n.toLocaleString("fr-FR")} €`;

type Priced = EventItem & { price: { member: number; standard: number } };

/**
 * The BDE's carte cotisante, on paper: the 3D card (the student's own when
 * they hold one), then what it changes in euros, ticket by ticket, computed
 * from the BDE's upcoming events — no slogan, the arithmetic. Anchored at
 * #carte (the footer links here). Nothing is sold online in this phase: the
 * card is bought at the permanence.
 */
export function MemberCardSection({
  offer,
  events,
  user,
  story,
  index,
}: {
  offer: MemberCardOffer;
  /** The BDE's upcoming events, chronological. */
  events: EventItem[];
  user: UserProfile | null;
  /** The campus post explaining the price, when published. */
  story: PostItem | null;
  /** Running section number. */
  index: string;
}) {
  const card = user?.memberCard;
  const priced = events.filter(
    (e): e is Priced => e.price !== null && e.price.member !== undefined && e.price.member < e.price.standard,
  );
  const sum = (key: "member" | "standard") => priced.reduce((n, e) => n + e.price[key], 0);
  const saved = sum("standard") - sum("member");

  // How many of the next dates it takes for the card to pay for itself.
  const paidBy: Priced[] = [];
  let paidSaving = 0;
  for (const e of priced) {
    if (paidSaving >= offer.price) break;
    paidBy.push(e);
    paidSaving += e.price.standard - e.price.member;
  }
  if (paidSaving < offer.price) paidBy.length = 0;

  return (
    <section id="carte" aria-labelledby="carte-titre" data-surface="paper" className="grain mt-section py-section">
      <div className="wrap grid gap-x-12 gap-y-12 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:sticky lg:top-[calc(var(--header-h)+2rem)] lg:col-span-5 lg:self-start">
          <MemberCard
            season={card?.season ?? offer.season}
            holder={card && user ? `${user.firstName} ${user.lastName}` : undefined}
            number={card?.number}
            validUntilLabel={card ? `Valable jusqu'au ${formatDayMonth(card.validUntil)}` : undefined}
            price={offer.price}
            className="w-full max-w-[30rem]"
          />
          <p className="max-w-[30rem] type-small text-muted">
            {card ? (
              <>
                <span className="font-bold text-fg">Ta carte {card.season} est active.</span> Montre-la à
                l&apos;entrée avec ta carte étudiante : le tarif adhérent s&apos;applique déjà sur tes billets.
              </>
            ) : user ? (
              <>Tu n&apos;as pas encore ta carte cette année. {offer.where}</>
            ) : (
              <>
                Déjà cotisant·e ?{" "}
                <Link href={routes.login} className="link font-semibold text-fg">
                  Connecte-toi
                </Link>{" "}
                pour afficher ta carte ici.
              </>
            )}
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-12 lg:col-span-6 lg:col-start-7">
          <SectionHeader
            id="carte-titre"
            index={index}
            kicker={`Carte cotisante · ${offer.season}`}
            title={`${offer.price} € pour toute l'année`}
            description={`Prise une fois, valable jusqu'au ${formatDayMonth(offer.validUntil)}. Elle ne donne pas accès à une soirée : elle fait baisser le prix de toutes.`}
          />

          <ul className="border-b border-line">
            {offer.perks.map((perk) => (
              <li key={perk} className="flex items-start gap-3 border-t border-line py-3.5">
                <Icon name="check" size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-accent-text" />
                <span>{perk}</span>
              </li>
            ))}
          </ul>

          {priced.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="border-t-2 border-fg pt-3 type-label text-muted">Billet par billet</h3>
              <table className="w-full border-collapse text-left">
                <caption className="sr-only">
                  Prix des prochains événements du BDE, avec et sans la carte cotisante
                </caption>
                <thead>
                  <tr className="type-label text-muted">
                    <th scope="col" className="pb-2.5 pr-3 align-bottom font-bold">
                      Événement
                    </th>
                    <th scope="col" className="px-2 pb-2.5 text-right align-bottom font-bold">
                      Avec la carte
                    </th>
                    <th scope="col" className="px-2 pb-2.5 text-right align-bottom font-bold">
                      Sans
                    </th>
                    <th scope="col" className="pb-2.5 pl-2 text-right align-bottom font-bold">
                      Écart
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {priced.map((e) => (
                    <tr key={e.id} className="border-t border-line">
                      <th scope="row" className="py-3 pr-3 text-left align-top font-normal">
                        <Link href={routes.event(e.slug)} className="font-bold leading-snug hover:underline">
                          {e.title}
                        </Link>
                        <span className="mt-0.5 block type-meta text-muted">
                          <time dateTime={e.startsAt}>{formatDayShort(e.startsAt)}</time>
                        </span>
                      </th>
                      <td className="whitespace-nowrap px-2 py-3 text-right align-top type-meta font-bold">
                        {eur(e.price.member)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 text-right align-top type-meta text-muted">
                        {eur(e.price.standard)}
                      </td>
                      <td className="whitespace-nowrap py-3 pl-2 text-right align-top type-meta font-bold text-accent-text">
                        −{eur(e.price.standard - e.price.member)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-fg">
                    <th scope="row" className="py-3 pr-3 text-left align-top font-bold">
                      Les {plural(priced.length, "date")}
                    </th>
                    <td className="whitespace-nowrap px-2 py-3 text-right align-top type-meta font-bold">
                      {eur(sum("member"))}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right align-top type-meta text-muted">
                      {eur(sum("standard"))}
                    </td>
                    <td className="whitespace-nowrap py-3 pl-2 text-right align-top type-meta font-bold text-accent-text">
                      −{eur(saved)}
                    </td>
                  </tr>
                </tfoot>
              </table>
              <p className="type-lead">
                {paidBy.length === 1 ? (
                  <>
                    Dès le premier billet ({paidBy[0].title}), tu économises {eur(paidSaving)} : plus que les{" "}
                    {eur(offer.price)} de la carte.
                  </>
                ) : paidBy.length > 1 ? (
                  <>
                    Au {paidBy.length}e billet ({paidBy[paidBy.length - 1].title}, le{" "}
                    {formatDayShort(paidBy[paidBy.length - 1].startsAt)}), tu as déjà économisé {eur(paidSaving)} :
                    plus que les {eur(offer.price)} de la carte.
                  </>
                ) : (
                  <>
                    Sur ces {plural(priced.length, "date")}, la carte te fait économiser {eur(saved)}, pour{" "}
                    {eur(offer.price)}.
                  </>
                )}
              </p>
            </div>
          )}

          <div className="grid gap-8 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <h3 className="border-t-2 border-fg pt-3 type-label text-muted">Où la prendre</h3>
              <p className="font-semibold">{offer.where}</p>
              <p className="type-small text-muted">{offer.payment}</p>
            </div>
            {offer.note && (
              <div className="flex flex-col gap-2">
                <h3 className="border-t-2 border-fg pt-3 type-label text-muted">Et sans carte ?</h3>
                <p>{offer.note}</p>
              </div>
            )}
          </div>

          {story && (
            <Link
              href={routes.post(story.slug)}
              className="group inline-flex min-h-10 items-center gap-1.5 self-start type-label hover:text-accent-text"
            >
              À lire : {story.title}
              <Icon name="arrow-right" size={14} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
