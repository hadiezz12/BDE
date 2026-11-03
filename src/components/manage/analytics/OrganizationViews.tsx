import Link from "next/link";
import { routes } from "@/lib/routes";
import { formatDayShort, formatTime, plural } from "@/lib/format";
import { POST_KIND_PLURAL } from "@/components/campus/labels";
import type { PostKind } from "@/lib/types";
import { buckets, bucketSeries, total, type Period } from "@/lib/analytics/period";
import { formatCount, formatHours, formatRate, rate } from "@/lib/analytics/compare";
import type { MetricKey } from "@/lib/analytics/metrics";
import type { CampaignFunnel, EventRow, OrganizationAnalytics } from "@/lib/data/analytics";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ManageSection } from "@/components/manage/ManagePageHeader";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { BarList } from "./BarList";
import { ColumnChart } from "./ColumnChart";
import { bucketColumns } from "./chart-data";
import { CapacityBar, Definitions, Funnel, MetricTile, NotMeasured, RateTile, SuppressedCell, suppressionText } from "./AnalyticsBlocks";

/**
 * The views of an association's statistics (/manage/[asso]/analytics?vue=…).
 * Each one reads only its section of organization_analytics, which the
 * database filled only when the person holds its key right now.
 */

type Data = OrganizationAnalytics;

const KINDS: PostKind[] = ["article", "annonce", "recap", "breve"];
const GRANULARITY_WORD = { day: "par jour", week: "par semaine", month: "par mois" } as const;

/** A period sum and the same sum over the comparison period (undefined when there is none). */
function pair(d: Data, metricKey: string, dimensions?: string[]) {
  return {
    value: total(d.totals, metricKey, dimensions),
    previous: d.compare ? total(d.compare, metricKey, dimensions) : undefined,
  };
}

function Trend({ d, period, rows, metricKey, valueLabel, summary }: {
  d: Data;
  period: Period;
  rows: [string, string, string, number][];
  metricKey: string;
  valueLabel: string;
  summary: string;
}) {
  const bs = buckets(period, period.granularity);
  const values = bucketSeries(rows, metricKey, bs);
  const sum = values.reduce((a, b) => a + b, 0);
  if (!d.freshness?.data_through) return null;
  // Nothing in the period: one sentence, not an empty drawing.
  if (sum === 0) return <p className="type-small text-muted">{summary} {GRANULARITY_WORD[period.granularity]}&nbsp;: aucune sur la période.</p>;
  return (
    <ColumnChart
      data={bucketColumns(bs, values)}
      valueLabel={valueLabel}
      periodLabel={period.granularity === "day" ? "Jour" : period.granularity === "week" ? "Semaine" : "Mois"}
      summary={`${summary} ${GRANULARITY_WORD[period.granularity]}, ${period.label.toLowerCase()} : ${formatCount(sum)} en tout.`}
    />
  );
}

/* ---- Overview ------------------------------------------------------------------------------------------- */

export function OverviewView({ d, asso }: { d: Data; asso: string }) {
  const o = d.sections.overview;
  if (!o) return null;
  const posts = pair(d, "posts.published");
  const held = pair(d, "events.held");
  const published = pair(d, "events.published");
  const regs = pair(d, "registrations.created");
  const apps = pair(d, "applications.submitted");
  const insights = [
    o.insights.approvals_waiting > 0 && {
      key: "approvals",
      text: `${plural(o.insights.approvals_waiting, "version attend", "versions attendent")} une relecture${
        o.insights.approvals_waiting_since ? `, la plus ancienne depuis le ${formatDayShort(o.insights.approvals_waiting_since)}` : ""
      }.`,
      href: routes.manageContent(asso),
    },
    o.insights.schedules_failed > 0 && {
      key: "schedules",
      text: `${plural(o.insights.schedules_failed, "publication programmée n'est pas partie", "publications programmées ne sont pas parties")}.`,
      href: routes.manageContent(asso),
    },
    o.insights.events_near_capacity > 0 && {
      key: "capacity",
      text: `${plural(o.insights.events_near_capacity, "événement à venir est rempli", "événements à venir sont remplis")} à 90 % ou plus.`,
      href: routes.manageEvents(asso),
    },
    o.insights.campaigns_closing_week > 0 && {
      key: "closing",
      text: `${plural(o.insights.campaigns_closing_week, "recrutement ferme", "recrutements ferment")} dans les 7 jours.`,
      href: routes.manageRecruitment(asso),
    },
  ].filter(Boolean) as { key: string; text: string; href: string }[];

  return (
    <div className="flex flex-col gap-10">
      <ManageSection title="En ce moment">
        <StatGroup label="En ce moment">
          <MetricTile k="overview.posts_online" value={o.posts_online} />
          <MetricTile k="overview.events_upcoming" value={o.events_upcoming} />
          <MetricTile k="overview.registrations_upcoming" value={o.registrations_upcoming} />
          <MetricTile k="overview.campaigns_open" value={o.campaigns_open} />
        </StatGroup>
      </ManageSection>

      <ManageSection title="Pendant la période">
        <StatGroup label="Pendant la période" columns={d.rights.events || d.rights.recruitment ? 4 : 3}>
          <MetricTile k="posts.published" value={posts.value} previous={posts.previous} />
          <MetricTile k="events.published" value={published.value} previous={published.previous} />
          <MetricTile k="events.held" value={held.value} previous={held.previous} />
          {d.rights.events && <MetricTile k="registrations.created" value={regs.value} previous={regs.previous} />}
          {d.rights.recruitment && !d.rights.events && (
            <MetricTile k="applications.submitted" value={apps.value} previous={apps.previous} />
          )}
        </StatGroup>
      </ManageSection>

      <ManageSection title="À regarder" description="Des faits du moment, sans interprétation : à toi de juger s'il faut agir.">
        {insights.length === 0 ? (
          <p className="type-small text-muted">Rien à signaler pour l&apos;instant.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
            {insights.map((i) => (
              <li key={i.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span>{i.text}</span>
                <Link href={i.href} className="type-small font-semibold underline underline-offset-2">
                  Ouvrir
                </Link>
              </li>
            ))}
          </ul>
        )}
      </ManageSection>

      <Definitions
        keys={[
          "overview.posts_online",
          "overview.events_upcoming",
          "overview.registrations_upcoming",
          "overview.campaigns_open",
          "posts.published",
          "events.published",
          "events.held",
          ...(d.rights.events ? (["registrations.created"] as MetricKey[]) : []),
        ]}
      />
    </div>
  );
}

/* ---- Articles ------------------------------------------------------------------------------------------- */

export function ContentView({ d, period }: { d: Data; period: Period }) {
  const c = d.sections.content;
  if (!c) return null;
  const posts = pair(d, "posts.published");
  const byKind = KINDS.map((k) => ({ key: k, label: POST_KIND_PLURAL[k], value: total(d.totals, "posts.published", [k]) ?? 0 })).filter(
    (k) => k.value > 0,
  );
  return (
    <div className="flex flex-col gap-10">
      <ManageSection title="Pendant la période">
        <StatGroup label="Articles pendant la période">
          <MetricTile k="posts.published" value={posts.value} previous={posts.previous} />
          <StatTile label="Versions approuvées" value={c.reviews.approved} comparison="Relectures de la période" />
          <StatTile label="Modifications demandées" value={c.reviews.changes_requested} comparison="Relectures de la période" />
          <StatTile
            label="Temps de relecture (médiane)"
            value={formatHours(c.reviews.median_hours)}
            comparison={c.reviews.median_hours == null ? "Aucune approbation sur la période" : "Pendant la période · Calculé"}
          />
        </StatGroup>
        <Trend d={d} period={period} rows={c.series} metricKey="posts.published" valueLabel="Articles publiés" summary="Articles publiés pour la première fois" />
        {byKind.length > 0 && (
          <BarList label="Articles publiés par type" items={byKind} formatValue={(n) => plural(n, "publication")} />
        )}
      </ManageSection>

      <ManageSection title="En ce moment">
        <StatGroup label="Articles en ce moment">
          <MetricTile k="content.online" value={c.online} />
          <MetricTile k="content.drafts" value={c.drafts} />
          <MetricTile k="content.scheduled" value={c.scheduled} />
          <MetricTile k="content.approvals_waiting" value={c.approvals_waiting} />
          <MetricTile k="content.offline" value={c.offline} />
          <StatTile label="Archivés" value={c.archived} comparison="En ce moment · Compté" />
          <MetricTile k="content.hidden" value={c.hidden} />
        </StatGroup>
      </ManageSection>

      <NotMeasured keys={["unavailable.views", "unavailable.engagement"]} />
      <Definitions
        keys={["posts.published", "content.online", "content.drafts", "content.scheduled", "content.approvals_waiting", "content.offline", "content.hidden", "content.reviews.median_hours"]}
      />
    </div>
  );
}

/* ---- Events --------------------------------------------------------------------------------------------- */

const EVENT_STATE: Record<EventRow["state"], { label: string; tone: "ok" | "warn" | "danger" | "info" | "neutral" }> = {
  upcoming: { label: "À venir", tone: "info" },
  live: { label: "En cours", tone: "ok" },
  over: { label: "Passé", tone: "neutral" },
  cancelled: { label: "Annulé", tone: "danger" },
};

export function EventsView({ d, period, asso }: { d: Data; period: Period; asso: string }) {
  const e = d.sections.events;
  if (!e) return null;
  const regs = pair(d, "registrations.created");
  const waitlisted = pair(d, "registrations.waitlisted");
  const promoted = pair(d, "registrations.promoted");
  const cancelled = pair(d, "registrations.cancelled");
  const self = total(d.totals, "registrations.cancelled", ["self"]) ?? 0;
  const held = pair(d, "events.held");
  const evCancelled = pair(d, "events.cancelled");
  const published = pair(d, "events.published");

  return (
    <div className="flex flex-col gap-10">
      <ManageSection title="Pendant la période">
        <StatGroup label="Événements pendant la période" columns={3}>
          <MetricTile k="events.published" value={published.value} previous={published.previous} />
          <MetricTile k="events.held" value={held.value} previous={held.previous} />
          <MetricTile k="events.cancelled" value={evCancelled.value} previous={evCancelled.previous} />
        </StatGroup>
        <StatGroup label="Inscriptions pendant la période">
          <MetricTile k="registrations.created" value={regs.value} previous={regs.previous} />
          <MetricTile k="registrations.waitlisted" value={waitlisted.value} previous={waitlisted.previous} />
          <MetricTile k="registrations.promoted" value={promoted.value} previous={promoted.previous} />
          <MetricTile
            k="registrations.cancelled"
            value={cancelled.value}
            previous={cancelled.previous}
            label={`Désinscriptions${cancelled.value ? ` (${formatCount(self)} par la personne)` : ""}`}
          />
        </StatGroup>
        <Trend d={d} period={period} rows={e.series} metricKey="registrations.created" valueLabel="Inscriptions" summary="Inscriptions faites" />
      </ManageSection>

      <ManageSection title="En ce moment">
        <StatGroup label="Événements en ce moment" columns={2}>
          <StatTile label="Événements à venir" value={e.upcoming} comparison="En ce moment · Compté" />
          <StatTile label="En liste d'attente" value={e.waiting_now} comparison="Personnes en attente d'une place, événements pas encore finis" />
        </StatGroup>
      </ManageSection>

      <ManageSection
        title="Événements de la période"
        count={e.list.length}
        description="Ceux qui commencent pendant la période. Confirmées = places prises sur la plateforme, pas des présences."
      >
        {e.list.length === 0 ? (
          <ManageEmpty as="h3" icon="calendar" title="Aucun événement publié ne commence pendant la période">
            <p>Change la période, ou publie un événement depuis Événements.</p>
          </ManageEmpty>
        ) : (
          <div className="overflow-x-auto rounded-md border border-line bg-raised">
            <table className="w-full min-w-[46rem] border-collapse text-left type-small">
              <caption className="sr-only">Événements qui commencent pendant la période, avec leurs inscriptions</caption>
              <thead>
                <tr className="border-b border-line bg-sunken/60">
                  {["Événement", "Statut", "Confirmées", "Attente", "Désinscrits", "Passés de l'attente", "Remplissage"].map((h) => (
                    <th key={h} scope="col" className="px-3.5 py-2 type-label text-[0.68rem] text-subtle">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {e.list.map((ev) => {
                  const st = EVENT_STATE[ev.state];
                  return (
                    <tr key={ev.id} className="border-b border-line align-top last:border-b-0">
                      <th scope="row" className="px-3.5 py-2.5 font-normal">
                        <Link href={routes.manageEvent(asso, ev.id)} className="font-semibold underline-offset-2 hover:underline">
                          {ev.title}
                        </Link>
                        <span className="block type-meta text-subtle">
                          {formatDayShort(ev.starts_at)} · {formatTime(ev.starts_at)}
                        </span>
                      </th>
                      <td className="px-3.5 py-2.5">
                        <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      </td>
                      {ev.mode === "internal" ? (
                        <>
                          <td className="px-3.5 py-2.5">
                            <CapacityBar confirmed={ev.confirmed} capacity={ev.capacity} />
                          </td>
                          <td className="px-3.5 py-2.5 type-meta">{formatCount(ev.waitlisted)}</td>
                          <td className="px-3.5 py-2.5 type-meta">{formatCount(ev.cancelled)}</td>
                          <td className="px-3.5 py-2.5 type-meta">{formatCount(ev.promoted)}</td>
                          <td className="px-3.5 py-2.5 type-meta">
                            {ev.utilization == null ? <span className="text-subtle">Sans capacité</span> : formatRate(ev.utilization)}
                          </td>
                        </>
                      ) : (
                        <td colSpan={5} className="px-3.5 py-2.5 text-muted">
                          {ev.mode === "external" ? "Inscriptions sur un autre site : la plateforme ne les compte pas." : "Sans inscription."}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </ManageSection>

      {e.by_category.length > 0 && (
        <ManageSection title="Par catégorie" description="Événements publiés qui commencent pendant la période.">
          <BarList
            label="Événements par catégorie"
            items={e.by_category.map((c) => ({ key: c.label, label: c.label, value: c.events }))}
            formatValue={(n) => plural(n, "événement")}
          />
        </ManageSection>
      )}

      <NotMeasured keys={["unavailable.attendance"]} />
      <Definitions
        keys={[
          "events.published",
          "events.held",
          "events.cancelled",
          "registrations.created",
          "registrations.waitlisted",
          "registrations.promoted",
          "registrations.cancelled",
          "event.confirmed",
          "event.utilization",
        ]}
      />
    </div>
  );
}

/* ---- Recruitment ---------------------------------------------------------------------------------------- */

const OUTCOME_LABEL = { offer: "Offre", reject: "Pas retenu·e", waitlist: "Liste d'attente" } as const;
const OFFER_LABEL = { accepted: "Acceptée", declined: "Déclinée", pending: "En attente de réponse", expired: "Expirée ou retirée" } as const;

function Breakdown<K extends string>({
  title,
  data,
  labels,
  k,
}: {
  title: string;
  data: CampaignFunnel["outcomes"] | CampaignFunnel["offers"];
  labels: Record<K, string>;
  k: number;
}) {
  if (!data) return null;
  if (data.total === 0) return <p className="type-small text-muted">{title} : aucune pour l&apos;instant.</p>;
  const cells = data.cells as Partial<Record<K, number | null>>;
  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-semibold">{title}</h4>
      {data.reason && <p className="type-small text-muted">{suppressionText(data.reason, k)}</p>}
      {data.reason !== "small_group" && data.reason !== "single_outcome" && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
          {(Object.keys(labels) as K[]).map((key) => (
            <div key={key} className="flex flex-col">
              <dt className="type-small text-muted">{labels[key]}</dt>
              <dd className="type-meta font-bold">{cells[key] == null ? <SuppressedCell k={k} /> : formatCount(cells[key])}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function CampaignCard({ c, k, asso }: { c: CampaignFunnel; k: number; asso: string }) {
  return (
    <article className="flex flex-col gap-5 rounded-md border border-line bg-raised px-4 py-4 sm:px-5">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="type-card">
          <Link href={routes.manageCampaign(asso, c.id)} className="underline-offset-2 hover:underline">
            {c.title}
          </Link>
        </h3>
        <span className="type-meta text-subtle">
          {formatDayShort(c.opens_at)} → {formatDayShort(c.closes_at)} · {plural(c.positions, "poste")}
        </span>
      </header>
      <Funnel
        k={k}
        base={c.submitted}
        steps={[
          { label: "Candidatures commencées", value: c.started },
          { label: "Candidatures envoyées", value: c.submitted, note: `${plural(c.candidates, "personne distincte", "personnes distinctes")} · ${formatCount(c.withdrawn)} retirée(s) ensuite.` },
          { label: "Relues (au moins une évaluation remise)", value: c.reviewed },
          { label: "Présélectionnées", value: c.shortlisted },
          { label: "En entretien", value: c.interviewed },
        ]}
      />
      {c.small_group && (
        <p className="type-small text-muted">
          Moins de {k} candidatures envoyées&nbsp;: les étapes suivantes, les décisions et les offres restent masquées pour que personne ne
          soit reconnaissable. Elles apparaîtront à partir de {k}.
        </p>
      )}
      <StatGroup label={`Taux de ${c.title}`} columns={3}>
        <RateTile k="campaign.submission_rate" rate={rate(c.submitted, c.started)} detail={`${formatCount(c.submitted)} envoyées sur ${formatCount(c.started)} commencées`} />
        <RateTile
          k="campaign.interview_rate"
          rate={c.interviewed == null ? null : rate(c.interviewed, c.submitted)}
          hidden={c.interviewed == null ? `Masqué : moins de ${k} candidatures envoyées.` : undefined}
          detail={`${formatCount(c.interviewed)} sur ${formatCount(c.submitted)} envoyées`}
        />
        <RateTile
          k="campaign.acceptance_rate"
          rate={c.offers?.cells.accepted == null ? null : rate(c.offers.cells.accepted, c.offers.total)}
          hidden={c.offers && c.offers.total !== 0 && c.offers.cells.accepted == null ? suppressionText(c.offers.reason, k) : c.offers ? undefined : `Masqué : moins de ${k} candidatures envoyées.`}
          detail={`${formatCount(c.offers?.cells.accepted)} sur ${formatCount(c.offers?.total)} offres`}
        />
      </StatGroup>
      <Breakdown title="Décisions annoncées" data={c.outcomes} labels={OUTCOME_LABEL} k={k} />
      <Breakdown title="Réponses aux offres" data={c.offers} labels={OFFER_LABEL} k={k} />
      {c.by_position.length > 1 && (
        <BarList
          label={`Candidatures envoyées par poste, ${c.title}`}
          items={c.by_position.map((p, i) => ({ key: `${i}`, label: p.title, value: p.submitted }))}
          formatValue={(n) => plural(n, "candidature")}
        />
      )}
    </article>
  );
}

export function RecruitmentView({ d, period, asso }: { d: Data; period: Period; asso: string }) {
  const r = d.sections.recruitment;
  const w = d.sections.workflow;
  if (!r && !w) return null;
  const submitted = pair(d, "applications.submitted");
  const withdrawn = pair(d, "applications.withdrawn");
  const started = pair(d, "applications.started");
  return (
    <div className="flex flex-col gap-10">
      {r && (
        <>
          <ManageSection title="Pendant la période" description="Une personne qui postule à deux postes compte deux candidatures et une personne distincte.">
            <StatGroup label="Candidatures pendant la période">
              <MetricTile k="applications.submitted" value={submitted.value} previous={submitted.previous} />
              <MetricTile k="recruitment.candidates" value={r.candidates} />
              <MetricTile k="applications.withdrawn" value={withdrawn.value} previous={withdrawn.previous} />
              <MetricTile k="applications.started" value={started.value} previous={started.previous} />
            </StatGroup>
            <Trend d={d} period={period} rows={r.series} metricKey="applications.submitted" valueLabel="Candidatures envoyées" summary="Candidatures envoyées" />
          </ManageSection>

          <ManageSection
            title="Recrutements de la période"
            count={r.campaigns.length}
            description={`Chaque recrutement en entier, de la première candidature à aujourd'hui. Seuil de confidentialité : ${d.min_group_size}.`}
          >
            {r.campaigns.length === 0 ? (
              <ManageEmpty as="h3" icon="megaphone" title="Aucun recrutement publié pendant la période">
                <p>Les recrutements apparaissent ici dès leur publication.</p>
              </ManageEmpty>
            ) : (
              <div className="flex flex-col gap-5">
                {r.campaigns.map((c) => (
                  <CampaignCard key={c.id} c={c} k={d.min_group_size} asso={asso} />
                ))}
              </div>
            )}
          </ManageSection>
        </>
      )}

      {w && (
        <ManageSection title="Travail en cours" description="Ce qui reste à faire, recrutement par recrutement. Jamais par évaluateur·rice.">
          {w.campaigns.length === 0 ? (
            <p className="type-small text-muted">Aucun recrutement sur la période.</p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-line bg-raised">
              <table className="w-full min-w-[44rem] border-collapse text-left type-small">
                <caption className="sr-only">Travail en cours par recrutement</caption>
                <thead>
                  <tr className="border-b border-line bg-sunken/60">
                    {["Recrutement", "À attribuer", "Évaluations manquantes", "Évaluations complètes", "Entretiens à caler", "Entretiens prévus", "Décisions à valider", "Décisions à annoncer", "Offres sans réponse"].map((h) => (
                      <th key={h} scope="col" className="px-3 py-2 type-label text-[0.66rem] text-subtle">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {w.campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-line last:border-b-0">
                      <th scope="row" className="px-3 py-2.5">
                        <Link href={routes.manageCampaignReview(asso, c.id)} className="font-semibold underline-offset-2 hover:underline">
                          {c.title}
                        </Link>
                      </th>
                      {[c.awaiting_assignment, c.awaiting_reviews, c.reviews_done, c.interviews_to_schedule, c.interviews_scheduled, c.decisions_proposed, c.decisions_to_release, c.offers_pending].map((n, i) => (
                        <td key={i} className="px-3 py-2.5 type-meta">
                          {formatCount(n)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ManageSection>
      )}

      <Definitions
        keys={[
          ...(r
            ? ([
                "applications.submitted",
                "recruitment.candidates",
                "applications.withdrawn",
                "applications.started",
                "campaign.funnel",
                "campaign.submission_rate",
                "campaign.interview_rate",
                "campaign.outcomes",
                "campaign.offers",
                "campaign.acceptance_rate",
              ] as MetricKey[])
            : []),
          ...(w ? (["workflow.items"] as MetricKey[]) : []),
        ]}
      />
    </div>
  );
}

/* ---- Team ----------------------------------------------------------------------------------------------- */

export function TeamView({ d, asso }: { d: Data; asso: string }) {
  const t = d.sections.team;
  if (!t) return null;
  const issues = t.issues.critical + t.issues.warning + t.issues.info;
  return (
    <div className="flex flex-col gap-10">
      <ManageSection title="En ce moment">
        <StatGroup label="L'équipe en ce moment" columns={3}>
          <MetricTile k="team.members_active" value={t.members_active} />
          <StatTile label="Membres suspendus" value={t.members_suspended} comparison="En ce moment · Compté" />
          <StatTile label="Postes occupés" value={t.positions_held} comparison="Mandats en cours" />
          <MetricTile k="team.mandates_ending_60d" value={t.mandates_ending_60d} tone={t.mandates_ending_60d > 0 ? "accent" : "neutral"} />
          <StatTile label="Présidence" value={t.presidency ? "Occupée" : "Vacante"} tone={t.presidency ? "ok" : "danger"} comparison={t.presidency ? "Un mandat en cours" : "Personne ne préside en ce moment"} />
          <StatTile
            label="Points de continuité"
            value={issues}
            tone={t.issues.critical > 0 ? "danger" : "neutral"}
            comparison={issues ? `${t.issues.critical} critique(s), ${t.issues.warning} à surveiller` : "Rien d'ouvert"}
          />
        </StatGroup>
      </ManageSection>
      <p className="type-small text-muted">
        Les personnes, leurs postes et la passation sont dans{" "}
        <Link href={routes.manageTeam(asso)} className="font-semibold underline underline-offset-2">
          Équipe
        </Link>{" "}
        et{" "}
        <Link href={routes.manageHandover(asso)} className="font-semibold underline underline-offset-2">
          Passation
        </Link>
        .
      </p>
      <Definitions keys={["team.members_active", "team.mandates_ending_60d"]} />
    </div>
  );
}
