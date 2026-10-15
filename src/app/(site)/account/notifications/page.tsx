import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { getSession } from "@/lib/session";
import { getNotifications } from "@/lib/data/users";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { NotificationItem } from "@/components/account/NotificationItem";
import { NotificationsBoard } from "@/components/account/NotificationsBoard";
import { groupByCalendarDay } from "@/components/account/account-facts";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Les nouvelles de tes soirées, de tes candidatures, de tes assos et du BDE, jour par jour.",
};

/**
 * Notifications, newest first, grouped by day. Unread ones stand out (pink
 * edge, bold title, "non lue" for screen readers); each kind is named.
 * "Tout marquer comme lu" is client-only demo state (NotificationsBoard).
 */
export default async function AccountNotificationsPage() {
  const { user } = await getSession();
  if (!user) return null;

  const now = new Date();
  const notifications = await getNotifications(user.id);
  const unread = notifications.filter((n) => !n.read).length;
  const groups = groupByCalendarDay(notifications, now);

  return (
    <>
      <PageHeader
        variant="document"
        kicker="Mon espace"
        title="Notifications"
        intro="Tes soirées, tes candidatures, tes assos et les annonces du BDE. Ce que tu reçois se règle dans ton profil."
      />

      <div className="wrap">
        <div className="max-w-3xl">
          {notifications.length === 0 ? (
            <EmptyState
              title="Rien pour l'instant."
              actions={
                <ButtonLink href={routes.accountProfile} variant="secondary" icon="arrow-right">
                  Régler mes notifications
                </ButtonLink>
              }
            >
              Les rappels de tes soirées, les nouvelles de tes candidatures et les annonces du BDE arriveront ici.
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
