import type { Metadata } from "next";
import type { EventItem, PostItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { getManageContext } from "@/lib/data/manage";
import { getEvents } from "@/lib/data/events";
import { getPosts } from "@/lib/data/posts";
import { FilterChips, type FilterOption } from "@/components/ui/FilterChips";
import { EventFacts } from "@/components/events/EventFacts";
import { RegistrationState } from "@/components/events/RegistrationState";
import { eventPhase, isTonight } from "@/components/events/event-facts";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { DataTable, type DataColumn } from "@/components/manage/DataTable";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { DemoActionButton } from "@/components/manage/DemoActions";
import { PublicLink } from "@/components/manage/links/PublicLink";
import { FillMeter } from "@/components/manage/events/FillMeter";
import {
  EventPublicationCell,
  EventTitleCell,
  EventWhenCell,
  RecapCell,
  eventDayLabel,
} from "@/components/manage/events/EventCells";

type Params = Promise<{ asso: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = { title: "Événements" };

type When = "passes" | null;

function parseWhen(value: string | string[] | undefined): When {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "passes" ? "passes" : null;
}

const CREATE_NOTICE = "la création d'événement n'est pas encore branchée, rien n'est enregistré.";

/**
 * /manage/[asso]/events — everything the association organises, drafts
 * included: upcoming (default) or past, chosen in the URL (?quand=passes).
 * Upcoming rows say where publication and registration stand and how full
 * each event is; past rows give the final turnout and the recap.
 */
export default async function ManageEventsPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;

  const { association } = ctx;
  const when = parseWhen((await searchParams).quand);
  const now = new Date();

  const [upcoming, past, posts] = await Promise.all([
    getEvents({ associationId: association.id, includeUnpublished: true, when: "upcoming" }),
    getEvents({ associationId: association.id, includeUnpublished: true, when: "past" }),
    getPosts({ associationId: association.id, includeUnpublished: true }),
  ]);

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
  // Something already under way (a seven-week campaign) is not "next".
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
    { value: "passes", label: "Passés", count: past.length },
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

  const createButton = (label: string) => (
    <DemoActionButton icon="plus" iconPosition="start" notice={CREATE_NOTICE}>
      {label}
    </DemoActionButton>
  );

  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader
        kicker={association.shortName ?? association.name}
        title="Événements"
        description={
          <p>
            Tout ce que {association.name} organise, brouillons compris. Un événement n&apos;entre dans l&apos;agenda
            qu&apos;une fois publié&nbsp;: les brouillons et les programmés restent entre vous.
          </p>
        }
        actions={createButton("Nouvel événement")}
      />

      {upcoming.length > 0 && (
        <StatGroup label={`Événements à venir de ${association.name}`} columns={3}>
          <StatTile
            label="Dans l'agenda"
            value={listed.length}
            tone={tonight ? "accent" : "neutral"}
            comparison={
              tonight
                ? `Ce soir : ${tonight.title}`
                : next
                  ? `Prochain : ${next.title}, ${eventDayLabel(next).toLowerCase()}`
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
          <StatTile
            label="Hors agenda"
            value={drafts + scheduled}
            comparison={offAgenda || "Tout est en ligne"}
          />
        </StatGroup>
      )}

      <div className="flex flex-col gap-5">
        <FilterChips
          label="Événements à venir ou passés"
          param="quand"
          options={options}
          current={when}
          basePath={routes.manageEvents(association.slug)}
        />

        {when === "passes" ? (
          <DataTable
            caption={`Événements passés de ${association.name}`}
            columns={pastColumns}
            rows={past}
            rowKey={(e) => e.id}
            actions={view}
            actionsLabel="Page publique"
            empty={
              <ManageEmpty as="h2" icon="calendar" title="Pas encore d'événement passé">
                <p>
                  Une fois terminé, chaque événement reste ici avec sa participation finale et le lien vers son récap
                  dans le fil du campus.
                </p>
              </ManageEmpty>
            }
          />
        ) : (
          <DataTable
            caption={`Événements à venir de ${association.name}`}
            columns={upcomingColumns}
            rows={upcoming}
            rowKey={(e) => e.id}
            actions={view}
            actionsLabel="Page publique"
            empty={
              <ManageEmpty
                as="h2"
                icon="calendar"
                title={`Rien de prévu pour ${association.shortName ?? association.name}`}
                actions={createButton("Créer un événement")}
              >
                <p>
                  Une soirée, un afterwork, un live&nbsp;: crée-le en brouillon, le bureau le relit, et il n&apos;arrive
                  dans l&apos;agenda qu&apos;au moment où tu le publies.
                </p>
              </ManageEmpty>
            }
          />
        )}
      </div>
    </div>
  );
}
