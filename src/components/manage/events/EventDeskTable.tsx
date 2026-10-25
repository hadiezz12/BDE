import Link from "next/link";
import type { EventDashboard } from "@/lib/events/editor";
import {
  EVENT_STAGE_LABEL,
  EVENT_STAGE_TONE,
  REGISTRATION_STATE_LABEL,
  eventStage,
  type EventSummary,
} from "@/lib/events/model";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { formatDayShort, formatTime, plural } from "@/lib/format";
import { Icon } from "@/components/ui/Icon";
import { ButtonLink } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FillMeter } from "./FillMeter";

/**
 * The association's events on its desk. From md up a real <table> (date,
 * event, where it stands, registrations, actions); on phones the same rows
 * become stacked entries with labelled buttons, so nothing scrolls sideways
 * at 360 px. Counts only: who registered is behind "Participants", for the
 * positions that may see it.
 */
export function EventDeskTable({
  events,
  asso,
  can,
  caption,
  now = new Date(),
}: {
  events: EventSummary[];
  asso: string;
  can: EventDashboard["can"];
  caption: string;
  now?: Date;
}) {
  return (
    <div>
      <div className="relative hidden overflow-x-auto rounded-md border border-line bg-raised md:block">
        <table className="w-full border-collapse text-left type-small">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line bg-sunken/60">
              <Th>Date</Th>
              <Th>Événement</Th>
              <Th>Statut</Th>
              <Th>Inscriptions</Th>
              <th scope="col" className="px-4 py-2.5 text-right">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b border-line align-top transition-colors last:border-b-0 hover:bg-bg/70">
                <td className="whitespace-nowrap px-4 py-3">
                  <When event={e} />
                </td>
                <th scope="row" className="min-w-[14rem] px-4 py-3 font-normal text-fg">
                  <div className="flex flex-col gap-0.5">
                    <Link href={routes.manageEvent(asso, e.id)} className="font-bold hover:underline">
                      {e.title || "Sans titre"}
                    </Link>
                    <span className="type-meta text-subtle">
                      {[e.category, placeWords(e)].filter(Boolean).join(" · ")}
                    </span>
                    <span className="type-meta text-subtle">par {e.created_by_name}</span>
                  </div>
                </th>
                <td className="min-w-[10rem] px-4 py-3">
                  <Stage event={e} now={now} />
                </td>
                <td className="min-w-[10rem] px-4 py-3">
                  <Registrations event={e} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <RowActions event={e} asso={asso} can={can} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul aria-label={caption} className="divide-y divide-line rounded-md border border-line bg-raised md:hidden">
        {events.map((e) => (
          <li key={e.id} className="flex flex-col gap-3 px-4 py-4">
            <div className="flex flex-col gap-0.5">
              <When event={e} />
              <Link href={routes.manageEvent(asso, e.id)} className="font-bold hover:underline">
                {e.title || "Sans titre"}
              </Link>
              <span className="type-meta text-subtle">{[e.category, placeWords(e)].filter(Boolean).join(" · ")}</span>
            </div>
            <Stage event={e} now={now} />
            <Registrations event={e} />
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={routes.manageEvent(asso, e.id)} size="sm" variant="secondary" icon="edit" iconPosition="start">
                {can.edit || e.created_by_you ? "Modifier" : "Ouvrir"}
              </ButtonLink>
              {can.attendees_view && e.registration.mode === "internal" && e.publication !== "draft" && (
                <ButtonLink href={routes.manageEventParticipants(asso, e.id)} size="sm" variant="ghost" icon="users" iconPosition="start">
                  Participants
                </ButtonLink>
              )}
              <ButtonLink href={routes.eventPreview(e.id)} size="sm" variant="ghost" icon="eye" iconPosition="start">
                Aperçu
              </ButtonLink>
              {e.is_public && e.slug && (
                <ButtonLink href={routes.event(e.slug)} size="sm" variant="ghost" icon="arrow-up-right">
                  En ligne
                </ButtonLink>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Th({ children, className }: { children: string; className?: string }) {
  return (
    <th scope="col" className={cx("whitespace-nowrap px-4 py-2.5 type-label font-bold text-subtle", className)}>
      {children}
    </th>
  );
}

function placeWords(e: EventSummary): string | null {
  if (e.location.type === "online") return "En ligne";
  return e.location.venue ?? (e.location.type === "campus" ? "Campus" : e.location.city);
}

function When({ event }: { event: EventSummary }) {
  if (!event.starts_at) return <span className="type-meta text-subtle">Date à fixer</span>;
  return (
    <time dateTime={event.starts_at} className="flex flex-col type-meta">
      <span className="font-bold text-fg">{formatDayShort(event.starts_at)}</span>
      <span className="text-muted">{formatTime(event.starts_at)}</span>
    </time>
  );
}

function Stage({ event, now }: { event: EventSummary; now: Date }) {
  const stage = eventStage(event, now);
  return (
    <span className="flex flex-col items-start gap-1">
      <StatusBadge tone={EVENT_STAGE_TONE[stage]}>{EVENT_STAGE_LABEL[stage]}</StatusBadge>
      {event.pinned && stage === "live" && <span className="type-meta text-subtle">Épinglé sur la page</span>}
      {event.prominence === "featured" && stage === "live" && <span className="type-meta text-accent-text">À l&apos;affiche du site</span>}
      {(event.emails.failed > 0 || event.emails.pending > 0) && (
        <span className={cx("inline-flex items-center gap-1 type-meta", event.emails.failed > 0 ? "text-danger" : "text-subtle")}>
          <Icon name="mail" size={13} />
          {event.emails.failed > 0
            ? `${plural(event.emails.failed, "e-mail non remis", "e-mails non remis")}`
            : `${plural(event.emails.pending, "e-mail en attente", "e-mails en attente")}`}
        </span>
      )}
    </span>
  );
}

function Registrations({ event }: { event: EventSummary }) {
  const r = event.registration;
  if (r.mode !== "internal") {
    return <span className="type-small text-muted">{r.mode === "external" ? "Chez l'organisateur" : "Sans inscription"}</span>;
  }
  return (
    <span className="flex flex-col gap-1.5">
      <FillMeter registration={{ capacity: r.capacity ?? undefined, taken: r.confirmed, mode: r.mode }} />
      {r.capacity === null && <span className="type-meta text-muted">{plural(r.confirmed, "inscrit·e", "inscrit·es")}</span>}
      {r.waitlist > 0 && <span className="type-meta text-info">{plural(r.waitlist, "en attente", "en attente")}</span>}
      {event.publication === "published" && event.status === "scheduled" && (
        <span className="type-meta text-subtle">{REGISTRATION_STATE_LABEL[r.state]}</span>
      )}
    </span>
  );
}

const actionLink =
  "inline-flex min-h-9 items-center gap-1.5 rounded-sm px-2 type-small font-semibold text-muted transition-colors hover:bg-fg/5 hover:text-fg";

function RowActions({ event, asso, can }: { event: EventSummary; asso: string; can: EventDashboard["can"] }) {
  const title = event.title || "Sans titre";
  const open = can.edit || event.created_by_you ? "Modifier" : "Ouvrir";
  return (
    <span className="inline-flex items-center gap-0.5">
      <Link href={routes.manageEvent(asso, event.id)} className={actionLink} aria-label={`${open} « ${title} »`}>
        <Icon name="edit" size={16} />
        {open}
      </Link>
      {can.attendees_view && event.registration.mode === "internal" && event.publication !== "draft" && (
        <Link
          href={routes.manageEventParticipants(asso, event.id)}
          className={actionLink}
          aria-label={`Participants de « ${title} »`}
          title="Participants"
        >
          <Icon name="users" size={16} />
        </Link>
      )}
      <Link href={routes.eventPreview(event.id)} className={actionLink} aria-label={`Aperçu de « ${title} »`} title="Aperçu">
        <Icon name="eye" size={16} />
      </Link>
      {event.is_public && event.slug && (
        <Link href={routes.event(event.slug)} className={actionLink} aria-label={`Voir « ${title} » en ligne`} title="Voir en ligne">
          <Icon name="arrow-up-right" size={16} />
        </Link>
      )}
    </span>
  );
}
