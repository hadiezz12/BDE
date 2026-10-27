import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES, CATEGORY_LABEL, type NotificationCategory } from "@notify/catalog.ts";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/format";
import { getSession } from "@/lib/session";
import { getMyNotificationPage, getMyNotificationSummary, type NotificationListView } from "@/lib/notifications/data";
import { PageHeader } from "@/components/layout/PageHeader";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { NotificationItem } from "@/components/account/NotificationItem";
import { NotificationsBoard } from "@/components/account/NotificationsBoard";
import { groupByCalendarDay } from "@/components/account/account-facts";

export const metadata: Metadata = {
  title: "Notifications",
  description: "Tes inscriptions, tes candidatures, la vie de tes équipes et les messages des assos, au même endroit.",
  robots: { index: false },
};

/** French words in the address, the database's keys behind them. */
const VIEWS: Record<string, NotificationListView> = { "non-lues": "unread", archivees: "archived" };
const CATEGORY_SLUG: Record<NotificationCategory, string> = {
  recruitment: "recrutement",
  events: "evenements",
  governance: "equipes",
  content: "articles",
  campus: "campus",
  account: "compte",
};
const SLUG_CATEGORY = Object.fromEntries(Object.entries(CATEGORY_SLUG).map(([k, v]) => [v, k])) as Record<string, NotificationCategory>;

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/**
 * The notification centre: newest first, grouped by day, with the person's
 * own filters (unread, archived, a category) in the address so a view can be
 * bookmarked, and a page of 30 at a time ("Plus anciennes" continues after
 * the last one shown, never repeating or skipping a line). Each line opens
 * through /account/notifications/<id> (marked read, then the page it is
 * about, which checks access again) and can be marked read or archived.
 */
export default async function AccountNotificationsPage({ searchParams }: { searchParams: Search }) {
  const { user } = await getSession();
  if (!user) return null;
  const params = await searchParams;

  const viewSlug = one(params.vue);
  const view = VIEWS[viewSlug] ?? "all";
  const category = SLUG_CATEGORY[one(params.categorie)] ?? null;
  const before = one(params.avant);
  const beforeId = Number(one(params.id));
  const cursor = !Number.isNaN(Date.parse(before)) && Number.isSafeInteger(beforeId) && beforeId > 0 ? { before, beforeId } : null;

  const [page, summary] = await Promise.all([
    getMyNotificationPage({ view, category, before: cursor?.before, beforeId: cursor?.beforeId }),
    getMyNotificationSummary(),
  ]);
  const now = new Date();
  const items = page?.items ?? [];
  const groups = groupByCalendarDay(items, now);
  const unread = summary?.unread ?? 0;

  const href = (next: { vue?: string; categorie?: NotificationCategory | null; avant?: string; id?: number }) => {
    const q = new URLSearchParams();
    const v = next.vue !== undefined ? next.vue : viewSlug in VIEWS ? viewSlug : "";
    const c = next.categorie !== undefined ? next.categorie : category;
    if (v) q.set("vue", v);
    if (c) q.set("categorie", CATEGORY_SLUG[c]);
    if (next.avant && next.id) {
      q.set("avant", next.avant);
      q.set("id", String(next.id));
    }
    const s = q.toString();
    return s ? `${routes.accountNotifications}?${s}` : routes.accountNotifications;
  };

  const tabs: Array<{ slug: string; label: string }> = [
    { slug: "", label: "Toutes" },
    { slug: "non-lues", label: unread > 0 ? `Non lues (${unread >= 100 ? "99+" : unread})` : "Non lues" },
    { slug: "archivees", label: "Archivées" },
  ];
  const activeSlug = viewSlug in VIEWS ? viewSlug : "";

  return (
    <>
      <PageHeader
        variant="document"
        kicker="Mon espace"
        title="Notifications"
        intro="Tes inscriptions, tes candidatures, la vie de tes équipes et les messages des assos que tu suis, au même endroit."
        meta={
          <>
            <span>{unread > 0 ? plural(unread >= 100 ? 100 : unread, "non lue", "non lues").replace(/^100 /, "99+ ") : "Tout est lu"}</span>
            <Link href={routes.accountNotificationSettings} className="link inline-flex items-center gap-1.5 font-bold">
              <Icon name="sliders" size={16} />
              Ce que tu reçois, et où
            </Link>
          </>
        }
      />

      <div className="wrap">
        <div className="max-w-3xl">
          {one(params.introuvable) === "1" && (
            <p role="status" className="mb-6 flex items-start gap-2 rounded-sm border-2 border-line-strong bg-raised p-3 type-small">
              <Icon name="info" size={18} className="mt-px shrink-0" />
              Cette notification n&apos;existe plus : elle a été supprimée après plusieurs mois, ou elle ne t&apos;était pas adressée.
            </p>
          )}

          <nav aria-label="Filtrer les notifications" className="flex flex-col gap-3">
            <ul className="flex flex-wrap gap-x-1 border-b border-line-strong">
              {tabs.map((t) => (
                <li key={t.slug}>
                  <Link
                    href={href({ vue: t.slug, avant: undefined })}
                    aria-current={activeSlug === t.slug ? "page" : undefined}
                    className={cx(
                      "-mb-px inline-flex min-h-11 items-center border-b-[3px] px-3 type-nav",
                      activeSlug === t.slug ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
                    )}
                  >
                    {t.label}
                  </Link>
                </li>
              ))}
            </ul>
            <ul className="flex flex-wrap gap-2" aria-label="Catégorie">
              {[null, ...CATEGORIES].map((c) => (
                <li key={c ?? "toutes"}>
                  <Link
                    href={href({ categorie: c })}
                    aria-current={category === c ? "true" : undefined}
                    className={cx(
                      "inline-flex min-h-9 items-center rounded-full border px-3 text-[0.85rem] font-bold",
                      category === c ? "border-fg bg-fg text-bg" : "border-line-strong text-muted hover:border-fg hover:text-fg",
                    )}
                  >
                    {c ? CATEGORY_LABEL[c] : "Toutes catégories"}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-8">
            {page === null ? (
              <EmptyState title="Les notifications ne se chargent pas pour l'instant.">
                Réessaie dans un instant. Rien n&apos;est perdu : elles sont gardées même quand la page ne s&apos;affiche pas.
              </EmptyState>
            ) : items.length === 0 ? (
              <EmptyState
                title={
                  view === "unread" ? "Tout est lu." : view === "archived" ? "Rien d'archivé." : category ? "Rien dans cette catégorie." : "Rien pour l'instant."
                }
                actions={
                  view === "all" && !category && !cursor ? (
                    <ButtonLink href={routes.events} variant="secondary" icon="arrow-right">
                      Voir l&apos;agenda
                    </ButtonLink>
                  ) : (
                    <ButtonLink href={routes.accountNotifications} variant="secondary" icon="arrow-right">
                      Toutes les notifications
                    </ButtonLink>
                  )
                }
              >
                {view === "archived"
                  ? "Ce que tu archives quitte la liste principale et reste ici 30 jours."
                  : "Quand tu t'inscris à un événement, envoies une candidature, rejoins une équipe ou suis une asso, ses nouvelles arrivent ici."}
              </EmptyState>
            ) : (
              <NotificationsBoard unread={view === "archived" ? 0 : unread}>
                {groups.map((group) => (
                  <section key={group.key} aria-labelledby={`jour-${group.key}`} className="mt-10 first:mt-8">
                    <h2 id={`jour-${group.key}`} className="type-label text-muted">
                      <time dateTime={group.key}>{group.label}</time>
                    </h2>
                    <ul className="mt-3 border-b border-line">
                      {group.items.map((n) => (
                        <li key={n.id}>
                          <NotificationItem notification={n} now={now} actions />
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </NotificationsBoard>
            )}

            {(page?.next || cursor) && (
              <nav aria-label="Pages" className="mt-8 flex flex-wrap items-center justify-between gap-3">
                {cursor ? (
                  <Link href={href({})} className="link inline-flex items-center gap-1.5 font-bold">
                    <Icon name="arrow-left" size={16} />
                    Les plus récentes
                  </Link>
                ) : (
                  <span />
                )}
                {page?.next && (
                  <Link href={href({ avant: page.next.before, id: page.next.beforeId })} className="link inline-flex items-center gap-1.5 font-bold">
                    Plus anciennes
                    <Icon name="arrow-right" size={16} />
                  </Link>
                )}
              </nav>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
