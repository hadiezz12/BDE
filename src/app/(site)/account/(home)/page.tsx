import type { Metadata } from "next";
import Link from "next/link";
import type { EventItem } from "@/lib/types";
import { routes } from "@/lib/routes";
import { formatDateLong, formatDayFull, formatTime, plural, relativeDay } from "@/lib/format";
import { getSession } from "@/lib/session";
import { getAssociationsByIds, getBde, toRef } from "@/lib/data/associations";
import { getEventsByIds } from "@/lib/data/events";
import { getApplications, getNotifications } from "@/lib/data/users";
import { getMyMfaStatus } from "@/lib/auth/mfa";
import { AssociationRow } from "@/components/associations/AssociationRow";
import { MemberCard } from "@/components/brand/MemberCard";
import { eventPhase, isTonight } from "@/components/events/event-facts";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ApplicationRow } from "@/components/account/ApplicationRow";
import { NotificationItem } from "@/components/account/NotificationItem";
import { RegisteredTicket } from "@/components/account/RegisteredTicket";
import {
  academicSeason,
  formatMonthYear,
  greeting,
  isOngoing,
  needsAttention,
  shortEventName,
  splitMyEvents,
} from "@/components/account/account-facts";
import { accountName, greetingName, studyLine } from "@/components/account/identity";

export const metadata: Metadata = {
  title: "Mon espace",
  description: "Ta carte cotisante, ton prochain billet, tes candidatures et ce que tu n'as pas encore lu.",
};

/** The one sentence under the hello: what's next, said like a friend would. */
function nextOutLine(next: EventItem | undefined, now: Date): string {
  if (!next) return "Rien de prévu pour l'instant : quand le bureau annonce une date et que tu t'inscris, elle s'affiche ici.";
  const name = shortEventName(next.title);
  if (isTonight(next, now)) return `Ce soir, c'est ${name}. Le reste peut attendre demain.`;
  if (eventPhase(next, now) === "live") return `${name} est en cours. Le reste peut attendre.`;
  return `Prochaine sortie : ${name}, ${relativeDay(next.startsAt, now).toLowerCase()} à ${formatTime(next.startsAt)}.`;
}

/**
 * "Mon espace": hello, the carte cotisante (pointer tilt), the next ticket,
 * then what deserves a look today — applications that moved, unread
 * notifications — and the associations the student belongs to.
 */
export default async function AccountHomePage() {
  const { user } = await getSession();
  if (!user) return null;

  const now = new Date();
  const [events, applications, notifications, associations, mfa] = await Promise.all([
    getEventsByIds([...user.registeredEventIds, ...user.savedEventIds]),
    getApplications(user.id),
    getNotifications(user.id),
    getAssociationsByIds([...new Set([...user.memberships.map((m) => m.associationId), ...user.managedAssociationIds])]),
    getMyMfaStatus(),
  ]);

  const { tickets, saved } = splitMyEvents(user, events, now);
  const next = tickets[0];
  const attention = applications.filter((a) => needsAttention(a, now));
  const ongoing = applications.filter(isOngoing);
  const unread = notifications.filter((n) => !n.read);
  const byId = new Map(associations.map((a) => [a.id, a]));
  // Officers: the way to their bureau's workspace, next to the memberships.
  const managed = associations.filter((a) => user.managedAssociationIds.includes(a.id));
  const card = user.memberCard;
  // Without a card, point to the BDE page, where the card is presented (#carte).
  const bde = card ? null : await getBde();
  // Demo accounts are greeted without a name: they are not a person.
  const name = greetingName(user);

  return (
    <div className="wrap pt-8 sm:pt-12">
      <div className="grid gap-x-8 gap-y-12 lg:grid-cols-12">
        {/* Hello */}
        <header className="flex flex-col gap-5 lg:col-span-7 lg:row-start-1">
          <p className="type-label text-accent-text">
            {[formatDayFull(now.toISOString()), user.demoLabel ?? studyLine(user)].filter(Boolean).join(" · ")}
          </p>
          <h1 className="type-title">
            {greeting(now)}
            {name ? ` ${name}` : ""}.
          </h1>
          <p className="max-w-2xl type-lead text-muted">{nextOutLine(next, now)}</p>
          {/* Counts only once there is something to count: a fresh space doesn't need a row of zeros. */}
          {tickets.length + ongoing.length + unread.length > 0 && (
            <p className="flex flex-wrap gap-x-5 gap-y-1 type-meta text-muted">
              <span>{plural(tickets.length, "billet à venir", "billets à venir")}</span>
              <span>{plural(ongoing.length, "candidature en cours", "candidatures en cours")}</span>
              <span>{plural(unread.length, "non lue", "non lues")}</span>
            </p>
          )}
        </header>

        {/* Next ticket */}
        <section aria-labelledby="billet-titre" className="flex flex-col gap-6 lg:col-span-7 lg:row-start-2">
          <SectionHeader
            id="billet-titre"
            title="Ton prochain billet"
            action={tickets.length + saved.length > 0 ? { href: routes.accountEvents, label: "Mes événements" } : undefined}
          />
          {next ? (
            <>
              <RegisteredTicket event={next} holder={user} practicalLimit={3} now={now} />
              {tickets.length > 1 && (
                <p className="type-small text-muted">
                  Et {plural(tickets.length - 1, "autre inscription", "autres inscriptions")} à venir,{" "}
                  <Link href={routes.accountEvents} className="link font-bold text-fg">
                    dans Mes événements
                  </Link>
                  .
                </p>
              )}
            </>
          ) : (
            <EmptyState
              tone="quiet"
              title="Pas de billet en vue."
              actions={
                <>
                  <ButtonLink href={routes.events} icon="arrow-right">
                    Voir l&apos;agenda
                  </ButtonLink>
                  {saved.length > 0 && (
                    <ButtonLink href={routes.accountEvents} variant="secondary">
                      Mes enregistrés ({saved.length})
                    </ButtonLink>
                  )}
                </>
              }
            >
              Quand tu t&apos;inscris à un événement, ton billet arrive ici avec ce qu&apos;il faut savoir avant
              d&apos;y aller.
            </EmptyState>
          )}
        </section>

        {/* The card */}
        <section aria-labelledby="carte-titre" className="lg:col-span-5 lg:col-start-8 lg:row-span-2 lg:row-start-1">
          <h2 id="carte-titre" className="type-label text-muted">
            {card ? "Ta carte cotisante" : "Carte cotisante"}
          </h2>
          <div className="mx-auto mt-4 max-w-[28rem] lg:mx-0">
            {card ? (
              <MemberCard
                season={card.season}
                holder={accountName(user)}
                number={card.number}
                validUntilLabel={`Valable jusqu'au ${formatDateLong(card.validUntil)}`}
              />
            ) : (
              <MemberCard season={academicSeason(now)} />
            )}
          </div>
          <p className="mt-5 max-w-[28rem] type-small text-muted">
            {card ? (
              <>C&apos;est elle qui te donne le tarif cotisant sur les événements du BDE, toute l&apos;année.</>
            ) : (
              <>
                Pas encore cotisant·e : la carte à 30&nbsp;€ ouvre de -20&nbsp;% à -40&nbsp;% sur tous les événements
                du BDE, toute l&apos;année.{" "}
                {bde && (
                  <Link href={`${routes.association(bde.slug)}#carte`} className="link font-bold text-fg">
                    Comment l&apos;avoir
                  </Link>
                )}
              </>
            )}
          </p>
        </section>
      </div>

      <div className="mt-[var(--section)] grid gap-x-8 gap-y-14 lg:grid-cols-12">
        {/* Applications that deserve a look */}
        <section aria-labelledby="candidatures-titre" className="lg:col-span-7">
          <SectionHeader
            id="candidatures-titre"
            kicker={plural(attention.length, "à regarder", "à regarder")}
            title="Tes candidatures"
            action={
              applications.length > 0
                ? { href: routes.accountApplications, label: `Toutes (${applications.length})` }
                : undefined
            }
          />
          {attention.length > 0 ? (
            <div className="mt-6 border-b border-line-strong">
              {attention.map((a) => (
                <ApplicationRow key={a.id} application={a} now={now} />
              ))}
            </div>
          ) : (
            <EmptyState
              tone="quiet"
              className="mt-6"
              title={applications.length ? "Rien qui bouge aujourd'hui." : "Aucune candidature pour l'instant."}
              actions={
                <ButtonLink href={applications.length ? routes.accountApplications : routes.recruitment} variant="secondary" icon="arrow-right">
                  {applications.length ? "Mes candidatures" : "Voir les recrutements"}
                </ButtonLink>
              }
            >
              {applications.length
                ? "Pas d'entretien à venir ni de réponse cette semaine : les bureaux lisent, ça viendra."
                : "Quand une asso ouvre un recrutement et que tu candidates, tu suis ta candidature ici, étape par étape."}
            </EmptyState>
          )}
        </section>

        {/* Unread */}
        <section aria-labelledby="non-lu-titre" className="lg:col-span-5">
          <SectionHeader
            id="non-lu-titre"
            kicker={plural(unread.length, "notification", "notifications")}
            title="Pas encore lu"
            action={{ href: routes.accountNotifications, label: "Tout voir" }}
          />
          {unread.length > 0 ? (
            <div className="mt-6 border-b border-line">
              {unread.slice(0, 3).map((n) => (
                <NotificationItem key={n.id} notification={n} when="relative" now={now} />
              ))}
              {unread.length > 3 && (
                <p className="border-t border-line py-3 pl-4 type-small sm:pl-5">
                  <Link href={routes.accountNotifications} className="link font-bold">
                    {plural(unread.length - 3, "autre non lue", "autres non lues")}
                  </Link>
                </p>
              )}
            </div>
          ) : (
            <EmptyState tone="quiet" className="mt-6" title="Tu es à jour.">
              Les nouvelles de tes soirées, de tes candidatures et de tes assos arriveront ici.
            </EmptyState>
          )}
        </section>
      </div>

      {/* The account itself: profile and security */}
      <section aria-labelledby="compte-titre" className="mt-[var(--section)]">
        <SectionHeader id="compte-titre" title="Ton compte" />
        <ul className="mt-6 grid gap-x-8 border-b border-line md:grid-cols-2">
          <li className="border-t border-line">
            <Link href={routes.accountProfile} className="group flex min-h-16 items-center gap-4 py-4">
              <Icon name="user" size={22} className="shrink-0 text-accent-text" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold group-hover:text-accent-text">Profil</span>
                <span className="block type-small text-muted">Ton nom, ta photo, tes études</span>
              </span>
              <Icon name="arrow-right" size={18} className="text-muted" />
            </Link>
          </li>
          <li className="border-t border-line">
            <Link href={routes.accountSecurity} className="group flex min-h-16 items-center gap-4 py-4">
              <Icon name="lock" size={22} className="shrink-0 text-accent-text" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold group-hover:text-accent-text">Sécurité</span>
                <span className="block type-small text-muted">
                  Double authentification : {mfa.enabled ? "activée" : "désactivée"}
                </span>
              </span>
              <Icon name="arrow-right" size={18} className="text-muted" />
            </Link>
          </li>
        </ul>
      </section>

      {/* Memberships */}
      <section aria-labelledby="assos-titre" className="mt-[var(--section)]">
        <SectionHeader
          id="assos-titre"
          kicker={user.memberships.length > 0 ? plural(user.memberships.length, "asso", "assos") : undefined}
          title="Tes assos"
          action={{ href: routes.associations, label: "Toutes les assos" }}
        />
        {user.memberships.length > 0 ? (
          <ul className="mt-6 grid gap-x-8 border-b border-line md:grid-cols-2">
            {user.memberships.map((m) => {
              const a = byId.get(m.associationId);
              if (!a) return null;
              return (
                <li key={m.associationId}>
                  <AssociationRow
                    association={toRef(a)}
                    detail={`${m.role} · depuis ${formatMonthYear(m.since)}`}
                    aside={
                      user.managedAssociationIds.includes(a.id) ? <StatusBadge tone="accent">Bureau</StatusBadge> : undefined
                    }
                  />
                </li>
              );
            })}
          </ul>
        ) : null}
        {managed.length > 0 && (
          <p className="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-2 type-small text-muted">
            <span>Côté bureau :</span>
            {managed.map((a) => (
              <Link
                key={a.id}
                href={routes.manageHome(a.slug)}
                className="link inline-flex items-center gap-1.5 font-bold text-fg"
              >
                Gérer {a.shortName ?? a.name}
                <Icon name="arrow-right" size={16} className="self-center" />
              </Link>
            ))}
          </p>
        )}
        {user.memberships.length === 0 && managed.length === 0 && (
          <EmptyState
            tone="quiet"
            className="mt-6"
            title="Tu n'es membre d'aucune asso pour l'instant."
            actions={
              <ButtonLink href={routes.associations} variant="secondary" icon="arrow-right">
                Voir les associations
              </ButtonLink>
            }
          >
            Quand tu rejoins une asso, elle s&apos;affiche ici. Les pages des assos arrivent : chaque présidente ou
            président créera la sienne.
          </EmptyState>
        )}
      </section>
    </div>
  );
}
