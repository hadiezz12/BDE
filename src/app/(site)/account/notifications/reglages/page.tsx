import type { Metadata } from "next";
import Link from "next/link";
import { CATEGORIES, CATEGORY_LABEL } from "@notify/catalog.ts";
import { routes } from "@/lib/routes";
import { formatDayShort } from "@/lib/format";
import { getSession } from "@/lib/session";
import { getMyNotificationPreferences } from "@/lib/notifications/data";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import {
  ClearSuppressionButton,
  QuietHoursForm,
  TopicPreference,
  UnfollowButton,
} from "@/components/notifications/NotificationSettingsForms";

export const metadata: Metadata = {
  title: "Réglages des notifications",
  robots: { index: false },
};

const SUPPRESSION_WORDS: Record<string, string> = {
  hard_bounce: "les derniers e-mails sont revenus en erreur (adresse introuvable)",
  invalid_address: "le service d'envoi a refusé l'adresse comme invalide",
  blocked: "ta messagerie a bloqué nos e-mails",
  complaint: "un de nos e-mails a été signalé comme indésirable",
  user_request: "tu as demandé l'arrêt des e-mails",
};

const CHANGE_WORDS: Record<string, string> = {
  in_app_on: "réactivé sur le site",
  in_app_off: "désactivé sur le site",
  email_on: "e-mails activés",
  email_off: "e-mails désactivés",
  follow: "suivie",
  unfollow: "plus suivie",
  quiet_hours_on: "Heures calmes activées",
  quiet_hours_off: "Heures calmes désactivées",
  suppression_cleared: "E-mails repris après un arrêt",
};

const SOURCE_WORDS: Record<string, string> = {
  settings: "depuis cette page",
  unsubscribe_link: "depuis le lien d'un e-mail",
  association_page: "depuis la page de l'asso",
};

/**
 * What a person receives, and where: each topic of the catalog with its two
 * channels (essential ones fixed, operational ones always in the centre),
 * quiet hours for e-mails that can wait, the associations they follow, an
 * address the provider stopped (and how to resume), and the last changes
 * (the record of their choices, kept by the database).
 */
export default async function NotificationSettingsPage() {
  const { user } = await getSession();
  if (!user) return null;
  const prefs = await getMyNotificationPreferences();
  const topicLabel = new Map(prefs?.topics.map((t) => [t.key, t.label]) ?? []);

  return (
    <>
      <PageHeader
        variant="document"
        kicker="Réglages"
        title="Ce que tu reçois"
        crumbs={[{ label: "Notifications", href: routes.accountNotifications }]}
        intro="Choisis ce qui arrive sur le site et par e-mail. Ce qui concerne une démarche en cours (une inscription, une candidature, une invitation) ou la sécurité de ton compte arrive toujours."
        meta={user.email ? <span className="break-all">E-mails envoyés à {user.email}</span> : undefined}
      />

      <div className="wrap grid gap-x-8 gap-y-16 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-16 lg:col-span-8">
          {prefs === null ? (
            <EmptyState title="Tes réglages ne se chargent pas pour l'instant.">Réessaie dans un instant.</EmptyState>
          ) : (
            <>
              {prefs.suppression && (
                <section aria-labelledby="arret-titre" className="rounded-sm border-2 border-warn/70 bg-warn/10 p-5">
                  <h2 id="arret-titre" className="flex items-center gap-2 font-extrabold">
                    <Icon name="alert" size={18} className="text-warn" />
                    Les e-mails vers ton adresse sont arrêtés
                  </h2>
                  <p className="mt-2 type-small">
                    Depuis le {formatDayShort(prefs.suppression.since)}, {SUPPRESSION_WORDS[prefs.suppression.reason] ?? "l'adresse ne reçoit plus nos e-mails"}.
                    Tes notifications continuent d&apos;arriver ici. Si ta boîte fonctionne de nouveau, reprends les e-mails.
                  </p>
                  <div className="mt-4">
                    <ClearSuppressionButton />
                  </div>
                </section>
              )}

              <section aria-labelledby="sujets-titre">
                <SectionHeader id="sujets-titre" index="01" kicker="Sujet par sujet" title="Sur le site, par e-mail" />
                {CATEGORIES.map((category) => {
                  const topics = prefs.topics.filter((t) => t.category === category);
                  if (topics.length === 0) return null;
                  return (
                    <div key={category} className="mt-8">
                      <h3 className="type-label text-muted">{CATEGORY_LABEL[category]}</h3>
                      <div className="mt-2 border-b border-line">
                        {topics.map((t) => (
                          <TopicPreference key={t.key} topic={t} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>

              <section aria-labelledby="calme-titre">
                <SectionHeader
                  id="calme-titre"
                  index="02"
                  kicker="La nuit, en cours"
                  title="Heures calmes"
                  description="Pendant ces heures, les e-mails qui peuvent attendre (rappels, annonces, messages des assos) partent à la fin. Ceux qui concernent une démarche en cours ou ta sécurité partent tout de suite."
                />
                <div className="mt-6">
                  <QuietHoursForm initial={prefs.settings} />
                </div>
              </section>

              <section aria-labelledby="suivies-titre">
                <SectionHeader
                  id="suivies-titre"
                  index="03"
                  kicker="Assos"
                  title="Les assos que tu suis"
                  description="Leurs nouveaux articles, événements et recrutements arrivent dans tes notifications (et par e-mail si tu l'as choisi pour « Assos que tu suis »)."
                />
                {prefs.follows.length === 0 ? (
                  <p className="mt-6 type-small text-muted">
                    Tu ne suis aucune asso. Pour en suivre une, ouvre sa page depuis{" "}
                    <Link href={routes.associations} className="link font-bold">
                      l&apos;annuaire
                    </Link>{" "}
                    et choisis « Suivre ».
                  </p>
                ) : (
                  <ul className="mt-6 border-b border-line">
                    {prefs.follows.map((o) => (
                      <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-line py-3">
                        <div className="flex min-w-0 flex-col">
                          <Link href={routes.association(o.slug)} className="link font-bold">
                            {o.name}
                          </Link>
                          <span className="type-small text-muted">Suivie depuis le {formatDayShort(o.since)}</span>
                        </div>
                        <UnfollowButton organizationId={o.id} name={o.short_name ?? o.name} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>

        <aside aria-labelledby="historique-titre" className="flex min-w-0 flex-col gap-4 lg:col-span-4 lg:col-start-9">
          <h2 id="historique-titre" className="border-t-2 border-fg pt-3 type-label text-muted">
            Tes derniers choix
          </h2>
          {!prefs || prefs.changes.length === 0 ? (
            <p className="type-small text-muted">Aucun changement pour l&apos;instant : ce sont les réglages de départ.</p>
          ) : (
            <ol className="flex flex-col">
              {prefs.changes.map((c, i) => (
                <li key={i} className="border-b border-line py-2.5 type-small">
                  <span className="font-bold">
                    {c.organization ?? (c.topic ? topicLabel.get(c.topic) : null) ?? ""}
                    {c.organization || c.topic ? " · " : ""}
                  </span>
                  {CHANGE_WORDS[c.change] ?? c.change}
                  <span className="block text-muted">
                    {formatDayShort(c.at)}, {SOURCE_WORDS[c.source] ?? ""}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="type-small text-muted">
            Un e-mail de l&apos;asso ou du BDE contient toujours un lien pour arrêter ce type d&apos;envoi, sans te connecter.
          </p>
        </aside>
      </div>
    </>
  );
}
