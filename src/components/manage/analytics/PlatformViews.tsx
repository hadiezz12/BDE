import Link from "next/link";
import { routes } from "@/lib/routes";
import { formatDateLong, formatTime, plural } from "@/lib/format";
import { buckets, bucketSeries, total, type Period } from "@/lib/analytics/period";
import { formatCount } from "@/lib/analytics/compare";
import type { MetricKey } from "@/lib/analytics/metrics";
import type { PlatformAnalytics, Suppressed } from "@/lib/data/analytics";
import { setAnalyticsThreshold, recomputeAnalytics } from "@/app/actions/analytics";
import { Field, Input } from "@/components/ui/Field";
import { ManageSection } from "@/components/manage/ManagePageHeader";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { MfaNotice } from "@/components/manage/governance/Notices";
import { BarList } from "./BarList";
import { ColumnChart } from "./ColumnChart";
import { bucketColumns } from "./chart-data";
import { Definitions, MetricTile, NotMeasured, SuppressedCell, suppressionText } from "./AnalyticsBlocks";

/**
 * The views of the platform statistics (/manage/plateforme/statistiques?vue=…),
 * for the BDE: campus-wide totals and trends, never a person. Recruitment is
 * shown in totals and suppressed breakdowns only (no campus-wide count of
 * distinct candidates, nothing below an association, months under the
 * threshold hidden). Each view reads only the section the database filled
 * for this person's keys.
 */

type Data = PlatformAnalytics;
const GRANULARITY_WORD = { day: "par jour", week: "par semaine", month: "par mois" } as const;

function pair(d: Data, m: string, dims?: string[]) {
  return { value: total(d.totals, m, dims), previous: d.compare ? total(d.compare, m, dims) : undefined };
}

function Trend({ d, period, rows, metricKey, valueLabel, summary }: {
  d: Data;
  period: Period;
  rows: [string, string, string, number][];
  metricKey: string;
  valueLabel: string;
  summary: string;
}) {
  if (!d.freshness?.data_through) return null;
  const bs = buckets(period, period.granularity);
  const values = bucketSeries(rows, metricKey, bs);
  const sum = values.reduce((a, b) => a + b, 0);
  // Nothing in the period: one sentence, not an empty drawing.
  if (sum === 0) return <p className="type-small text-muted">{summary} {GRANULARITY_WORD[period.granularity]}&nbsp;: aucune sur la période.</p>;
  return (
    <ColumnChart
      data={bucketColumns(bs, values)}
      valueLabel={valueLabel}
      periodLabel={period.granularity === "day" ? "Jour" : period.granularity === "week" ? "Semaine" : "Mois"}
      summary={`${summary} ${GRANULARITY_WORD[period.granularity]}, toutes assos confondues : ${formatCount(sum)} en tout.`}
    />
  );
}

/* ---- Overview ------------------------------------------------------------------------------------------- */

export function PlatformOverview({ d }: { d: Data }) {
  const a = d.sections.associations;
  const i = d.sections.insights;
  if (!a) return null;
  const posts = pair(d, "posts.published");
  const held = pair(d, "events.held");
  const regs = pair(d, "registrations.created");
  return (
    <div className="flex flex-col gap-10">
      <ManageSection title="Assos et membres">
        <StatGroup label="Assos et membres en ce moment" columns={3}>
          <MetricTile k="platform.associations_active" value={a.active} />
          <StatTile label="Pages publiques" value={a.pages_public} comparison="En ce moment · Compté" />
          <MetricTile k="platform.members_distinct" value={a.members_distinct} />
          <MetricTile k="platform.memberships_active" value={a.memberships_active} />
          <StatTile label="Assos créées" value={a.created} comparison="Pendant la période · Compté" />
          <StatTile label="Assos archivées" value={a.archived} comparison="Pendant la période · Compté" />
        </StatGroup>
      </ManageSection>
      <ManageSection title="Pendant la période">
        <StatGroup label="Activité pendant la période" columns={3}>
          <MetricTile k="posts.published" value={posts.value} previous={posts.previous} />
          <MetricTile k="events.held" value={held.value} previous={held.previous} />
          <MetricTile k="registrations.created" value={regs.value} previous={regs.previous} />
        </StatGroup>
      </ManageSection>
      {i && (
        <ManageSection title="À regarder" description="Des faits du moment, sans interprétation.">
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
            <li className="px-4 py-3">{plural(i.approvals_waiting_2d, "version attend", "versions attendent")} une relecture depuis plus de deux jours.</li>
            <li className="px-4 py-3">{plural(i.events_near_capacity, "événement à venir est rempli", "événements à venir sont remplis")} à 90 % ou plus.</li>
            <li className="px-4 py-3">{plural(i.campaigns_closing_week, "recrutement ferme", "recrutements ferment")} dans les 7 jours.</li>
          </ul>
        </ManageSection>
      )}
      <Definitions keys={["platform.associations_active", "platform.members_distinct", "platform.memberships_active", "posts.published", "events.held", "registrations.created"]} />
      <NotMeasured keys={["unavailable.visitors", "unavailable.views", "unavailable.attendance"]} />
    </div>
  );
}

/* ---- Articles ------------------------------------------------------------------------------------------- */

export function PlatformContent({ d, period }: { d: Data; period: Period }) {
  const c = d.sections.content;
  if (!c) return null;
  const posts = pair(d, "posts.published");
  return (
    <div className="flex flex-col gap-10">
      <ManageSection title="Pendant la période">
        <StatGroup label="Articles" columns={4}>
          <MetricTile k="posts.published" value={posts.value} previous={posts.previous} />
          <StatTile label="En ligne" value={c.online} comparison="En ce moment · Compté" />
          <StatTile label="En attente de relecture" value={c.approvals_waiting} comparison="En ce moment · Compté" />
          <StatTile label="Masqués par le BDE" value={c.hidden} comparison="En ce moment · Compté" />
        </StatGroup>
        <Trend d={d} period={period} rows={c.series} metricKey="posts.published" valueLabel="Articles publiés" summary="Articles publiés pour la première fois" />
      </ManageSection>
      {c.by_association.length > 0 && (
        <ManageSection title="Par asso" description="Articles publiés pour la première fois pendant la période (contenus publics).">
          <BarList
            label="Articles publiés par asso"
            items={c.by_association.map((a) => ({ key: a.slug, label: a.name, value: a.published }))}
            formatValue={(n) => plural(n, "article")}
          />
        </ManageSection>
      )}
      <NotMeasured keys={["unavailable.views", "unavailable.engagement"]} />
    </div>
  );
}

/* ---- Events --------------------------------------------------------------------------------------------- */

export function PlatformEvents({ d, period }: { d: Data; period: Period }) {
  const e = d.sections.events;
  if (!e) return null;
  const published = pair(d, "events.published");
  const held = pair(d, "events.held");
  const cancelled = pair(d, "events.cancelled");
  const regs = pair(d, "registrations.created");
  const unregs = pair(d, "registrations.cancelled");
  return (
    <div className="flex flex-col gap-10">
      <ManageSection title="Pendant la période">
        <StatGroup label="Événements pendant la période" columns={3}>
          <MetricTile k="events.published" value={published.value} previous={published.previous} />
          <MetricTile k="events.held" value={held.value} previous={held.previous} />
          <MetricTile k="events.cancelled" value={cancelled.value} previous={cancelled.previous} />
          <MetricTile k="registrations.created" value={regs.value} previous={regs.previous} />
          <MetricTile k="registrations.cancelled" value={unregs.value} previous={unregs.previous} />
          <StatTile
            label="Places confirmées des événements passés"
            value={e.confirmed_for_held}
            comparison="Pendant la période · Compté — des places, pas des présences"
          />
        </StatGroup>
        <Trend d={d} period={period} rows={e.series} metricKey="registrations.created" valueLabel="Inscriptions" summary="Inscriptions faites" />
      </ManageSection>
      <ManageSection title="En ce moment">
        <StatGroup label="Événements en ce moment" columns={2}>
          <StatTile label="Événements à venir" value={e.upcoming} comparison="Publiés, toutes assos" />
        </StatGroup>
      </ManageSection>
      {e.by_association.length > 0 && (
        <ManageSection title="Par asso" description="Comptes de la période. Le détail des inscrits reste à chaque asso.">
          <div className="overflow-x-auto rounded-md border border-line bg-raised">
            <table className="w-full min-w-[32rem] border-collapse text-left type-small">
              <caption className="sr-only">Événements et inscriptions par asso pendant la période</caption>
              <thead>
                <tr className="border-b border-line bg-sunken/60">
                  {["Asso", "Passés", "Annulés", "Inscriptions"].map((h) => (
                    <th key={h} scope="col" className="px-3.5 py-2 type-label text-[0.68rem] text-subtle">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {e.by_association.map((a) => (
                  <tr key={a.slug} className="border-b border-line last:border-b-0">
                    <th scope="row" className="px-3.5 py-2 font-semibold">
                      {a.name}
                    </th>
                    <td className="px-3.5 py-2 type-meta">{formatCount(a.held)}</td>
                    <td className="px-3.5 py-2 type-meta">{formatCount(a.cancelled)}</td>
                    <td className="px-3.5 py-2 type-meta">{formatCount(a.registrations)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ManageSection>
      )}
      <NotMeasured keys={["unavailable.attendance"]} />
    </div>
  );
}

/* ---- Recruitment ---------------------------------------------------------------------------------------- */

function SuppressedList({ title, data, labels, k }: { title: string; data: Suppressed; labels?: Record<string, string>; k: number }) {
  const keys = Object.keys(data.cells);
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold">{title}</h3>
      {data.total === 0 ? (
        <p className="type-small text-muted">Aucune sur la période.</p>
      ) : (
        <>
          {data.reason && <p className="type-small text-muted">{suppressionText(data.reason, k)}</p>}
          {data.reason !== "small_group" && data.reason !== "single_outcome" && (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {keys.map((key) => (
                <div key={key} className="flex items-baseline justify-between gap-3 border-b border-line py-1">
                  <dt>{labels?.[key] ?? key}</dt>
                  <dd className="type-meta font-bold">{data.cells[key] == null ? <SuppressedCell k={k} /> : formatCount(data.cells[key])}</dd>
                </div>
              ))}
            </dl>
          )}
        </>
      )}
    </div>
  );
}

export function PlatformRecruitment({ d }: { d: Data }) {
  const r = d.sections.recruitment;
  if (!r) return null;
  const k = d.min_group_size;
  const hidden = d.suppressed_totals.includes("applications.submitted:");
  const submitted = pair(d, "applications.submitted");
  return (
    <div className="flex flex-col gap-10">
      <ManageSection
        title="Recrutement, toutes assos"
        description={`En totaux seulement : jamais une personne, jamais un nombre de candidat·es distinct·es sur tout le campus. Seuil de confidentialité : ${k}.`}
      >
        <StatGroup label="Recrutement" columns={4}>
          <StatTile label="Recrutements ouverts" value={r.campaigns_open} comparison="En ce moment · Compté" />
          <StatTile label="Postes ouverts" value={r.positions_open} comparison="En ce moment · Compté" />
          <StatTile label="Recrutements publiés" value={r.campaigns_published} comparison="Pendant la période · Compté" />
          <MetricTile
            k="applications.submitted"
            value={hidden ? null : submitted.value}
            previous={hidden ? undefined : submitted.previous}
            hiddenReason={hidden ? `Moins de ${k} : masqué.` : undefined}
          />
        </StatGroup>
      </ManageSection>
      <ManageSection title="Candidatures envoyées par mois" description="Par mois seulement : un détail par jour permettrait de reconnaître une candidature.">
        {r.submitted_by_month.length === 0 ? (
          <p className="type-small text-muted">Aucune candidature envoyée sur la période.</p>
        ) : (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
            {r.submitted_by_month.map(([month, n]) => (
              <div key={month} className="flex items-baseline justify-between gap-3 border-b border-line py-1">
                <dt>{new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-15T12:00:00Z`))}</dt>
                <dd className="type-meta font-bold">{n == null ? <SuppressedCell k={k} /> : formatCount(n)}</dd>
              </div>
            ))}
          </dl>
        )}
      </ManageSection>
      <ManageSection title="Détails masqués sous le seuil">
        <div className="flex flex-col gap-6">
          <SuppressedList title="Candidatures envoyées par asso" data={r.by_association} k={k} />
          <SuppressedList title="Décisions annoncées" data={r.outcomes} labels={{ offer: "Offre", reject: "Pas retenu·e", waitlist: "Liste d'attente" }} k={k} />
          <SuppressedList title="Réponses aux offres" data={r.offers} labels={{ accepted: "Acceptée", declined: "Déclinée" }} k={k} />
        </div>
      </ManageSection>
      <Definitions keys={["applications.submitted", "platform.recruitment_by_association", "campaign.outcomes", "campaign.offers"]} />
    </div>
  );
}

/* ---- Governance ----------------------------------------------------------------------------------------- */

export function PlatformGovernance({ d }: { d: Data }) {
  const g = d.sections.governance;
  if (!g) return null;
  return (
    <div className="flex flex-col gap-10">
      <ManageSection title="Continuité, en ce moment">
        <StatGroup label="Gouvernance en ce moment" columns={3}>
          <StatTile label="Présidence du BDE" value={g.bde_president ? "Occupée" : "Vacante"} tone={g.bde_president ? "ok" : "danger"} />
          <StatTile label="Vice-présidence du BDE" value={g.bde_vice_president ? "Occupée" : "Vacante"} tone={g.bde_vice_president ? "ok" : "danger"} />
          <StatTile label="Assos sans présidence" value={g.associations_without_president} tone={g.associations_without_president ? "accent" : "neutral"} />
          <StatTile label="Mandats qui finissent sous 30 jours" value={g.mandates_ending_30d} />
          <StatTile label="Passations ouvertes" value={g.transitions_open} />
          <StatTile
            label="Points de continuité ouverts"
            value={g.issues.critical + g.issues.warning + g.issues.info}
            tone={g.issues.critical ? "danger" : "neutral"}
            comparison={`${g.issues.critical} critique(s), ${g.issues.warning} à surveiller`}
          />
        </StatGroup>
      </ManageSection>
      <p className="type-small text-muted">
        Le détail est dans{" "}
        <Link href={routes.managePlatformContinuity} className="font-semibold underline underline-offset-2">
          Continuité
        </Link>
        .
      </p>
    </div>
  );
}

/* ---- Messages ------------------------------------------------------------------------------------------- */

export function PlatformMessages({ d, period }: { d: Data; period: Period }) {
  const m = d.sections.messages;
  if (!m) return null;
  const keys: MetricKey[] = ["notifications.created", "deliveries.accepted", "deliveries.delivered", "deliveries.failed", "deliveries.suppressed"];
  return (
    <div className="flex flex-col gap-10">
      <ManageSection title="Pendant la période">
        <StatGroup label="Messages pendant la période" columns={3}>
          {keys.map((key) => {
            const p = pair(d, key);
            return <MetricTile key={key} k={key} value={p.value} previous={p.previous} />;
          })}
        </StatGroup>
        <Trend d={d} period={period} rows={m.series} metricKey="deliveries.accepted" valueLabel="E-mails acceptés" summary="E-mails acceptés par le prestataire" />
      </ManageSection>
      <ManageSection title="En ce moment">
        <StatGroup label="File d'envoi" columns={3}>
          <StatTile label="E-mails en file" value={m.backlog.queued} />
          <StatTile label="En nouvelle tentative" value={m.backlog.retrying} />
          <StatTile
            label="Plus ancien en file"
            value={m.backlog.oldest_queued_at ? formatTime(m.backlog.oldest_queued_at) : "—"}
            comparison={m.backlog.oldest_queued_at ? formatDateLong(m.backlog.oldest_queued_at) : "File vide"}
          />
        </StatGroup>
      </ManageSection>
      <NotMeasured keys={["unavailable.email_opens"]} />
      <Definitions keys={keys} />
    </div>
  );
}

/* ---- Settings (platform.analytics.configure) ------------------------------------------------------------ */

export function PlatformSettings({ d, aal2, today }: { d: Data; aal2: boolean; today: string }) {
  const f = d.freshness;
  return (
    <div className="flex flex-col gap-10">
      {!aal2 && <MfaNotice what="Changer le seuil ou recalculer des jours" />}
      <ManageSection
        title="Seuil de confidentialité"
        description={`Aujourd'hui ${d.min_group_size}. Sous ce nombre, un groupe n'est pas montré (recrutement, issues, détails par asso), partout et pour tout le monde, dès l'enregistrement. Entre 3 et 20 ; plus haut protège mieux, mais masque plus.`}
      >
        <ActionForm action={setAnalyticsThreshold} submitLabel="Enregistrer le seuil" variant="secondary" size="sm">
          <Field label="Seuil">
            {({ id, describedBy }) => (
              <Input id={id} aria-describedby={describedBy} type="number" name="min_group_size" min={3} max={20} step={1} required defaultValue={d.min_group_size} />
            )}
          </Field>
        </ActionForm>
      </ManageSection>
      <ManageSection
        title="Recalculer des jours"
        description="Le calcul horaire refait les 40 derniers jours. Pour une correction plus ancienne, recalcule ici (400 jours au plus, pas dans l'avenir). Attention : un jour dont une règle de conservation a déjà supprimé les données perd ces comptes."
      >
        {f && (
          <p className="type-small text-muted">
            Dernier contrôle des jours plus anciens{f.reconciled_from ? ` (${f.reconciled_from} → ${f.reconciled_to})` : ""} :{" "}
            {f.differences === 0 ? "aucun écart." : `${plural(f.differences, "écart")} entre les comptes gardés et les données d'aujourd'hui.`}
          </p>
        )}
        <ActionForm action={recomputeAnalytics} submitLabel="Recalculer" variant="secondary" size="sm">
          <div className="flex flex-wrap gap-3">
            <Field label="Du">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="from" required min="2020-01-01" max={today} />}
            </Field>
            <Field label="Au">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="to" required min="2020-01-01" max={today} />}
            </Field>
          </div>
        </ActionForm>
      </ManageSection>
    </div>
  );
}
