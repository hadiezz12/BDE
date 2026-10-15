import type { Metadata } from "next";
import type { ApplicationStatus, PostKind } from "@/lib/types";
import { CAMPAIGN_STATUS_LABEL, formatDayShort, plural } from "@/lib/format";
import { addDaysToKey, parisDateKey } from "@/lib/time";
import { getManageContext } from "@/lib/data/manage";
import { getAssociationAnalytics, type EventFill, type FillPhase, type SalesStats } from "@/lib/data/analytics";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { POST_KIND_LABEL, POST_KINDS } from "@/components/campus/labels";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { DataTable, type DataColumn } from "@/components/manage/DataTable";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { FillMeter } from "@/components/manage/events/FillMeter";
import { eventDayLabel } from "@/components/manage/events/EventCells";
import { CAMPAIGN_TONE } from "@/components/manage/recruitment/CampaignCells";
import { ColumnChart } from "@/components/manage/analytics/ColumnChart";
import { BarList } from "@/components/manage/analytics/BarList";
import { dayColumns, dayLabel, monthColumns } from "@/components/manage/analytics/chart-data";

type Params = Promise<{ asso: string }>;

export const metadata: Metadata = { title: "Statistiques" };

const PHASE: Record<FillPhase, { label: string; tone: StatusTone }> = {
  past: { label: "Passé", tone: "neutral" },
  live: { label: "En cours", tone: "ok" },
  upcoming: { label: "À venir", tone: "info" },
};

/** The bureau's words for each step, as on the recruitment page. */
const STEP_WORDS: [ApplicationStatus, string, string][] = [
  ["envoyee", "à lire", "à lire"],
  ["en-revue", "en lecture", "en lecture"],
  ["entretien", "en entretien", "en entretien"],
  ["acceptee", "acceptée", "acceptées"],
  ["refusee", "non retenue", "non retenues"],
  ["retiree", "retirée", "retirées"],
];

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** "A et B" · "A, B et C". */
const frenchList = (items: string[]) =>
  items.length <= 2 ? items.join(" et ") : `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;

/** What the daily chart shows, in a sentence: total, opening day, days a post went out, seats left. */
function salesSummary(s: SalesStats): string {
  const first = s.days[0];
  const { capacity = 0 } = s.event.registration;
  const left = Math.max(0, capacity - (s.event.registration.taken ?? 0));
  const parts = [
    `${plural(s.total, "inscription")} en ${plural(s.days.length, "jour")}, dont ${first.count} le jour de l'ouverture (${dayLabel(first.iso).toLowerCase()}).`,
  ];
  for (const p of s.posts) {
    const day = s.days.find((d) => d.key === p.key);
    if (day) parts.push(`Le ${formatDayShort(day.iso)}, jour où « ${p.title} » est paru dans le fil : ${day.count}.`);
  }
  if (capacity > 0) parts.push(left > 0 ? `Il reste ${plural(left, "place")} sur ${capacity}.` : "C'est complet.");
  return parts.join(" ");
}

/**
 * /manage/[asso]/analytics — "Statistiques". Counts only, all derived from
 * what the platform records: registrations against capacity, applications
 * per campaign, posts per month. No page views, no reach, no invented
 * benchmark. Every chart has its numbers in words and in a table.
 */
export default async function ManageAnalyticsPage({ params }: { params: Params }) {
  const { asso } = await params;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;

  const { association } = ctx;
  const now = new Date();
  const stats = await getAssociationAnalytics(association.id, now);
  const short = association.shortName ?? association.name;

  const { counted, uncounted } = stats.events;
  const seatsTaken = counted.reduce((n, e) => n + e.taken, 0);
  const seatsTotal = counted.reduce((n, e) => n + e.capacity, 0);

  const weekStart = addDaysToKey(parisDateKey(now), -6);
  const lastWeek = stats.sales.reduce(
    (n, s) => n + s.days.filter((d) => d.key >= weekStart).reduce((m, d) => m + d.count, 0),
    0,
  );

  const applications = stats.campaigns.reduce((n, c) => n + c.total, 0);
  const seatsOffered = stats.campaigns.reduce((n, c) => n + c.campaign.seats, 0);

  // Nothing recorded yet this season: say so, instead of a wall of zeros and empty charts.
  const hasData =
    counted.length > 0 ||
    uncounted.length > 0 ||
    stats.sales.length > 0 ||
    stats.campaigns.length > 0 ||
    stats.posts.published + stats.posts.scheduled + stats.posts.drafts > 0;

  const kindsLine = POST_KINDS.filter((k) => stats.posts.byKind[k])
    .map((k: PostKind) => plural(stats.posts.byKind[k] ?? 0, POST_KIND_LABEL[k].toLowerCase()))
    .join(", ");

  const fillColumns: DataColumn<EventFill>[] = [
    {
      key: "event",
      header: "Événement",
      primary: true,
      className: "min-w-[13rem]",
      cell: (f) => (
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-bold break-words">{f.event.title}</span>
          <time dateTime={f.event.startsAt} className="type-meta font-normal text-subtle">
            {eventDayLabel(f.event)}
          </time>
        </span>
      ),
    },
    {
      key: "phase",
      header: "Moment",
      cell: (f) => <StatusBadge tone={PHASE[f.phase].tone}>{PHASE[f.phase].label}</StatusBadge>,
    },
    {
      key: "fill",
      header: "Inscrit·es / places",
      cell: (f) => <FillMeter registration={{ capacity: f.capacity, taken: f.taken, status: f.event.registration.status }} />,
      className: "w-64",
    },
  ];

  const header = (
    <ManagePageHeader
      kicker={short}
      title="Statistiques"
      description={
        <p>
          Des comptes, pas des estimations&nbsp;: inscriptions, candidatures et articles de {association.name}, tels
          que le site les enregistre. Pas de vues ni de «&nbsp;portée&nbsp;»&nbsp;: personne n&apos;est pisté.
        </p>
      }
      meta={
        <>
          <span>Saison {stats.season.label}</span>
          <span>Depuis le {formatDayShort(stats.season.startsAt)}</span>
        </>
      }
    />
  );

  if (!hasData) {
    return (
      <div className="flex flex-col gap-10">
        {header}
        <ManageEmpty as="h2" icon="chart" title="Pas encore de données">
          <p>
            Rien n&apos;est encore enregistré pour {association.name} cette saison, donc rien à compter. Les chiffres
            arriveront d&apos;eux-mêmes&nbsp;:
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            <li>le remplissage de chaque date, dès qu&apos;une billetterie ouvre avec un nombre de places&nbsp;;</li>
            <li>les inscriptions jour par jour, dès les premières réservations&nbsp;;</li>
            <li>les candidatures par poste, dès qu&apos;une campagne de recrutement est ouverte&nbsp;;</li>
            <li>les articles publiés chaque mois dans le fil du campus.</li>
          </ul>
        </ManageEmpty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-12">
      {header}

      <StatGroup label={`Les chiffres de la saison de ${association.name}`} columns={4}>
        {counted.length > 0 ? (
          <StatTile
            label="Places réservées"
            value={seatsTaken}
            of={seatsTotal}
            comparison={`Soit ${pct(seatsTaken, seatsTotal)} % des places, sur ${plural(counted.length, "événement")} avec jauge`}
          />
        ) : (
          <StatTile label="Places réservées" value="—" comparison="Aucun événement avec jauge cette saison" />
        )}
        {stats.sales.length > 0 ? (
          <StatTile
            label="Inscriptions sur 7 jours"
            value={lastWeek}
            comparison={`${frenchList(stats.sales.map((s) => s.event.title))}, aujourd'hui compris`}
          />
        ) : (
          <StatTile label="Inscriptions sur 7 jours" value="—" comparison="Pas de billetterie ouverte" />
        )}
        <StatTile
          label="Candidatures reçues"
          value={applications}
          comparison={
            stats.campaigns.length > 0
              ? `Pour ${plural(seatsOffered, "place")}, ${plural(stats.campaigns.length, "campagne")}`
              : "Pas de campagne cette saison"
          }
        />
        <StatTile
          label="Articles publiés"
          value={stats.posts.published}
          comparison={`${plural(stats.posts.scheduled, "programmé")} · ${plural(stats.posts.drafts, "brouillon")}`}
        />
      </StatGroup>

      <ManageSection
        title="Remplissage des événements"
        count={counted.length}
        description="Inscrit·es sur places pour chaque événement de la saison qui compte ses places. Un événement passé garde son chiffre final."
      >
        <DataTable
          caption={`Remplissage des événements de ${association.name}`}
          columns={fillColumns}
          rows={counted}
          rowKey={(f) => f.event.id}
          empty={
            <ManageEmpty icon="ticket" title="Aucun événement avec jauge cette saison">
              <p>
                Dès qu&apos;un événement publié ouvre sa billetterie avec un nombre de places, son remplissage
                s&apos;affiche ici.
              </p>
            </ManageEmpty>
          }
        />
        {uncounted.length > 0 && (
          <div className="mt-3 flex flex-col gap-1">
            <h3 className="flex items-baseline gap-2.5 type-label text-subtle">
              Pas comptés
              <span className="type-meta normal-case tracking-normal">{uncounted.length}</span>
            </h3>
            <ul className="border-b border-line">
              {uncounted.map(({ event, reason }) => (
                <li
                  key={event.id}
                  className="flex flex-col gap-0.5 border-t border-line py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                >
                  <span className="font-semibold">
                    {event.title}{" "}
                    <time dateTime={event.startsAt} className="type-meta font-normal text-subtle">
                      {eventDayLabel(event)}
                    </time>
                  </span>
                  <span className="type-small text-subtle">{reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </ManageSection>

      {stats.sales.length > 0 && (
        <ManageSection
          title="Billetterie jour par jour"
          description="Inscriptions reçues chaque jour depuis l'ouverture de la billetterie. Un losange marque le jour où un article sur l'événement est paru."
        >
          <div className="flex flex-col gap-10">
            {stats.sales.map((s) => (
              <div key={s.event.id} className="flex flex-col gap-3">
                <h3 className="type-card">{s.event.title}</h3>
                <ColumnChart
                  data={dayColumns(s.days, new Map(s.posts.map((p) => [p.key, p.title])))}
                  valueLabel="Inscriptions"
                  markerLabel="Article paru ce jour-là"
                  periodLabel="Jour"
                  summary={salesSummary(s)}
                  tableLabel="Voir les chiffres jour par jour"
                />
              </div>
            ))}
          </div>
        </ManageSection>
      )}

      <ManageSection
        title="Candidatures par campagne"
        count={stats.campaigns.length}
        description="Candidatures envoyées par poste, face au nombre de places (le trait noir). Les brouillons des candidat·es ne comptent pas."
      >
        {stats.campaigns.length === 0 ? (
          <ManageEmpty icon="megaphone" title="Pas de campagne cette saison">
            <p>Quand tu ouvres un recrutement, le nombre de candidatures par poste et par jour s&apos;affiche ici.</p>
          </ManageEmpty>
        ) : (
          <div className="flex flex-col gap-10">
            {stats.campaigns.map((c) => {
              const steps = STEP_WORDS.filter(([s]) => c.byStatus[s])
                .map(([s, one, many]) => {
                  const n = c.byStatus[s] ?? 0;
                  return `${n} ${n > 1 ? many : one}`;
                })
                .join(" · ");
              return (
                <div key={c.campaign.id} className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <h3 className="type-card">{c.campaign.title}</h3>
                      <StatusBadge tone={CAMPAIGN_TONE[c.campaign.status]} className="self-start">
                        {CAMPAIGN_STATUS_LABEL[c.campaign.status]}
                      </StatusBadge>
                      <p className="type-small text-muted">
                        {plural(c.total, "candidature")} pour {plural(c.campaign.seats, "place")}
                        {steps && <> : {steps}</>}.
                      </p>
                    </div>
                    <BarList
                      label={`Candidatures par poste, ${c.campaign.title}`}
                      items={c.byPosition.map(({ position, count }) => ({
                        key: position.id,
                        label: position.title,
                        value: count,
                        target: position.seats,
                      }))}
                      formatValue={(n) => plural(n, "candidature")}
                      formatTarget={(n) => plural(n, "place")}
                    />
                  </div>
                  {c.perDay.length > 0 ? (
                    <ColumnChart
                      data={dayColumns(c.perDay)}
                      valueLabel="Candidatures"
                      periodLabel="Jour"
                      summary={`Candidatures envoyées chaque jour depuis l'ouverture, le ${formatDayShort(c.campaign.opensAt)}.`}
                      tableLabel="Voir les chiffres jour par jour"
                    />
                  ) : (
                    <p className="self-start rounded-md border border-dashed border-line-strong px-4 py-3 type-small text-subtle">
                      Ouvre le {formatDayShort(c.campaign.opensAt)}&nbsp;: les candidatures par jour s&apos;afficheront ici.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ManageSection>

      <ManageSection
        title="Articles par mois"
        count={stats.posts.published}
        description="Articles publiés dans le fil du campus chaque mois de la saison. En pointillés, ceux qui sont programmés et pas encore partis."
      >
        {stats.posts.months.length > 0 && (stats.posts.published > 0 || stats.posts.scheduled > 0) ? (
          <ColumnChart
            data={monthColumns(stats.posts.months)}
            valueLabel="Publiés"
            extraLabel="Programmés"
            periodLabel="Mois"
            className={stats.posts.months.length <= 4 ? "max-w-md" : undefined}
            summary={
              <>
                {plural(stats.posts.published, "article publié", "articles publiés")} depuis le{" "}
                {formatDayShort(stats.season.startsAt)}
                {stats.posts.scheduled > 0 && <>, {plural(stats.posts.scheduled, "programmé")} pour la suite</>}.
                {kindsLine && <> Dont {kindsLine}.</>}
              </>
            }
          />
        ) : (
          <ManageEmpty icon="file" title="Rien de publié cette saison">
            <p>Chaque article publié dans le fil compte ici, mois par mois, avec ceux que tu programmes à l&apos;avance.</p>
          </ManageEmpty>
        )}
      </ManageSection>
    </div>
  );
}
