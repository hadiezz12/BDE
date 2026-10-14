import Link from "next/link";
import type { EventItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { formatDayFull, plural } from "@/lib/format";
import { parisDateKey } from "@/lib/time";
import { MediaFrame } from "@/components/media/MediaFrame";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Sticker } from "@/components/ui/Sticker";
import { EventRow } from "@/components/events/EventRow";
import type { PersonalState } from "@/components/events/PersonalMarks";
import { eventAccent, eventSticker } from "@/components/events/event-facts";
import { HomeHeadline } from "./HomeHeadline";
import type { TonightBoard } from "./home-facts";

/**
 * The front door, asymmetric on purpose: the club's line and what tonight
 * holds on the left, the visual of the moment on the right ("home-hero"
 * slot — until the BDE supplies campaign art, the slot shows the lit neon
 * emblem of tonight's signature event, or its photo).
 *
 * Phone: date, headline, lead, tonight's board, then the visual — the
 * board is what a student opens the site for at 19h.
 */
export function HomeOpening({
  board,
  hero,
  personal,
  now,
}: {
  board: TonightBoard;
  hero: EventItem | null;
  personal: (e: EventItem) => PersonalState | undefined;
  now: Date;
}) {
  const accent = hero ? eventAccent(hero) : "rose";
  const fact = hero ? eventSticker(hero, now) : null;
  const count = board.events.length;

  return (
    <section
      aria-labelledby="accueil-titre"
      className="wrap grid gap-x-8 gap-y-10 pb-12 pt-8 sm:pt-12 lg:grid-cols-12 lg:gap-y-12 lg:pb-16 lg:pt-16"
    >
      <div className="flex min-w-0 flex-col gap-5 sm:gap-6 lg:col-span-7 lg:row-start-1">
        <p className="type-label text-muted">
          <time dateTime={parisDateKey(now)}>{formatDayFull(now.toISOString())}</time>
          <span aria-hidden> · </span>
          <span className="sr-only">, </span>
          Campus de Paris, Pantin
        </p>
        <HomeHeadline id="accueil-titre" />
        <p className="max-w-xl type-lead text-muted">
          Le bureau des étudiants de GEM Alpine Business School. Soirées, assos, recrutements : tout ce qui se passe
          entre le canal de l&apos;Ourcq et le dernier métro.
        </p>
      </div>

      <section aria-labelledby="ce-soir" className="min-w-0 lg:col-span-7 lg:row-start-2">
        <SectionHeader
          id="ce-soir"
          size="headline"
          title={board.title}
          kicker={count > 0 ? plural(count, "rendez-vous", "rendez-vous") : "Agenda"}
          action={{ href: routes.events, label: "Tout l'agenda" }}
        />
        {board.note && <p className="mt-3 text-muted">{board.note}</p>}
        {count > 0 ? (
          <div className="mt-4 border-b border-line">
            {board.events.map((e) => (
              <EventRow key={e.id} event={e} variant="compact" headingLevel={3} now={now} personal={personal(e)} />
            ))}
          </div>
        ) : (
          <EmptyState
            className="mt-6"
            title="L'agenda est vide pour l'instant"
            actions={
              <ButtonLink href={routes.associations} variant="secondary" icon="arrow-right">
                Voir les assos
              </ButtonLink>
            }
          >
            Les assos préparent la suite : leurs prochains événements s&apos;afficheront ici dès qu&apos;ils seront
            publiés.
          </EmptyState>
        )}
      </section>

      <figure
        data-accent={accent}
        className="min-w-0 lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1 lg:self-start"
      >
        <div className="relative aspect-[16/10] sm:aspect-[3/2] lg:aspect-[4/5]">
          <MediaFrame
            slot="home-hero"
            sizes="(min-width: 1024px) 36vw, 100vw"
            priority
            photo={hero && !hero.emblem ? hero.cover : undefined}
            fallback={
              hero
                ? {
                    title: hero.title,
                    accent,
                    kicker: hero.association.shortName ?? hero.association.name,
                    emblem: hero.emblem,
                  }
                : { title: "Very Pink Club", accent: "rose", kicker: "BDE · GEM Paris" }
            }
            className="border-2 border-line-strong"
          />
          {fact && (
            <Sticker tone={fact.tone} tilt={-4} className="absolute left-3 top-3 sm:left-4 sm:top-4">
              {fact.label}
            </Sticker>
          )}
        </div>
        {hero && (
          <figcaption className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="type-label text-assoc-text">À l&apos;affiche</span>
            <Link href={routes.event(hero.slug)} className="font-bold leading-snug hover:text-assoc-text">
              {hero.title}
            </Link>
          </figcaption>
        )}
      </figure>
    </section>
  );
}
