import type { Metadata } from "next";
import type { EventItem, PostItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { getManageContext } from "@/lib/data/manage";
import { getEvents } from "@/lib/data/events";
import { getEventSeries } from "@/lib/data/event-series";
import { getPosts } from "@/lib/data/posts";
import { FilterChips, type FilterOption } from "@/components/ui/FilterChips";
import { EventFacts } from "@/components/events/EventFacts";
import { RegistrationState } from "@/components/events/RegistrationState";
import { eventPhase, isTonight } from "@/components/events/event-facts";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { DataTable, type DataColumn } from "@/components/manage/DataTable";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { DemoActionButton } from "@/components/manage/DemoActions";
import { PublicLink } from "@/components/manage/links/PublicLink";
import { FillMeter } from "@/components/manage/events/FillMeter";
import { SeriesLedger } from "@/components/manage/events/SeriesLedger";
import {
  EventPublicationCell,
  EventTitleCell,
  EventWhenCell,
  RecapCell,
  eventDayLabel,
} from "@/components/manage/events/EventCells";

type Params = Promise<{ asso: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  return { title: parseWhen((await searchParams).quand) === "passes" ? "Événements passés" : "Événements" };
}

type When = "passes" | null;

function parseWhen(value: string | string[] | undefined): When {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "passes" ? "passes" : null;
}

const CREATE_NOTICE = "la création d'événement n'est pas encore branchée, rien n'est enregistré.";
const DATE_NOTICE = "l'ajout de dates n'est pas encore branché, rien n'est enregistré.";

/**
 * /manage/[asso]/events — what the association organises. First its
 * recurring events (the BDE's events of the year, each with its public
 * page), then every dated edition, drafts included: upcoming (default) or
 * past, chosen in the URL (?quand=passes). Upcoming rows say where
 * publication and registration stand and how full each date is; past rows
 * give the final turnout and the recap. Adding anything is demo-only.
 */
export default async function ManageEventsPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;

  const { association } = ctx;
  const when = parseWhen((await searchParams).quand);
  const now = new Date();
  const short = association.shortName ?? association.name;

  const [series, upcoming, past, posts] = await Promise.all([
    getEventSeries({ associationId: association.id }),
    getEvents({ associationId: association.id, includeUnpublished: true, when: "upcoming" }),
    getEvents({ associationId: association.id, includeUnpublished: true, when: "past" }),
    getPosts({ associationId: association.id, includeUnpublished: true }),
  ]);
  const hasSeries = series.length > 0;
  const hasDates = upcoming.length + past.length > 0;

  const listed = upcoming.filter((e) => e.publication === "publie");
  const drafts = upcoming.filter((e) => e.publication === "brouillon").length;
  const scheduled = upcoming.filter((e) => e.publication === "programme").length;
  const offAgenda = [
    drafts > 0 ? plural(drafts, "brouillon") : null,
    scheduled > 0 ? plural(scheduled, "programmé") : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const tonight = listed.find((e) => isTonight(e, now));
  // Something already under way (a multi-week campaign) is not "next".
  const next = listed.find((e) => eventPhase(e, now) === "upcoming");

  // Seats only add up for published events that count them.
  const counted = listed.filter((e) => e.registration.capacity !== undefined && e.registration.taken !== undefined);
  const seatsTaken = counted.reduce((n, e) => n + (e.registration.taken ?? 0), 0);
  const seatsTotal = counted.reduce((n, e) => n + (e.registration.capacity ?? 0), 0);

  const recapFor = (e: EventItem): PostItem | undefined => {
    const recaps = posts.filter((p) => p.relatedEventId === e.id && p.kind === "recap");
    return recaps.find((p) => p.publication === "publie") ?? recaps[0];
  };

  const options: FilterOption[] = [
    { value: null, label: "À venir", count: upcoming.length },
    { value: "passes", label: hasSeries ? "Passées" : "Passés", count: past.length },
  ];

  const titleColumn: DataColumn<EventItem> = {
    key: "title",
    header: "Événement",
    primary: true,
    cell: (e) => <EventTitleCell event={e} />,
    className: "min-w-[13rem]",
  };
  const whenColumn: DataColumn<EventItem> = {
    key: "when",
    header: "Date",
    cell: (e) => <EventWhenCell event={e} now={now} />,
  };
  const priceColumn: DataColumn<EventItem> = {
    key: "price",
    header: "Prix",
    cell: (e) => <EventFacts event={e} show={["price"]} layout="inline" />,
    className: "min-w-[7rem]",
  };

  const upcomingColumns: DataColumn<EventItem>[] = [
    titleColumn,
    whenColumn,
    { key: "publication", header: "Publication", cell: (e) => <EventPublicationCell event={e} /> },
    {
      key: "registration",
      header: "Inscriptions",
      cell: (e) => <RegistrationState event={e} variant="badge" now={now} />,
    },
    { key: "fill", header: "Remplissage", cell: (e) => <FillMeter registration={e.registration} /> },
    priceColumn,
  ];

  const pastColumns: DataColumn<EventItem>[] = [
    titleColumn,
    whenColumn,
    { key: "turnout", header: "Participation", cell: (e) => <FillMeter registration={e.registration} /> },
    priceColumn,
    { key: "recap", header: "Récap", cell: (e) => <RecapCell recap={recapFor(e)} /> },
  ];

  const view = (e: EventItem) =>
    e.publication === "publie" ? <PublicLink href={routes.event(e.slug)} title={e.title} /> : null;

  // With recurring events, the bureau adds dates to them; otherwise it creates events.
  const createButton = (label?: string) => (
    <DemoActionButton icon="plus" iconPosition="start" notice={hasSeries ? DATE_NOTICE : CREATE_NOTICE}>
      {label ?? (hasSeries ? "Ajouter une date" : "Nouvel événement")}
    </DemoActionButton>
  );

  const noUpcoming = (
    <ManageEmpty
      as={hasSeries ? "h3" : "h2"}
      icon="calendar"
      title={hasSeries ? "Aucune date annoncée pour l'instant" : `Rien de prévu pour ${short}`}
      actions={hasSeries ? undefined : createButton("Créer un événement")}
      demo={hasSeries ? DATE_NOTICE : CREATE_NOTICE}
    >
      {hasSeries ? (
        <p>
          Les dates de chaque édition seront ajoutées ici par le bureau, d&apos;abord en brouillon. Une date n&apos;entre
          dans l&apos;agenda qu&apos;une fois publiée, avec sa billetterie et son remplissage.
        </p>
      ) : (
        <p>
          Une soirée, un week-end, un apéro&nbsp;: crée-le en brouillon, le bureau le relit, et il n&apos;arrive dans
          l&apos;agenda qu&apos;au moment où tu le publies.
        </p>
      )}
    </ManageEmpty>
  );

  const datesTable =
    when === "passes" ? (
      <DataTable
        caption={`Dates passées de ${association.name}`}
        columns={pastColumns}
        rows={past}
        rowKey={(e) => e.id}
        actions={view}
        actionsLabel="Page publique"
        empty={
          <ManageEmpty icon="calendar" title="Pas encore de date passée">
            <p>
              Une fois passée, chaque date reste ici avec sa participation finale et le lien vers son récap dans le fil
              du campus.
            </p>
          </ManageEmpty>
        }
      />
    ) : (
      <DataTable
        caption={`Dates à venir de ${association.name}`}
        columns={upcomingColumns}
        rows={upcoming}
        rowKey={(e) => e.id}
        actions={view}
        actionsLabel="Page publique"
        empty={noUpcoming}
      />
    );

  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker={short}
        title="Événements"
        description={
          hasSeries ? (
            <p>
              Les {plural(series.length, "événement")} de l&apos;année de {association.name}, puis chaque date annoncée.
              Une date n&apos;entre dans l&apos;agenda qu&apos;une fois publiée&nbsp;: les brouillons et les programmées
              restent entre vous.
            </p>
          ) : (
            <p>
              Tout ce que {association.name} organise, brouillons compris. Un événement n&apos;entre dans l&apos;agenda
              qu&apos;une fois publié&nbsp;: les brouillons et les programmés restent entre vous.
            </p>
          )
        }
        actions={createButton()}
      />

      {upcoming.length > 0 && (
        <StatGroup label={`Dates à venir de ${association.name}`} columns={3}>
          <StatTile
            label="Dans l'agenda"
            value={listed.length}
            tone={tonight ? "accent" : "neutral"}
            comparison={
              tonight
                ? `Ce soir : ${tonight.title}`
                : next
                  ? `Prochain : ${next.title}, ${eventDayLabel(next).toLowerCase()}`
                  : "Rien de publié pour l'instant"
            }
          />
          {counted.length > 0 ? (
            <StatTile
              label="Places réservées"
              value={seatsTaken}
              of={seatsTotal}
              comparison={`Sur ${plural(counted.length, "billetterie en cours", "billetteries en cours")}`}
            />
          ) : (
            <StatTile label="Places réservées" value="—" comparison="Aucune billetterie avec jauge en cours" />
          )}
          <StatTile label="Hors agenda" value={drafts + scheduled} comparison={offAgenda || "Tout est en ligne"} />
        </StatGroup>
      )}

      {hasSeries && (
        <ManageSection
          title="Les événements de l'année"
          count={series.length}
          description="Chaque événement a sa page publique. Ses dates s'y ajoutent au fil de l'année, dès que le bureau les annonce."
        >
          <SeriesLedger
            series={series}
            upcoming={upcoming}
            past={past}
            label={`Les événements de l'année de ${association.name}`}
            notice={DATE_NOTICE}
          />
        </ManageSection>
      )}

      {hasSeries ? (
        <ManageSection
          title="Dates"
          count={upcoming.length + past.length}
          description="Chaque édition datée, brouillons compris, avec sa billetterie et son remplissage."
        >
          {hasDates ? (
            <div className="flex flex-col gap-5">
              <FilterChips
                label="Dates à venir ou passées"
                param="quand"
                options={options}
                current={when}
                basePath={routes.manageEvents(association.slug)}
              />
              {datesTable}
            </div>
          ) : (
            noUpcoming
          )}
        </ManageSection>
      ) : hasDates ? (
        <div className="flex flex-col gap-5">
          <FilterChips
            label="Événements à venir ou passés"
            param="quand"
            options={options}
            current={when}
            basePath={routes.manageEvents(association.slug)}
          />
          {datesTable}
        </div>
      ) : (
        noUpcoming
      )}
    </div>
  );
}
