import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { formatDayShort, formatTime, plural } from "@/lib/format";
import { getManageContext } from "@/lib/data/manage";
import { getEventAttendees } from "@/lib/events/editor";
import { ordinal, type AttendeeRow } from "@/lib/events/model";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { removeEventRegistration } from "@/app/actions/events";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { canOpenSection } from "@/components/manage/sections";
import { SectionDenied } from "@/components/manage/governance/SectionDenied";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { readOnlyReason } from "@/components/manage/content/desk";
import { FillMeter } from "@/components/manage/events/FillMeter";

type Params = Promise<{ asso: string; event: string }>;
type Search = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata: Metadata = { title: "Participants", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAGE = 50;

const STATUS_PARAM = { inscrits: "confirmed", attente: "waitlisted", annules: "cancelled" } as const;
type StatusParam = keyof typeof STATUS_PARAM;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * /manage/[asso]/events/[event]/participants — who registered, for the
 * positions holding events.attendees.view in the event's own association
 * (public.event_attendees checks it; the BDE gets no list of an
 * association's participants). Names, statuses, waiting places, references
 * and dates only — no e-mail, no profile. By status (?statut=), search by
 * name or reference (?q=), 50 a page (?page=). Removing a registration asks
 * for a reason the student reads (events.attendees.manage); the CSV export
 * (events.attendees.export) is recorded in the audit.
 */
export default async function ParticipantsPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { asso, event: eventId } = await params;
  const sp = await searchParams;
  const ctx = await getManageContext(asso);
  if (!ctx) return null;
  if (!canOpenSection("events", ctx.membership.permissions)) return <SectionDenied section="events" ctx={ctx} />;

  const rawStatus = first(sp.statut);
  const statusKey: StatusParam | null = rawStatus && rawStatus in STATUS_PARAM ? (rawStatus as StatusParam) : null;
  const q = (first(sp.q) ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const page = Math.max(1, Math.min(1000, Number.parseInt(first(sp.page) ?? "1", 10) || 1));

  if (!UUID.test(eventId)) return <Unavailable asso={asso} message={governanceErrorMessage("event_not_found")} />;
  const result = await getEventAttendees(eventId.toLowerCase(), statusKey ? STATUS_PARAM[statusKey] : null, q || null, (page - 1) * PAGE, PAGE);
  if (!result.ok) return <Unavailable asso={asso} message={governanceErrorMessage(result.code)} />;
  const data = result.data;
  const event = data.event;
  if (!event.id) redirect(routes.manageEvents(asso));

  const writable = !readOnlyReason(ctx);
  const pages = Math.max(1, Math.ceil(data.total / PAGE));
  const href = (over: { statut?: StatusParam | null; q?: string; page?: number }) => {
    const p = new URLSearchParams();
    const s = over.statut === undefined ? statusKey : over.statut;
    const query = over.q === undefined ? q : over.q;
    if (s) p.set("statut", s);
    if (query) p.set("q", query);
    if (over.page && over.page > 1) p.set("page", String(over.page));
    const qs = p.toString();
    return qs ? `${routes.manageEventParticipants(asso, event.id)}?${qs}` : routes.manageEventParticipants(asso, event.id);
  };
  const tabs: { key: StatusParam | null; label: string; count: number }[] = [
    { key: null, label: "Tous", count: data.counts.confirmed + data.counts.waitlisted },
    { key: "inscrits", label: "Inscrit·es", count: data.counts.confirmed },
    { key: "attente", label: "Liste d'attente", count: data.counts.waitlisted },
    { key: "annules", label: "Annulés", count: data.counts.cancelled },
  ];

  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader
        kicker={
          <Link href={routes.manageEvent(asso, event.id)} className="inline-flex items-center gap-1.5 hover:underline">
            <Icon name="arrow-left" size={14} />
            {event.title}
          </Link>
        }
        title="Participants"
        meta={
          <>
            {event.starts_at && (
              <span>
                {formatDayShort(event.starts_at)} à {formatTime(event.starts_at)}
              </span>
            )}
            <span>{plural(data.counts.confirmed, "inscrit·e", "inscrit·es")}</span>
            {data.counts.waitlisted > 0 && <span>{data.counts.waitlisted} en attente</span>}
          </>
        }
        actions={
          data.can_export ? (
            <form method="post" action={routes.manageEventParticipantsExport(asso, event.id)}>
              <Button type="submit" variant="secondary" icon="file" iconPosition="start">
                Exporter (CSV)
              </Button>
            </form>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <FillMeter
          registration={{ capacity: event.registration.capacity ?? undefined, taken: event.registration.confirmed, mode: event.registration.mode }}
          className="max-w-xs"
        />
        <p className="flex max-w-xl items-start gap-2 type-small text-muted">
          <Icon name="lock" size={15} className="mt-0.5 shrink-0" />
          Ces noms servent à organiser l&apos;événement : ils restent dans l&apos;équipe. Pas d&apos;e-mail ici, et
          {data.can_export ? " un export est noté dans l'historique de l'asso." : " pas d'export avec ton poste."}
        </p>
      </div>

      <nav aria-label="Filtrer par statut" className="-mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] [scrollbar-width:none] lg:mx-0 lg:px-0">
        <ul className="flex min-w-max gap-1 border-b border-line">
          {tabs.map((t) => {
            const active = t.key === statusKey;
            return (
              <li key={t.label}>
                <Link
                  href={href({ statut: t.key, page: 1 })}
                  scroll={false}
                  aria-current={active ? "true" : undefined}
                  className={cx(
                    "relative flex min-h-11 items-center gap-2 whitespace-nowrap px-3 text-[0.9rem] font-semibold transition-colors",
                    active ? "text-fg" : "text-muted hover:text-fg",
                  )}
                >
                  {t.label}
                  <span className={cx("type-meta text-[0.75rem]", active ? "text-fg" : "text-subtle")}>{t.count}</span>
                  <span aria-hidden className={cx("absolute inset-x-3 -bottom-px h-[3px] rounded-t-full bg-assoc", active ? "opacity-100" : "opacity-0")} />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <Form action={routes.manageEventParticipants(asso, event.id)} role="search" className="flex max-w-xl items-end gap-3">
        {statusKey && <input type="hidden" name="statut" value={statusKey} />}
        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="type-label text-muted">Chercher un nom ou une référence</span>
          <span className="relative">
            <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle" />
            <Input key={q} name="q" type="search" defaultValue={q} maxLength={80} autoComplete="off" className="pl-10" />
          </span>
        </label>
        <Button type="submit" variant="secondary">
          Chercher
        </Button>
      </Form>

      {data.rows.length === 0 ? (
        <ManageEmpty icon="users" title={q ? "Personne ne correspond" : "Personne pour l'instant"}>
          <p>
            {q
              ? "La recherche porte sur le nom et la référence (8 caractères, donnée à l'inscription)."
              : "Les inscriptions apparaissent ici au fur et à mesure, dans l'ordre d'arrivée."}
          </p>
        </ManageEmpty>
      ) : (
        <ul aria-label={`Participants de ${event.title}`} className="divide-y divide-line rounded-md border border-line bg-raised">
          {data.rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-bold">{r.name}</span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 type-meta text-muted">
                  <AttendeeStatus row={r} />
                  <span>réf. {r.reference}</span>
                  <span>inscrit·e le {formatDayShort(r.created_at)} à {formatTime(r.created_at)}</span>
                  {r.promoted_at && <span>place libérée le {formatDayShort(r.promoted_at)}</span>}
                </span>
                {r.status === "cancelled" && r.cancel_source === "organizer" && r.cancel_reason && (
                  <span className="type-small text-muted">Raison donnée : {r.cancel_reason}</span>
                )}
              </div>
              {data.can_manage && writable && r.status !== "cancelled" && (
                <Disclosure summary="Retirer l'inscription" icon="close" tone="danger" className="sm:w-80">
                  <ActionForm action={removeEventRegistration} hidden={{ registration_id: r.id }} submitLabel="Retirer" variant="danger" size="sm">
                    <p className="type-small">
                      {r.name} est prévenu·e, avec ta raison.{" "}
                      {r.status === "confirmed" ? "Sa place revient à la liste d'attente, dans l'ordre." : "Sa place dans la file est libérée."}
                    </p>
                    <Field label="Raison, lue par la personne">
                      {({ id }) => <Textarea id={id} name="reason" rows={2} maxLength={500} required minLength={3} />}
                    </Field>
                  </ActionForm>
                </Disclosure>
              )}
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-4">
          {page > 1 ? (
            <ButtonLink href={href({ page: page - 1 })} variant="secondary" size="sm" icon="arrow-left" iconPosition="start">
              Précédents
            </ButtonLink>
          ) : (
            <span />
          )}
          <span className="type-meta text-muted">
            Page {page} sur {pages}
          </span>
          {page < pages ? (
            <ButtonLink href={href({ page: page + 1 })} variant="secondary" size="sm" icon="arrow-right">
              Suivants
            </ButtonLink>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}

function AttendeeStatus({ row }: { row: AttendeeRow }) {
  if (row.status === "confirmed") return <StatusBadge tone="ok">Inscrit·e</StatusBadge>;
  if (row.status === "waitlisted") {
    return <StatusBadge tone="info">Liste d&apos;attente{row.position ? ` · ${ordinal(row.position)}` : ""}</StatusBadge>;
  }
  return (
    <StatusBadge tone="neutral">{row.cancel_source === "organizer" ? "Retiré·e par l'asso" : "A annulé"}</StatusBadge>
  );
}

function Unavailable({ asso, message }: { asso: string; message: string }) {
  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader title="Participants" />
      <ManageEmpty
        as="h2"
        icon="lock"
        title="Cette liste ne s'ouvre pas ici"
        actions={
          <ButtonLink href={routes.manageEvents(asso)} variant="secondary" icon="arrow-left" iconPosition="start">
            Événements
          </ButtonLink>
        }
      >
        <p>{message}</p>
      </ManageEmpty>
    </div>
  );
}
