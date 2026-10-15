import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { getSession } from "@/lib/demo-session";
import { getEventsByIds } from "@/lib/data/events";
import { EventRow } from "@/components/events/EventRow";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RegisteredTicket } from "@/components/account/RegisteredTicket";
import { personalStateOf, splitMyEvents } from "@/components/account/account-facts";

export const metadata: Metadata = {
  title: "Mes événements",
  description: "Tes billets avec ce qu'il faut savoir avant d'y aller, les événements que tu as enregistrés et ceux où tu étais.",
};

/**
 * Mes événements: tickets first (with the practical lines: what to bring,
 * where to meet), then the saved ones as agenda rows, and the past ones in a
 * quiet side column ("Tu y étais").
 */
export default async function AccountEventsPage() {
  const { user } = await getSession();
  if (!user) return null;

  const now = new Date();
  const events = await getEventsByIds([...user.registeredEventIds, ...user.savedEventIds]);
  const { tickets, saved, past } = splitMyEvents(user, events, now);

  return (
    <>
      <PageHeader
        variant="document"
        kicker="Mon espace"
        title="Mes événements"
        intro="Tes billets avec ce qu'il faut savoir avant d'y aller, ce que tu as gardé sous le coude, et les soirées où tu étais."
        meta={
          <>
            <span>{plural(tickets.length, "billet à venir", "billets à venir")}</span>
            <span>{plural(saved.length, "enregistré", "enregistrés")}</span>
            <span>{plural(past.length, "passé", "passés")}</span>
          </>
        }
      />

      <div className="wrap grid gap-x-8 gap-y-16 lg:grid-cols-12">
        <section aria-labelledby="billets-titre" className="lg:col-span-8 lg:row-start-1">
          <SectionHeader id="billets-titre" kicker="Inscrit·e" title="Tes billets" />
          {tickets.length > 0 ? (
            <ul className="mt-8 flex flex-col gap-8">
              {tickets.map((e) => (
                <li key={e.id}>
                  <RegisteredTicket event={e} holder={user} now={now} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              className="mt-8"
              tone="quiet"
              title="Aucune inscription à venir."
              actions={
                <ButtonLink href={routes.events} icon="arrow-right">
                  Voir l&apos;agenda
                </ButtonLink>
              }
            >
              Les dates de chaque événement seront annoncées par le bureau. Une fois inscrit·e depuis sa page, ton
              billet arrive ici, avec l&apos;heure, le lieu et ce qu&apos;il faut prendre avec toi.
            </EmptyState>
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
                <EventRow key={e.id} event={e} personal={personalStateOf(user, e.id)} now={now} />
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
              Sur un événement qui te tente, appuie sur « Enregistrer » : il t&apos;attendra ici, et tu seras prévenu·e
              quand les places partent.
            </EmptyState>
          )}
        </section>

        <section aria-labelledby="passes-titre" className="lg:col-span-4 lg:col-start-9 lg:row-start-1">
          <SectionHeader id="passes-titre" kicker="Souvenirs" title="Déjà passés" size="headline" />
          {past.length > 0 ? (
            <div className="mt-6 border-b border-line">
              {past.map((e) => (
                <EventRow key={e.id} event={e} variant="compact" personal={personalStateOf(user, e.id)} now={now} />
              ))}
            </div>
          ) : (
            <EmptyState className="mt-6" tone="quiet" title="Pas encore de souvenirs.">
              Les événements où tu es allé·e s&apos;afficheront ici une fois passés.
            </EmptyState>
          )}
        </section>
      </div>
    </>
  );
}
