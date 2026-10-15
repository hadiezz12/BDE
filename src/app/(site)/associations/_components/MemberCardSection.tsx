import Link from "next/link";
import type { MemberCardOffer, UserProfile } from "@/lib/types";
import { routes } from "@/lib/routes";
import { formatDayMonth } from "@/lib/format";
import { MemberCard } from "@/components/brand/MemberCard";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { Icon } from "@/components/ui/Icon";

/** "30 €", with a non-breaking space so the sign never wraps alone. */
const eur = (n: number) => `${n.toLocaleString("fr-FR")} €`;

/**
 * The BDE's carte cotisante, on paper, exactly as the BDE presents it: the 3D
 * card (the student's own when they hold one), what it gives, the summary
 * table, and how it works in three steps. Nothing is computed: per-event
 * prices are not known, so there is no savings maths. Online payment is a
 * later phase: until `paymentLive`, a demo notice says so and there is no
 * pay button. Anchored at #carte (the footer and the BDE band link here).
 */
export function MemberCardSection({
  offer,
  user,
  index,
}: {
  offer: MemberCardOffer;
  user: UserProfile | null;
  /** Running section number. */
  index: string;
}) {
  const card = user?.memberCard;
  const holder = card && user ? (user.demoLabel ?? `${user.firstName} ${user.lastName}`) : undefined;
  const validity = offer.validUntil
    ? `jusqu'au ${formatDayMonth(offer.validUntil)}`
    : `toute l'${offer.validity.toLowerCase()}`;

  return (
    <section id="carte" aria-labelledby="carte-titre" data-surface="paper" className="grain mt-[var(--section)] py-section">
      <div className="wrap grid gap-x-12 gap-y-12 lg:grid-cols-12">
        <div className="flex flex-col gap-5 lg:sticky lg:top-[calc(var(--header-h)+2rem)] lg:col-span-5 lg:self-start">
          <MemberCard
            season={card?.season ?? offer.season}
            holder={holder}
            number={card?.number}
            validUntilLabel={card ? `Valable jusqu'au ${formatDayMonth(card.validUntil)}` : undefined}
            price={offer.price}
            className="w-full max-w-[30rem]"
          />
          <p className="max-w-[30rem] type-small text-muted">
            {card ? (
              <span className="font-bold text-fg">Ta carte {card.season} est active.</span>
            ) : user ? (
              <>Tu n&apos;as pas encore ta carte pour cette année universitaire.</>
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
            title={`${eur(offer.price)} pour toute l'année`}
            description={`Prise une fois, valable ${validity}.`}
          />

          <ul aria-label="Ce que donne la carte" className="border-b border-line">
            {offer.perks.map((perk) => (
              <li key={perk} className="flex items-start gap-3 border-t border-line py-3.5">
                <Icon name="check" size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-accent-text" />
                <span>{perk}</span>
              </li>
            ))}
          </ul>

          {offer.summary.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 id="carte-resume" className="border-t-2 border-fg pt-3 type-label text-muted">
                En résumé
              </h3>
              <table aria-labelledby="carte-resume" className="w-full border-collapse text-left">
                <tbody>
                  {offer.summary.map((row) => (
                    <tr key={row.label} className="border-t border-line first:border-t-0">
                      <th scope="row" className="py-3 pr-4 align-top font-normal">
                        {row.label}
                      </th>
                      <td className="whitespace-nowrap py-3 text-right align-top type-meta font-bold">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {offer.steps.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 id="carte-etapes" className="border-t-2 border-fg pt-3 type-label text-muted">
                Comment ça marche
              </h3>
              <ol aria-labelledby="carte-etapes" className="border-b border-line">
                {offer.steps.map((step, i) => (
                  <li
                    key={step.title}
                    className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-baseline gap-3 border-t border-line py-3.5 first:border-t-0"
                  >
                    <span aria-hidden className="type-numeral text-[1.9rem] text-accent-text">
                      {i + 1}
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="font-bold leading-snug">{step.title}</span>
                      {step.detail && <span className="type-small text-muted">{step.detail}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {!offer.paymentLive && (
            <p className="flex gap-3 rounded-sm border-2 border-dashed border-line-strong bg-sunken p-4 sm:p-5">
              <Icon name="info" size={20} className="mt-0.5 shrink-0 text-info" />
              <span className="flex flex-col gap-1">
                <span className="font-bold leading-snug">
                  Version de démonstration : le paiement en ligne n&apos;est pas encore ouvert.
                </span>
                <span className="type-small text-muted">
                  Rien n&apos;est encaissé sur ce site pour l&apos;instant. Le paiement de la carte arrivera ici dans
                  une prochaine version.
                </span>
              </span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
