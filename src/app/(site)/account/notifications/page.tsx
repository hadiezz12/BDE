import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { getSession } from "@/lib/session";
import { getMyEventNotifications } from "@/lib/events/me";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { NotificationItem } from "@/components/account/NotificationItem";
import { NotificationsBoard } from "@/components/account/NotificationsBoard";
import { groupByCalendarDay } from "@/components/account/account-facts";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Les nouvelles de tes inscriptions aux événements, jour par jour.",
  robots: { index: false },
};

/**
 * Notifications, newest first, grouped by day: the student's event
 * messages (notification_outbox, their own rows only) — confirmation,
 * waiting list, a freed seat, a change of date or place, a cancellation, the
 * reminder. Unread ones stand out (pink edge, bold title, "non lue" for
 * screen readers). "Tout marquer comme lu" is saved (NotificationsBoard).
 */
export default async function AccountNotificationsPage() {
  const { user } = await getSession();
  if (!user) return null;

  const now = new Date();
  const notifications = await getMyEventNotifications(100);
  const unread = notifications.filter((n) => !n.read).length;
  const groups = groupByCalendarDay(notifications, now);

  return (
    <>
      <PageHeader
        variant="document"
        kicker="Mon espace"
        title="Notifications"
        intro="Les nouvelles de tes inscriptions : confirmation, liste d'attente, place libérée, changement de date ou de lieu, annulation et rappel la veille."
      />

      <div className="wrap">
        <div className="max-w-3xl">
          {notifications.length === 0 ? (
            <EmptyState
              title="Rien pour l'instant."
              actions={
                <ButtonLink href={routes.events} variant="secondary" icon="arrow-right">
                  Voir l&apos;agenda
                </ButtonLink>
              }
            >
              Quand tu t&apos;inscris à un événement, sa confirmation, ses changements et son rappel arrivent ici.
            </EmptyState>
          ) : (
            <NotificationsBoard unread={unread}>
              {groups.map((group) => (
                <section key={group.key} aria-labelledby={`jour-${group.key}`} className="mt-10 first:mt-8">
                  <h2 id={`jour-${group.key}`} className="type-label text-muted">
                    <time dateTime={group.key}>{group.label}</time>
                  </h2>
                  <ul className="mt-3 border-b border-line">
                    {group.items.map((n) => (
                      <li key={n.id}>
                        <NotificationItem notification={n} now={now} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </NotificationsBoard>
          )}
        </div>
      </div>
    </>
  );
}
