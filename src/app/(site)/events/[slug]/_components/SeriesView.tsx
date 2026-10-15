import type { ReactNode } from "react";
import Link from "next/link";
import type { Association, EventItem, EventSeries, MemberCardOffer } from "@/lib/types";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { AssociationIdentity } from "@/components/associations/AssociationIdentity";
import { Breadcrumbs } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { MediaFrame } from "@/components/media/MediaFrame";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { EventRow } from "@/components/events/EventRow";
import { SeriesBoard } from "@/components/events/SeriesBoard";
import type { PersonalState } from "@/components/events/PersonalMarks";
import { euros, memberCardHref, memberDiscount } from "@/components/events/series-facts";

/**
 * The page of one of the BDE's 8 events of the year ("Chaque événement a sa
 * page dédiée"): the lit emblem, what it is, when in the year it comes back,
 * and what the carte cotisante changes. Dates, venue and prices belong to
 * each dated edition, announced by the bureau: until one is published, the
 * editions list says so plainly. Nothing to register for here, so no action
 * bar — the way on is an edition's own page once it exists.
 */
export function SeriesView({
  series,
  number,
  total,
  organiser,
  editions,
  others,
  numbers,
  offer,
  manages,
  personalFor,
  now,
}: {
  series: EventSeries;
  /** "03": its place in the BDE's order. */
  number: string;
  /** How many events the year has (8). */
  total: number;
  /** The association that produces it (the BDE). */
  organiser: Association | null;
  /** Upcoming dated editions of this series, chronological. */
  editions: EventItem[];
  /** The other events of the year, in the BDE's order. */
  others: EventSeries[];
  numbers: Map<string, string>;
  /** The carte cotisante the organiser sells, if any. */
  offer: MemberCardOffer | null;
  /** The viewer manages the organiser: a way to its workspace. */
  manages: boolean;
  personalFor: (e: EventItem) => PersonalState | undefined;
  now: Date;
}) {
  const discount = offer ? memberDiscount(offer) : null;
  const cardHref = organiser ? memberCardHref(organiser.slug) : null;
  let index = 0;
  const nextIndex = () => String(++index).padStart(2, "0");

  return (
    <>
      <article data-accent={series.accent} aria-labelledby="serie-titre">
        <div className="wrap pb-5 pt-6 sm:pt-8">
          <Breadcrumbs
            items={[
              { href: routes.events, label: "Agenda" },
              { href: routes.event(series.slug), label: series.name },
            ]}
          />
        </div>

        {/* ---- Hero: the lit emblem and the facts strip ---- */}
        <header className="wrap grid gap-x-12 gap-y-7 lg:grid-cols-12 lg:items-end">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              {organiser && <AssociationIdentity association={organiser} />}
              <Link
                href={`${routes.events}#les-8`}
                className="type-label text-muted underline-offset-4 hover:text-fg hover:underline"
              >
                Événement {number} sur {total}
              </Link>
              {manages && organiser && (
                <Link
                  href={routes.manageEvents(organiser.slug)}
                  className="inline-flex items-center gap-1.5 type-label text-assoc-text underline-offset-4 hover:underline"
                >
                  <Icon name="edit" size={14} />
                  Gérer les événements
                </Link>
              )}
            </div>
            <div className="flex flex-col gap-4">
              <h1 id="serie-titre" className="type-poster break-words hyphens-auto">
                {series.name}
              </h1>
              <p className="max-w-2xl type-lead text-muted">{series.subtitle}</p>
            </div>

            <dl className="flex flex-col divide-y divide-line border-y-2 border-fg">
              <Fact label="Quand">
                <span className="font-bold leading-snug">{series.period}</span>
              </Fact>
              <Fact label="Infos">
                <span className="leading-snug">
                  Dates, lieu et tarifs : annoncés par le bureau avant chaque édition.
                </span>
              </Fact>
              {discount && (
                <Fact label="Carte">
                  <span className="leading-snug">
                    <strong className="whitespace-nowrap text-assoc-text">{discount.value}</strong> avec la carte
                    cotisante
                  </span>
                </Fact>
              )}
            </dl>
          </div>

          <div className="relative order-first -mx-[var(--gutter)] sm:mx-0 lg:order-none lg:col-span-5">
            <MediaFrame
              ratio="16/9"
              slot="event-hero"
              sizes="(min-width: 1024px) 38vw, 100vw"
              priority
              fallback={{ title: series.name, accent: series.accent, emblem: series.emblem }}
              className="sm:rounded-sm lg:aspect-[4/5] lg:max-h-[min(44rem,78vh)]"
            />
          </div>
        </header>

        {/* ---- Body + the card panel ---- */}
        <div className="wrap grid gap-x-12 gap-y-14 pb-16 pt-12 sm:pb-20 sm:pt-16 lg:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-16 lg:col-span-8">
            <section aria-labelledby="principe">
              <SectionHeader id="principe" index={nextIndex()} kicker="L'événement" title="Le principe" />
              <p className="mt-6 max-w-[44rem] type-lead">{series.description}</p>
            </section>

            <section aria-labelledby="editions">
              <SectionHeader
                id="editions"
                index={nextIndex()}
                kicker={
                  editions.length > 0 ? plural(editions.length, "date annoncée", "dates annoncées") : "Dates"
                }
                title="Les prochaines dates"
              />
              {editions.length > 0 ? (
                <div className="mt-6 border-b border-line-strong">
                  {editions.map((e) => (
                    <EventRow
                      key={e.id}
                      event={e}
                      headingLevel={3}
                      showAssociation={false}
                      personal={personalFor(e)}
                      now={now}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState className="mt-8" title="Pas encore de date annoncée">
                  Le bureau annonce la date, le lieu et le tarif avant chaque édition. Dès qu&apos;ils sont publiés,
                  ils apparaissent ici.
                </EmptyState>
              )}
            </section>

            {organiser && (
              <section aria-labelledby="organisateur" data-accent={organiser.accent}>
                <SectionHeader id="organisateur" index={nextIndex()} kicker="Organisé par" title="Qui organise" />
                <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-10">
                  <AssociationIdentity association={organiser} size="lg" showKind link={false} className="shrink-0" />
                  <div className="flex max-w-xl flex-col gap-4">
                    {organiser.tagline && <p className="type-lead">« {organiser.tagline} »</p>}
                    {organiser.meetingInfo && (
                      <p className="flex items-start gap-2 type-small text-muted">
                        <Icon name="pin" size={16} className="mt-0.5 shrink-0" />
                        {organiser.meetingInfo}
                      </p>
                    )}
                    <Link
                      href={routes.association(organiser.slug)}
                      className="inline-flex items-center gap-1.5 self-start type-small font-bold hover:text-assoc-text"
                    >
                      Voir la page du {organiser.name}
                      <Icon name="arrow-right" size={16} />
                    </Link>
                  </div>
                </div>
              </section>
            )}
          </div>

          {offer && cardHref && (
            <aside aria-labelledby="carte-cotisante" className="lg:col-span-4">
              <div className="flex flex-col rounded-sm border border-line-strong bg-raised lg:sticky lg:top-[calc(var(--header-h)+1.5rem)]">
                <div className="flex flex-col gap-3 p-5 sm:p-6">
                  <h2 id="carte-cotisante" className="type-label text-muted">
                    Avec la carte cotisante
                  </h2>
                  {discount && (
                    <p className="flex flex-col gap-1">
                      <span className="type-numeral text-[2.4rem] text-assoc-text">{discount.value}</span>
                      <span className="type-small text-muted">{discount.label}</span>
                    </p>
                  )}
                </div>
                <dl className="flex flex-col border-t border-line px-5 sm:px-6">
                  {offer.summary
                    .filter((row) => row !== discount)
                    .map((row) => (
                      <div
                        key={row.label}
                        className="flex items-baseline justify-between gap-4 border-b border-line py-2.5 last:border-b-0"
                      >
                        <dt className="type-small text-muted">{row.label}</dt>
                        <dd className="text-right type-small font-bold">{row.value}</dd>
                      </div>
                    ))}
                </dl>
                <div className="border-t-2 border-dashed border-line-strong/50 p-5 sm:p-6">
                  <ButtonLink href={cardHref} variant="secondary" icon="arrow-right" block>
                    La carte · {euros(offer.price)}
                  </ButtonLink>
                </div>
              </div>
            </aside>
          )}
        </div>
      </article>

      {others.length > 0 && (
        <section aria-labelledby="les-autres" className="wrap">
          <SectionHeader
            id="les-autres"
            kicker="Les 8 événements de l'année"
            title="Le reste de l'année"
            action={{ href: routes.events, label: "Tout l'agenda" }}
          />
          <SeriesBoard series={others} numbers={numbers} className="mt-8" />
        </section>
      )}

      <div aria-hidden className="h-[var(--section)]" />
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 py-3.5 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-4">
      <dt className="type-label text-muted sm:pt-1">{label}</dt>
      <dd className="flex min-w-0 flex-col gap-0.5">{children}</dd>
    </div>
  );
}
