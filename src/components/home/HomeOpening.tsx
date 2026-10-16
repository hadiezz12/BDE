import Link from "next/link";
import type { EventItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { BrandMark } from "@/components/brand/BrandMark";
import { MediaFrame } from "@/components/media/MediaFrame";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { Sticker } from "@/components/ui/Sticker";
import { EventRow } from "@/components/events/EventRow";
import type { PersonalState } from "@/components/events/PersonalMarks";
import { eventAccent, eventSticker } from "@/components/events/event-facts";
import { HomeHeadline } from "./HomeHeadline";
import { euros, type MemberCardLink, type TonightBoard } from "./home-facts";

/**
 * The front door, asymmetric on purpose: the club's line, the BDE's own
 * pitch and the two ways in (the 8 events, the card) on the left; the
 * visual of the moment on the right ("home-hero" slot). Until the BDE
 * supplies campaign art the slot shows the club's neon badge — or, once
 * dated editions exist, the lit emblem of the one on the bill.
 *
 * Tonight's board only appears when something dated is on: no empty
 * "ce soir" block while the bureau has not announced any date.
 */
export function HomeOpening({
  board,
  hero,
  personal,
  memberCard,
  now,
}: {
  board: TonightBoard;
  hero: EventItem | null;
  personal: (e: EventItem) => PersonalState | undefined;
  memberCard: MemberCardLink;
  now: Date;
}) {
  const count = board.events.length;

  return (
    <section
      aria-labelledby="accueil-titre"
      className="wrap grid gap-x-8 gap-y-10 pb-12 pt-8 sm:pt-12 lg:grid-cols-12 lg:gap-y-12 lg:pb-16 lg:pt-16"
    >
      <div className="flex min-w-0 flex-col gap-5 sm:gap-6 lg:col-span-7 lg:row-start-1 lg:self-center">
        <p className="type-label text-muted">
          <span className="text-accent-text">Very Pink Club</span>
          <span aria-hidden> · </span>
          <span className="sr-only">, </span>
          BDE de GEM Alpine Business School — Paris
        </p>
        <HomeHeadline id="accueil-titre" />
        <p className="max-w-xl type-lead text-muted">
          8 événements, une carte à 30&nbsp;€, et une promo qu&apos;on ne lâche pas. Le Very Pink Club produit les
          week-ends, les soirées et les apéros de GEM Alpine Business School.
        </p>
        <div className="mt-1 flex flex-wrap gap-3">
          <ButtonLink href={routes.events} icon="arrow-right" size="lg">
            Voir les 8 événements
          </ButtonLink>
          <ButtonLink href={memberCard.href} variant="secondary" size="lg">
            {memberCard.price !== null ? `La carte · ${euros(memberCard.price)}` : "La carte cotisante"}
          </ButtonLink>
        </div>
      </div>

      {count > 0 && (
        <section aria-labelledby="ce-soir" className="min-w-0 lg:col-span-7 lg:row-start-2">
          <SectionHeader
            id="ce-soir"
            size="headline"
            title={board.title}
            kicker={plural(count, "rendez-vous", "rendez-vous")}
            action={{ href: routes.events, label: "Tout l'agenda" }}
          />
          {board.note && <p className="mt-3 text-muted">{board.note}</p>}
          <div className="mt-4 border-b border-line">
            {board.events.map((e) => (
              <EventRow key={e.id} event={e} variant="compact" headingLevel={3} now={now} personal={personal(e)} />
            ))}
          </div>
        </section>
      )}

      {hero ? (
        <HeroEvent hero={hero} rows={count > 0 ? 2 : 1} now={now} />
      ) : (
        <div className="min-w-0 lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:self-start">
          <div
            data-media-slot="home-hero"
            data-accent="rose"
            className="relative isolate aspect-[16/10] overflow-hidden border-2 border-line-strong bg-sunken sm:aspect-[3/2] lg:aspect-[4/5]"
          >
            <span
              aria-hidden
              className="absolute inset-0 m-auto aspect-square h-[85%] rounded-full opacity-50 blur-3xl"
              style={{ background: "radial-gradient(circle, var(--assoc) 0%, transparent 65%)" }}
            />
            <BrandMark
              variant="badge"
              height={420}
              priority
              decorative
              className="absolute inset-0 m-auto h-[78%] w-auto max-w-[90%] object-contain drop-shadow-[0_0_28px_rgb(250_4_121/0.45)] lg:h-auto lg:w-[80%]"
            />
          </div>
        </div>
      )}
    </section>
  );
}

/** The visual of the edition on the bill: its photo, or its lit emblem, with the one sticker it deserves. */
function HeroEvent({ hero, rows, now }: { hero: EventItem; rows: 1 | 2; now: Date }) {
  const accent = eventAccent(hero);
  const fact = eventSticker(hero, now);
  return (
    <figure
      data-accent={accent}
      className={
        rows === 2
          ? "min-w-0 lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1 lg:self-start"
          : "min-w-0 lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:self-start"
      }
    >
      <div className="relative aspect-[16/10] sm:aspect-[3/2] lg:aspect-[4/5]">
        <MediaFrame
          slot="home-hero"
          sizes="(min-width: 1024px) 36vw, 100vw"
          priority
          photo={hero.emblem ? undefined : hero.cover}
          fallback={{
            title: hero.title,
            accent,
            kicker: hero.association.shortName ?? hero.association.name,
            emblem: hero.emblem,
          }}
          className="border-2 border-line-strong"
        />
        {fact && (
          <Sticker tone={fact.tone} tilt={-4} className="absolute left-3 top-3 sm:left-4 sm:top-4">
            {fact.label}
          </Sticker>
        )}
      </div>
      <figcaption className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="type-label text-assoc-text">À l&apos;affiche</span>
        <Link href={routes.event(hero.slug)} className="font-bold leading-snug hover:text-assoc-text">
          {hero.title}
        </Link>
      </figcaption>
    </figure>
  );
}
