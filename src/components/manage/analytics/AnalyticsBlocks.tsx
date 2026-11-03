import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { formatTime, relativeDay } from "@/lib/format";
import { PRESETS, formatRange, periodQuery, type Period } from "@/lib/analytics/period";
import { change, describeChange, formatCount, formatRate } from "@/lib/analytics/compare";
import { QUALITY_LABEL, TIME_LABEL, UNAVAILABLE, metric, type MetricKey } from "@/lib/analytics/metrics";
import type { Freshness, SuppressionReason } from "@/lib/data/analytics";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { StatTile } from "@/components/manage/StatTile";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { Notice } from "@/components/manage/governance/Notices";

/**
 * The building blocks of the statistics pages (Phase 13): the period bar,
 * the view tabs, the freshness line, a tile that compares with the previous
 * period, the definitions, and the words for what is hidden or not measured.
 * Server components: plain links and GET forms, no client state.
 */

/* ---- Period ------------------------------------------------------------------------------------------- */

export function PeriodBar({
  period,
  basePath,
  view,
  message,
}: {
  period: Period;
  basePath: string;
  view?: string;
  /** Why the URL's period was not used (malformed dates…). */
  message?: string | null;
}) {
  const link = (preset: string) => {
    const q = new URLSearchParams();
    if (view) q.set("vue", view);
    if (preset !== "30j") q.set("periode", preset);
    if (!period.compareOn) q.set("comparer", "non");
    const s = q.toString();
    return `${basePath}${s ? `?${s}` : ""}`;
  };
  const toggle = `${basePath}${periodQuery({ ...period, compareOn: !period.compareOn }, { vue: view })}`;

  return (
    <section aria-label="Période" className="flex flex-col gap-4 rounded-md border border-line bg-raised px-4 py-4 sm:px-5">
      {message && (
        <p role="status" className="flex items-start gap-2 type-small text-warn">
          <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
          {message}
        </p>
      )}
      <nav aria-label="Choisir la période">
        <ul className="flex flex-wrap gap-1.5">
          {PRESETS.filter((p) => p.key !== "perso").map((p) => {
            const active = period.preset === p.key;
            return (
              <li key={p.key}>
                <Link
                  href={link(p.key)}
                  aria-current={active ? "true" : undefined}
                  className={cx(
                    "inline-flex min-h-9 items-center rounded-sm border px-3 text-[0.8rem] font-semibold transition-colors",
                    active ? "border-fg bg-fg text-raised" : "border-line-strong text-muted hover:border-fg hover:text-fg",
                  )}
                >
                  {p.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="flex flex-col gap-1">
        <p className="font-bold">
          {period.label}
          {period.preset !== "perso" && <span className="font-normal text-muted"> · {formatRange(period)}</span>}
        </p>
        <p className="type-small text-muted">
          {period.compare ? (
            <>
              {period.compare.explanation} Période de comparaison&nbsp;: {period.compare.label}.{" "}
            </>
          ) : period.compareOn ? (
            "Pas de période comparable avant celle-ci. "
          ) : (
            "Sans comparaison. "
          )}
          <Link href={toggle} className="font-semibold text-fg underline underline-offset-2">
            {period.compareOn ? "Ne pas comparer" : "Comparer avec la période d'avant"}
          </Link>
        </p>
      </div>
      <Disclosure summary="Choisir des dates" icon="calendar" open={period.preset === "perso"}>
        <form method="get" action={basePath} className="flex flex-wrap items-end gap-3 px-3.5 pb-3.5">
          {view && <input type="hidden" name="vue" value={view} />}
          {!period.compareOn && <input type="hidden" name="comparer" value="non" />}
          <Field label="Du">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="du" required min="2020-01-01" defaultValue={period.from} />}
          </Field>
          <Field label="Au">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="au" required min="2020-01-01" defaultValue={period.to} />}
          </Field>
          <Button type="submit" variant="secondary" size="sm">
            Afficher
          </Button>
          <p className="basis-full type-small text-muted">Deux ans au plus à la fois, jours de Paris, début et fin compris.</p>
        </form>
      </Disclosure>
    </section>
  );
}

/* ---- Views -------------------------------------------------------------------------------------------- */

export function ViewTabs({
  label,
  basePath,
  views,
  current,
  period,
}: {
  label: string;
  basePath: string;
  views: { key: string; label: string }[];
  current: string;
  period: Period;
}) {
  return (
    <nav aria-label={label} className="-mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] [scrollbar-width:none] lg:mx-0 lg:px-0">
      <ul className="flex min-w-max gap-1 border-b border-line">
        {views.map((v, i) => {
          const active = v.key === current;
          return (
            <li key={v.key}>
              <Link
                href={`${basePath}${periodQuery(period, { vue: i === 0 ? undefined : v.key })}`}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "relative flex min-h-11 items-center whitespace-nowrap px-3 text-[0.9rem] font-semibold transition-colors",
                  active ? "text-fg" : "text-muted hover:text-fg",
                )}
              >
                {v.label}
                <span aria-hidden className={cx("absolute inset-x-3 -bottom-px h-[3px] rounded-t-full bg-assoc", active ? "opacity-100" : "opacity-0")} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ---- Freshness ---------------------------------------------------------------------------------------- */

/**
 * When the period counts were last computed. "En ce moment" figures are read
 * live; the counts over a period come from the hourly job, and a failed or
 * late job says so instead of passing old numbers off as current.
 */
export function FreshnessLine({ freshness }: { freshness: Freshness | null }) {
  const at = freshness?.data_through;
  if (!freshness || !at) {
    return (
      <Notice tone="warn" icon="clock" title="Les comptes par période ne sont pas encore calculés">
        <p>
          Le calcul tourne toutes les heures. Les chiffres « En ce moment » sont déjà exacts ; ceux d&apos;une période apparaîtront après
          le premier passage.
        </p>
      </Notice>
    );
  }
  const when = `${relativeDay(at).toLowerCase()} à ${formatTime(at)}`;
  if (freshness.stale) {
    return (
      <Notice tone="warn" icon="clock" title={`Comptes par période arrêtés ${when}`}>
        <p>
          Le calcul horaire n&apos;a pas réussi depuis
          {freshness.last_failed_at ? " : l'échec est signalé au BDE dans Continuité › Opérations" : ""}. Les chiffres d&apos;une période
          s&apos;arrêtent à ce moment-là ; ceux «&nbsp;En ce moment&nbsp;» restent exacts.
        </p>
      </Notice>
    );
  }
  return (
    <p className="flex items-center gap-2 type-small text-muted">
      <Icon name="clock" size={15} className="shrink-0" />
      Comptes par période calculés {when} (toutes les heures). Les chiffres «&nbsp;En ce moment&nbsp;» sont lus à l&apos;instant.
    </p>
  );
}

/* ---- Tiles -------------------------------------------------------------------------------------------- */

/**
 * A count with its comparison, its kind (counted, calculated) and when it
 * applies. `value` null = hidden by the threshold or unavailable: the tile
 * says which, never shows 0 in its place.
 */
export function MetricTile({
  k,
  value,
  previous,
  label,
  hiddenReason,
  of,
  tone,
}: {
  k: MetricKey;
  value: number | null;
  previous?: number | null;
  label?: string;
  hiddenReason?: string;
  of?: number;
  tone?: "neutral" | "ok" | "accent" | "danger";
}) {
  const d = metric(k);
  const c = previous === undefined ? null : describeChange(change(value, previous), previous);
  return (
    <StatTile
      label={label ?? d.label}
      value={value == null ? "—" : value}
      of={of}
      tone={tone}
      comparison={
        <span className="flex flex-col gap-0.5">
          {value == null && hiddenReason && <span className="text-fg">{hiddenReason}</span>}
          {c && <span className="text-fg">{c}</span>}
          <span className="text-subtle">
            {TIME_LABEL[d.time]} · {QUALITY_LABEL[d.quality]}
          </span>
        </span>
      }
    />
  );
}

/** A rate tile: "—" when the denominator is zero, never 0 % or 100 % by default. */
export function RateTile({ k, rate, detail, hidden }: { k: MetricKey; rate: number | null; detail: ReactNode; hidden?: string }) {
  const d = metric(k);
  return (
    <StatTile
      label={d.label}
      value={hidden ? "—" : formatRate(rate)}
      comparison={
        <span className="flex flex-col gap-0.5">
          <span className="text-fg">{hidden ?? (rate == null ? "Pas de taux : rien à diviser." : detail)}</span>
          <span className="text-subtle">
            {TIME_LABEL[d.time]} · {QUALITY_LABEL[d.quality]}
          </span>
        </span>
      }
    />
  );
}

/* ---- Words for what is hidden or not measured ---------------------------------------------------------- */

export function suppressionText(reason: SuppressionReason, k: number): string {
  switch (reason) {
    case "small_group":
      return `Moins de ${k} personnes : rien n'est affiché, pour que personne ne soit reconnaissable.`;
    case "single_outcome":
      return "Une seule issue pour tout le groupe : le détail dirait le résultat de chacun·e, il est masqué.";
    case "small_cells":
      return `Les cases sous ${k} sont masquées, et une autre avec elles pour qu'on ne puisse pas les retrouver par soustraction.`;
    default:
      return "";
  }
}

export function SuppressedCell({ k }: { k: number }) {
  return (
    <span className="type-meta text-subtle" title={`Moins de ${k} : masqué`}>
      masqué<span className="sr-only"> (moins de {k})</span>
    </span>
  );
}

/** "Ce que la plateforme ne mesure pas" — said once per view, never shown as zero. */
export function NotMeasured({ keys = UNAVAILABLE }: { keys?: MetricKey[] }) {
  return (
    <section aria-labelledby="non-mesure" className="flex flex-col gap-3 rounded-md border border-dashed border-line-strong px-4 py-4 sm:px-5">
      <h2 id="non-mesure" className="type-label text-[0.75rem] text-subtle">
        Non mesuré
      </h2>
      <ul className="flex flex-col gap-2">
        {keys.map((key) => {
          const d = metric(key);
          return (
            <li key={key} className="type-small">
              <span className="font-semibold">{d.label}</span> <span className="text-muted">— {d.description}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The definitions of the figures on a view, from the metric dictionary. */
export function Definitions({ keys }: { keys: MetricKey[] }) {
  return (
    <Disclosure summary="Définitions des chiffres" icon="info">
      <dl className="flex flex-col gap-3 px-3.5 pb-3.5">
        {keys.map((key) => {
          const d = metric(key);
          return (
            <div key={key} className="flex flex-col gap-0.5 border-t border-line pt-3 first:border-t-0 first:pt-0">
              <dt className="font-semibold">{d.label}</dt>
              <dd className="type-small text-muted">{d.description}</dd>
              <dd className="type-meta text-subtle">
                {QUALITY_LABEL[d.quality]} · {TIME_LABEL[d.time]} · {d.refresh === "hourly" ? "calcul horaire" : "lu à l'instant"} · source&nbsp;:{" "}
                {d.source} · calcul&nbsp;: {d.formula}
              </dd>
            </div>
          );
        })}
      </dl>
    </Disclosure>
  );
}

/* ---- Bars --------------------------------------------------------------------------------------------- */

/** Seats taken against a capacity, as words plus a thin bar (decorative). */
export function CapacityBar({ confirmed, capacity }: { confirmed: number; capacity: number | null }) {
  if (!capacity) return <span className="type-meta">{formatCount(confirmed)}</span>;
  const ratio = Math.min(1, confirmed / capacity);
  return (
    <span className="flex min-w-28 flex-col gap-1">
      <span className="type-meta">
        {formatCount(confirmed)} / {formatCount(capacity)}
      </span>
      <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-sunken">
        <span className="block h-full rounded-full bg-assoc" style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>
    </span>
  );
}

/**
 * The stages of a recruitment, each against the applications sent (the
 * denominator is printed with the rate). A hidden stage says why.
 */
export function Funnel({
  steps,
  base,
  k,
}: {
  steps: { label: string; value: number | null; note?: string }[];
  /** Applications sent: the denominator of every rate after it. */
  base: number;
  k: number;
}) {
  const max = Math.max(1, ...steps.map((s) => s.value ?? 0));
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((s, i) => (
        <li key={s.label} className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
            <span className="font-semibold">
              <span className="type-meta text-subtle">{i + 1}. </span>
              {s.label}
            </span>
            <span className="type-meta text-muted">
              {s.value == null ? (
                <SuppressedCell k={k} />
              ) : (
                <>
                  <strong className="font-bold text-fg">{formatCount(s.value)}</strong>
                  {i > 1 && base > 0 && <> · {formatRate(s.value / base)} des envoyées</>}
                </>
              )}
            </span>
          </div>
          <div aria-hidden className="h-2.5 rounded-full bg-sunken">
            {s.value != null && <span className="block h-full rounded-full bg-assoc" style={{ width: `${(s.value / max) * 100}%` }} />}
          </div>
          {s.note && <p className="type-small text-muted">{s.note}</p>}
        </li>
      ))}
    </ol>
  );
}
