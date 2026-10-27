import type { Metadata } from "next";
import { getAuthContext } from "@/lib/auth/context";
import { formatDateLong } from "@/lib/format";
import { getMyAccess, hasPlatform } from "@/lib/governance/access";
import { toDateInput } from "@/lib/governance/labels";
import { getAcademicYears, getYearPreparation, type AcademicYear, type Check } from "@/lib/continuity/data";
import { BACKUP_KIND, BACKUP_STATUS, NOTIFICATION_MODE, YEAR_AUTO_CHECK, YEAR_MANUAL_CHECK } from "@/lib/continuity/labels";
import { confirmRollover, confirmYearCheck, saveAcademicYear } from "@/app/actions/continuity";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { MfaNotice, Notice } from "@/components/manage/governance/Notices";
import { PlatformDenied } from "@/components/manage/moderation/PlatformDenied";

export const metadata: Metadata = { title: "Année universitaire" };

const STATUS: Record<AcademicYear["status"], { label: string; tone: "ok" | "neutral" | "warn" }> = {
  current: { label: "En cours", tone: "ok" },
  planned: { label: "Préparée", tone: "warn" },
  closed: { label: "Terminée", tone: "neutral" },
};

const n = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));

/** One automatic check in words (counts and offices only). */
function describe(check: Check): string {
  const v = check.value as Record<string, unknown> | number | string | null;
  switch (check.key) {
    case "year_configured":
      return String(v ?? "");
    case "bde_president_next":
    case "bde_vice_president_next":
      return v ? String(v) : check.detail === "transition_open" ? "Personne encore : une passation est en cours" : "Personne prévue";
    case "bde_transition": {
      const d = check.detail as { approvals: string[]; accepted: number; candidates: number };
      return `Effet le ${formatDateLong(String(v))} · ${d.approvals.length} approbation${d.approvals.length > 1 ? "s" : ""} · ${d.accepted}/${d.candidates} acceptée${d.candidates > 1 ? "s" : ""}`;
    }
    case "association_presidents": {
      const c = v as { covered: number; total: number };
      const missing = (check.detail as Array<{ name: string }>) ?? [];
      return `${c.covered}/${c.total}${missing.length ? ` · sans présidence à cette date : ${missing.map((m) => m.name).join(", ")}` : ""}`;
    }
    case "recruitment_campaigns": {
      const c = v as { campaigns: number; expiring_reviewers: number };
      return `${c.campaigns} en cours${c.expiring_reviewers ? ` · ${c.expiring_reviewers} accès au comité finissent avant le début de l'année` : ""}`;
    }
    case "guardian":
      return v ? String(v) : "Personne";
    case "jobs_healthy":
      return check.status === "info" ? "Impossible à vérifier ici" : n(v) === 0 ? "Toutes à l'heure" : `${n(v)} à vérifier`;
    case "backups_verified":
      return (v as unknown as Array<{ kind: string; status: string }>)
        .filter((b) => b.kind.endsWith("restore_test"))
        .map((b) => `${BACKUP_KIND[b.kind]?.label ?? b.kind} : ${(BACKUP_STATUS[b.status] ?? BACKUP_STATUS.never).label.toLowerCase()}`)
        .join(" · ");
    case "register_verified":
      return `${n(v)} ligne${n(v) > 1 ? "s" : ""} vérifiée${n(v) > 1 ? "s" : ""}`;
    case "notification_mode":
      return NOTIFICATION_MODE[String(v)] ?? String(v);
    case "retention_configured":
      return n(v) === 0 ? "Toutes décidées" : `${n(v)} sans durée décidée (rien n'est supprimé)`;
    default:
      return String(n(v));
  }
}

const TONE: Record<Check["status"], { label: string; tone: "ok" | "warn" | "neutral" }> = {
  ok: { label: "OK", tone: "ok" },
  attention: { label: "À regarder", tone: "warn" },
  info: { label: "Info", tone: "neutral" },
};

function YearForm({ year, defaults }: { year: AcademicYear | null; defaults: Partial<AcademicYear> }) {
  const y = year ?? defaults;
  const locked = year?.status === "current";
  return (
    <ActionForm action={saveAcademicYear} hidden={{ year_id: year?.id }} submitLabel={year ? "Enregistrer" : "Préparer cette année"} resetOnDone={!year}>
      {locked && (
        <p className="type-small text-muted">
          Les dates de l&apos;année en cours ne changent plus (les mandats s&apos;y réfèrent)&nbsp;; les notes, la passation, les dates de
          recrutement et les rappels restent modifiables.
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Nom" hint="Ex : 2027–2028">
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="label" required defaultValue={y.label} readOnly={locked} />}
        </Field>
        <Field label="Début">
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="starts_on" required defaultValue={y.starts_on} readOnly={locked} />}
        </Field>
        <Field label="Fin">
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="ends_on" required defaultValue={y.ends_on} readOnly={locked} />}
        </Field>
        <Field label="Début des mandats suggéré" hint="À 0 h, heure de Paris.">
          {({ id, describedBy }) => (
            <Input id={id} aria-describedby={describedBy} type="date" name="mandate_starts_on" required readOnly={locked}
              defaultValue={y.mandate_starts_at ? toDateInput(new Date(y.mandate_starts_at)) : undefined} />
          )}
        </Field>
        <Field label="Fin des mandats suggérée" hint="À 23 h 59, heure de Paris.">
          {({ id, describedBy }) => (
            <Input id={id} aria-describedby={describedBy} type="date" name="mandate_ends_on" required readOnly={locked}
              defaultValue={y.mandate_ends_at ? toDateInput(new Date(y.mandate_ends_at)) : undefined} />
          )}
        </Field>
        <Field label="Passation à préparer à partir du" optional>
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="handover_starts_on" defaultValue={y.handover_starts_on ?? undefined} />}
        </Field>
        <Field label="Recrutements : ouverture habituelle" optional>
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="recruitment_opens_on" defaultValue={y.recruitment_opens_on ?? undefined} />}
        </Field>
        <Field label="Recrutements : clôture habituelle" optional>
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="recruitment_closes_on" defaultValue={y.recruitment_closes_on ?? undefined} />}
        </Field>
        <Field label="Rappels de fin de mandat (jours avant)" hint="De 1 à 6 valeurs, séparées par des virgules.">
          {({ id, describedBy }) => (
            <Input id={id} aria-describedby={describedBy} name="reminder_offsets" inputMode="numeric" defaultValue={(y.reminder_offsets ?? [60, 30, 14, 7]).join(", ")} />
          )}
        </Field>
      </div>
      <Field label="Notes" optional>
        {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="notes" maxLength={2000} className="min-h-20" defaultValue={y.notes ?? undefined} />}
      </Field>
    </ActionForm>
  );
}

/**
 * /manage/plateforme/continuite/annee — the academic year: its dates and
 * suggested mandates (defaults for forms, never a right), the preparation of
 * the next one (automatic checks and human confirmations), then the
 * rollover, which only changes the current year: no mandate, membership,
 * post, event or application moves.
 */
export default async function AcademicYearPage() {
  const [access, ctx] = await Promise.all([getMyAccess(), getAuthContext()]);
  if (!hasPlatform(access, "platform.organizations.manage")) return <PlatformDenied title="Année universitaire" right="Gérer les assos" />;
  const aal2 = ctx.status === "authenticated" && ctx.aal === "aal2";
  const [years, preparation] = await Promise.all([getAcademicYears(), getYearPreparation(null)]);
  if (!years || !preparation) return <Notice tone="danger" icon="alert" title="Les années n'ont pas pu être chargées." />;

  const current = years.find((y) => y.status === "current") ?? null;
  const next = preparation.year;
  const end = current ? Number(current.label.split("–")[1]) : new Date().getFullYear();
  const startDay = current ? new Date(Date.parse(`${current.ends_on}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10) : undefined;
  const defaults: Partial<AcademicYear> = {
    label: `${end}–${end + 1}`,
    starts_on: startDay,
    ends_on: current ? `${end + 1}-${current.ends_on.slice(5)}` : undefined,
    mandate_starts_at: startDay ? `${startDay}T12:00:00Z` : undefined,
    mandate_ends_at: current ? `${end + 1}-${current.ends_on.slice(5)}T12:00:00Z` : undefined,
    reminder_offsets: current?.reminder_offsets ?? [60, 30, 14, 7],
  };
  const attention = (preparation.auto ?? []).filter((c) => c.status === "attention").length;

  return (
    <div className="flex flex-col gap-12">
      <ManagePageHeader
        kicker="Continuité"
        title="Année universitaire"
        description={
          <p>
            Les dates de l&apos;année et les mandats qu&apos;elle suggère par défaut. Une année ne donne aucun droit&nbsp;: chaque droit
            vient d&apos;un mandat, qui finit seul à sa date. Le passage à l&apos;année suivante ne supprime rien et ne change aucun mandat.
          </p>
        }
      />
      {!aal2 && <MfaNotice what="préparer une année ou passer à la suivante" />}

      <ManageSection title="Années">
        <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
          {years.map((y) => (
            <li key={y.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span>
                <span className="font-semibold">{y.label}</span>
                <span className="type-small text-muted">
                  {" "}
                  · du {formatDateLong(y.starts_on)} au {formatDateLong(y.ends_on)}
                  {y.rolled_over_at && ` · ouverte le ${formatDateLong(y.rolled_over_at)}${y.rolled_over_by_name ? ` par ${y.rolled_over_by_name}` : ""}`}
                </span>
              </span>
              <StatusBadge tone={STATUS[y.status].tone}>{STATUS[y.status].label}</StatusBadge>
            </li>
          ))}
        </ul>
        {current && (
          <Disclosure summary={`Modifier ${current.label}`} icon="edit">
            <YearForm year={current} defaults={{}} />
          </Disclosure>
        )}
      </ManageSection>

      <ManageSection title={next ? `Préparer ${next.label}` : "L'année suivante"}>
        {!next ? (
          <div className="flex max-w-3xl flex-col gap-4">
            <ManageEmpty icon="calendar" title="Aucune année suivante préparée">
              <p>Prépare-la quand la passation approche&nbsp;: les dates proposées suivent l&apos;année en cours, à vérifier.</p>
            </ManageEmpty>
            <YearForm year={null} defaults={defaults} />
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            <Disclosure summary={`Dates de ${next.label}`} icon="edit">
              <YearForm year={next} defaults={{}} />
            </Disclosure>

            <div className="flex flex-col gap-3">
              <h3 className="type-label text-muted">Vérifié par le site</h3>
              <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
                {(preparation.auto ?? []).map((c) => (
                  <li key={c.key} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <span className="flex flex-col gap-0.5">
                      <span className="font-semibold">{YEAR_AUTO_CHECK[c.key] ?? c.key}</span>
                      <span className="type-small text-muted">{describe(c)}</span>
                    </span>
                    <StatusBadge tone={TONE[c.status].tone}>{TONE[c.status].label}</StatusBadge>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col gap-3">
              <h3 className="type-label text-muted">Confirmé par le bureau du BDE</h3>
              <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
                {(preparation.manual ?? []).map((m) => (
                  <li key={m.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span className="flex flex-col gap-0.5">
                      <span className={m.done ? "font-semibold" : ""}>{YEAR_MANUAL_CHECK[m.key] ?? m.key}</span>
                      {m.done && m.confirmed_at && (
                        <span className="type-small text-muted">
                          Confirmé le {formatDateLong(m.confirmed_at)}
                          {m.confirmed_by_name ? ` par ${m.confirmed_by_name}` : ""}
                        </span>
                      )}
                    </span>
                    <ActionForm
                      action={confirmYearCheck}
                      hidden={{ year_id: next.id, check: m.key, done: m.done ? "0" : "1" }}
                      submitLabel={m.done ? "Retirer" : "Confirmer"}
                      variant={m.done ? "ghost" : "secondary"}
                      size="sm"
                      inline
                    />
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex max-w-2xl flex-col gap-3">
              <h3 className="type-label text-muted">Passer à {next.label}</h3>
              <p className="type-small text-muted">
                Possible à partir du {formatDateLong(new Date(Date.parse(`${next.starts_on}T12:00:00Z`) - 30 * 86_400_000).toISOString())}, une
                fois les neuf points confirmés. Ce passage change seulement l&apos;année en cours&nbsp;: les mandats finissent et
                commencent à leurs propres dates, les assos, contenus, inscriptions et candidatures restent tels quels.
              </p>
              {preparation.can_roll_over ? (
                <ActionForm action={confirmRollover} hidden={{ year_id: next.id }} submitLabel={`Passer à ${next.label}`}>
                  {attention > 0 && (
                    <Checkbox
                      name="acknowledge"
                      value="1"
                      label="J'ai pris connaissance des points à regarder"
                      description={`${attention} vérification${attention > 1 ? "s demandent" : " demande"} ton attention ci-dessus.`}
                    />
                  )}
                </ActionForm>
              ) : (
                <Notice title="Pas encore possible">
                  <p>Il faut que l&apos;année commence dans moins de 30 jours et que les neuf points soient confirmés.</p>
                </Notice>
              )}
            </div>
          </div>
        )}
      </ManageSection>
    </div>
  );
}
