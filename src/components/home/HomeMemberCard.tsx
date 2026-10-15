import type { MemberCardOffer } from "@/lib/types";
import { MemberCard } from "@/components/brand/MemberCard";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { euros } from "./home-facts";

/**
 * The carte cotisante, on paper: the 3D card on one side, and on the other
 * exactly what the BDE says it gives and how it works. Online payment is a
 * later phase, so instead of a pay button that looks like it works, a plain
 * demo notice. The full presentation lives on the BDE's page (#carte).
 */
export function HomeMemberCard({ offer, href, index }: { offer: MemberCardOffer; href: string; index?: string }) {
  return (
    <div data-surface="paper" className="grain">
      <section aria-labelledby="la-carte" className="wrap grid gap-x-12 gap-y-12 py-section lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-5 lg:self-start">
          <MemberCard season={offer.season} price={offer.price} className="w-full max-w-[30rem]" />
        </div>

        <div className="flex min-w-0 flex-col gap-10 lg:col-span-6 lg:col-start-7">
          <SectionHeader
            id="la-carte"
            index={index}
            kicker={`Carte cotisante · ${offer.season}`}
            title={`${euros(offer.price)} pour toute l'année`}
            description={`Validité : ${offer.validity.toLowerCase()}.`}
          />

          <ul className="border-b border-line">
            {offer.perks.map((perk) => (
              <li key={perk} className="flex items-start gap-3 border-t border-line py-3.5">
                <Icon name="check" size={18} strokeWidth={2.25} className="mt-0.5 shrink-0 text-accent-text" />
                <span>{perk}</span>
              </li>
            ))}
          </ul>

          {offer.steps.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="border-t-2 border-fg pt-3 type-label text-muted">Comment ça marche</h3>
              <ol className="grid gap-5 sm:grid-cols-3 sm:gap-6">
                {offer.steps.map((step, i) => (
                  <li key={step.title} className="flex flex-col gap-1.5">
                    <span aria-hidden className="type-numeral text-[2.2rem] text-accent-text">
                      {i + 1}
                    </span>
                    <span className="font-bold leading-snug">{step.title}</span>
                    {step.detail && <span className="type-small text-muted">{step.detail}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex flex-col items-start gap-5">
            {!offer.paymentLive && (
              <p className="flex items-start gap-3 rounded-sm border-2 border-info/60 bg-info/10 px-3 py-2.5 type-small leading-snug">
                <Icon name="info" size={18} className="mt-px shrink-0 text-info" />
                <span>
                  <strong className="font-bold">Version de démonstration&nbsp;:</strong> le paiement en ligne
                  n&apos;est pas encore ouvert, rien n&apos;est vendu sur le site pour l&apos;instant.
                </span>
              </p>
            )}
            <ButtonLink href={href} variant="secondary" icon="arrow-right">
              Tout sur la carte
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}
