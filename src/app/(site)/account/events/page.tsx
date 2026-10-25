import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { formatDayFull, formatTime, plural } from "@/lib/format";
import { getSession } from "@/lib/session";
import { getMyEvents } from "@/lib/events/me";
import { myRegistrationWords } from "@/lib/events/model";
import { EventRow } from "@/components/events/EventRow";
import { CancelRegistration, EventActionNotice, EventActionsProvider } from "@/components/events/EventActions";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { RegisteredTicket } from "@/components/account/RegisteredTicket";
import { splitMyEvents } from "@/components/account/account-facts";

export const metadata: Metadata = {
  title: "Mes événements",
  description: "Tes inscriptions et tes places en liste d'attente, ce que tu as enregistré, et les événements où tu étais.",
  robots: { index: false },
};

/**
 * Mes événements (my_events: the student's own rows only): their tickets
 * first — seats and waiting places, each with its reference, the private
 * joining details of a confirmed seat and the way to cancel while it is
 * still possible — then what the organizers cancelled, the registrations
 * that were cancelled, the saved events, and what's over ("Tu y étais").
 */
export default async function AccountEventsPage() {
  const { user } = await getSession();
  if (!user) return null;

  const now = new Date();
  const my = await getMyEvents();
  const { tickets, cancelled, withdrawn, past, unavailable, saved } = splitMyEvents(my, now);
  const waiting = tickets.filter((t) => t.registration.status === "waitlisted").length;

  return (
    <>
      <PageHeader
        variant="document"
        kicker="Mon espace"
        title="Mes événements"
        intro="Tes inscriptions avec leur référence et ce qu'il faut savoir avant d'y aller, ce que tu as gardé sous le coude, et les événements où tu étais."
        meta={
          <>
            <span>{plural(tickets.length - waiting, "inscription à venir", "inscriptions à venir")}</span>
            {waiting > 0 && <span>{plural(waiting, "liste d'attente", "listes d'attente")}</span>}
            <span>{plural(saved.length, "enregistré", "enregistrés")}</span>
            <span>{plural(past.length, "passé", "passés")}</span>
          </>
        }
      />

      <div className="wrap grid gap-x-8 gap-y-16 lg:grid-cols-12">
        <section aria-labelledby="billets-titre" className="flex flex-col gap-8 lg:col-span-8 lg:row-start-1">
          <SectionHeader id="billets-titre" kicker="Inscrit·e ou en attente" title="Tes billets" />
          {tickets.length > 0 ? (
            <ul className="flex flex-col gap-10">
              {tickets.map(({ event, registration }) => (
                <li key={event.id} className="flex flex-col gap-3">
                  <RegisteredTicket
                    event={event}
                    holder={user}
                    registration={{
                      status: registration.status === "waitlisted" ? "waitlisted" : "confirmed",
                      position: registration.position,
                      reference: registration.reference,
                    }}
                    accessDetails={registration.access_details}
                    now={now}
                  />
                  {registration.can_cancel ? (
                    <EventActionsProvider eventId={event.id}>
                      <CancelRegistration waitlisted={registration.status === "waitlisted"} />
                      <EventActionNotice />
                    </EventActionsProvider>
                  ) : (
                    registration.status === "confirmed" &&
                    Date.parse(event.startsAt) > now.getTime() && (
                      <p className="type-small text-muted">
                        L&apos;annulation en ligne est fermée : préviens {event.association.shortName ?? event.association.name} si
                        tu ne peux pas venir.
                      </p>
                    )
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              tone="quiet"
              title="Aucune inscription à venir."
              actions={
                <ButtonLink href={routes.events} icon="arrow-right">
                  Voir l&apos;agenda
                </ButtonLink>
              }
            >
              Inscris-toi depuis la page d&apos;un événement : ton billet arrive ici, avec sa référence, l&apos;heure et le
              lieu.
            </EmptyState>
          )}

          {cancelled.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="type-label text-danger">Annulés par les organisateurs</h3>
              <ul className="flex flex-col border-y border-line">
                {cancelled.map(({ event }) => (
                  <li key={event.id} className="flex flex-col gap-1 border-b border-line py-4 last:border-b-0">
                    <Link href={routes.event(event.slug)} className="link font-bold">
                      {event.title}
                    </Link>
                    <span className="type-meta text-muted">
                      Prévu {formatDayFull(event.startsAt).toLowerCase()} à {formatTime(event.startsAt)} ·{" "}
                      {event.association.shortName ?? event.association.name}
                    </span>
                    {event.cancellationReason && <span className="type-small">{event.cancellationReason}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {withdrawn.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="type-label text-muted">Inscriptions annulées</h3>
              <ul className="flex flex-col border-y border-line">
                {withdrawn.map(({ event, registration }) => (
                  <li key={event.id} className="flex flex-col gap-1 border-b border-line py-4 last:border-b-0">
                    <Link href={routes.event(event.slug)} className="link font-bold">
                      {event.title}
                    </Link>
                    <span className="type-meta text-muted">
                      {myRegistrationWords(registration)} · {formatDayFull(event.startsAt).toLowerCase()}
                    </span>
                    {registration.cancel_source === "organizer" && registration.cancel_reason && (
                      <span className="type-small">Raison donnée&nbsp;: {registration.cancel_reason}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {unavailable.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="type-label text-muted">Plus en ligne</h3>
              <ul className="flex flex-col border-y border-line">
                {unavailable.map((u) => (
                  <li key={u.id} className="flex flex-col gap-1 border-b border-line py-4 last:border-b-0">
                    <span className="font-bold">{u.title}</span>
                    <span className="type-meta text-muted">
                      {formatDayFull(u.startsAt)} · {u.organization} · réf. {u.registration.reference}
                    </span>
                    <span className="type-small text-muted">
                      {u.cancelled
                        ? "Cet événement a été annulé et n'est plus affiché sur le site."
                        : "Cet événement n'est plus affiché sur le site : pour toute question, contacte l'association."}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* Full width: agenda rows need the room for their four columns. */}
        <section aria-labelledby="enregistres-titre" className="lg:col-span-12 lg:row-start-2">
          <SectionHeader
            id="enregistres-titre"
            kicker="Gardés sous le coude"
            title="Enregistrés"
            description={saved.length > 0 ? "Pas encore inscrit·e : les places partent parfois vite." : undefined}
          />
          {saved.length > 0 ? (
            <div className="mt-6 border-b border-line-strong">
              {saved.map((e) => (
                <EventRow key={e.id} event={e} personal={{ saved: true }} now={now} />
              ))}
            </div>
          ) : (
            <EmptyState
              className="mt-6"
              tone="quiet"
              title="Rien d'enregistré."
              actions={
                <ButtonLink href={routes.events} variant="secondary" icon="arrow-right">
                  Parcourir l&apos;agenda
                </ButtonLink>
              }
            >
              Sur un événement qui te tente, appuie sur « Enregistrer » : il t&apos;attendra ici.
            </EmptyState>
          )}
        </section>

        <section aria-labelledby="passes-titre" className="lg:col-span-4 lg:col-start-9 lg:row-start-1">
          <SectionHeader id="passes-titre" kicker="Souvenirs" title="Déjà passés" size="headline" />
          {past.length > 0 ? (
            <div className="mt-6 border-b border-line">
              {past.map(({ event, registration }) => (
                <EventRow
                  key={event.id}
                  event={event}
                  variant="compact"
                  personal={registration.status === "confirmed" ? { registered: true } : undefined}
                  now={now}
                />
              ))}
            </div>
          ) : (
            <EmptyState className="mt-6" tone="quiet" title="Pas encore de souvenirs.">
              Les événements où tu avais une place s&apos;afficheront ici une fois passés.
            </EmptyState>
          )}
          <p className="mt-6 flex items-start gap-2 type-small text-muted">
            <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
            Seule l&apos;équipe de l&apos;événement voit ton nom dans la liste des inscrit·es, jamais les autres
            étudiant·es.
          </p>
        </section>
      </div>
    </>
  );
}
