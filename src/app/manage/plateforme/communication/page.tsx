import type { Metadata } from "next";
import Link from "next/link";
import { renderNotificationEmail } from "@notify/email.ts";
import { notificationText } from "@notify/catalog.ts";
import { samplePayload, SAMPLE_NAME, SAMPLE_UNSUBSCRIBE } from "@notify/samples.ts";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { formatDateLong, formatTime } from "@/lib/format";
import { getAuthContext } from "@/lib/auth/context";
import { getMyAccess, hasPlatform } from "@/lib/governance/access";
import { getBde } from "@/lib/data/associations";
import {
  getBroadcastOptions,
  getFailedDeliveries,
  getNotificationCatalog,
  getNotificationHealth,
  getOrganizationBroadcasts,
  type NotificationHealth,
} from "@/lib/notifications/data";
import { retryDelivery } from "@/app/actions/notifications";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { MfaNotice, Notice } from "@/components/manage/governance/Notices";
import { PlatformDenied } from "@/components/manage/moderation/PlatformDenied";
import { BroadcastComposer } from "@/components/notifications/BroadcastComposer";
import { BroadcastHistory } from "@/components/notifications/BroadcastHistory";

export const metadata: Metadata = { title: "Communication" };

type Search = Promise<{ [key: string]: string | string[] | undefined }>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const MODE: Record<NotificationHealth["mode"], { label: string; detail: string; tone: "neutral" | "warn" | "ok" }> = {
  off: {
    label: "E-mails arrêtés",
    detail: "Aucun e-mail ne part : les notifications arrivent sur le site, les e-mails attendent dans la file.",
    tone: "warn",
  },
  capture: {
    label: "Mode test",
    detail: "Les e-mails sont fabriqués et gardés pour vérification, jamais envoyés.",
    tone: "warn",
  },
  live: { label: "En service", detail: "Les e-mails partent par le service d'envoi.", tone: "ok" },
};

const ALERT: Record<string, string> = {
  mode_off_with_queue: "Des e-mails attendent alors que l'envoi est arrêté.",
  worker_silent: "Des e-mails sont dus mais l'envoi n'a pas tourné depuis plus de 10 minutes.",
  backlog: "Plus de 50 e-mails en retard de plus de 15 minutes.",
  high_failure: "Beaucoup d'échecs définitifs sur 24 h (plus d'un sur cinq).",
  rate_limited: "Le service d'envoi limite le débit : les e-mails repartent plus lentement.",
  config_incomplete: "En service sans expéditeur ou sans adresse du site : rien ne part tant que ce n'est pas réglé.",
  worker_error: "Le dernier passage de l'envoi a signalé une erreur (voir ci-dessous).",
};

const ERROR_WORDS: Record<string, string> = {
  no_address: "Compte sans adresse e-mail",
  suppressed: "Adresse arrêtée (rebond ou signalement)",
  invalid_address: "Adresse refusée comme invalide",
  hard_bounce: "Adresse introuvable (rebond)",
  blocked: "Bloqué par la messagerie",
  refused: "Refusé par le service d'envoi",
  provider_error: "Erreur du service d'envoi",
  outcome_unknown: "Réponse perdue, plusieurs fois",
  transport_auth: "Clé du service d'envoi refusée",
  transport_quota: "Crédit du service d'envoi épuisé",
  transport_down: "Service d'envoi indisponible",
  transport_unreachable: "Service d'envoi injoignable",
  rate_limited: "Débit limité",
  render_failed: "Message impossible à fabriquer",
  capture_failed: "Mode test : enregistrement impossible",
  config_incomplete: "Réglage incomplet (expéditeur, adresse du site)",
  transport_not_configured: "Clé du service d'envoi absente",
  complete_failed: "Réponse non enregistrée",
  worker_failed: "Le passage s'est arrêté sur une erreur",
};

const when = (iso: string) => `${formatDateLong(iso)} à ${formatTime(iso)}`;

/**
 * /manage/plateforme/communication — the BDE's communication desk.
 * With platform.communications.monitor: the health of e-mail delivery
 * (counts, alerts, the last runs), failed e-mails without recipient,
 * address or content (and a retry, with the second factor), and the
 * preview of every template with obviously fictional values. With
 * platform.communications.broadcast: announcements to the whole campus,
 * a campus-wide e-mail waiting for another officer's approval.
 */
export default async function PlatformCommunicationPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const [access, ctx] = await Promise.all([getMyAccess(), getAuthContext()]);
  const canMonitor = hasPlatform(access, "platform.communications.monitor");
  const canBroadcast = hasPlatform(access, "platform.communications.broadcast");
  if (!canMonitor && !canBroadcast) return <PlatformDenied title="Communication" right="Annonces du BDE ou Suivre les envois" />;
  const aal2 = ctx.status === "authenticated" && ctx.aal === "aal2";

  const bde = canBroadcast ? await getBde() : null;
  const [health, failed, catalog, options, history] = await Promise.all([
    canMonitor ? getNotificationHealth() : null,
    canMonitor ? getFailedDeliveries(50) : [],
    canMonitor ? getNotificationCatalog() : [],
    bde ? getBroadcastOptions(bde.id) : null,
    bde ? getOrganizationBroadcasts(bde.id) : [],
  ]);
  const describe = new Map(catalog.map((t) => [t.key, t.description]));

  // The template preview: one kind at a time, fictional values, never sent.
  const kind = catalog.some((t) => t.key === first(sp.modele)) ? first(sp.modele) : (catalog[0]?.key ?? "");
  const type = catalog.find((t) => t.key === kind);
  const preview = type
    ? renderNotificationEmail({
        kind,
        payload: samplePayload(kind),
        name: SAMPLE_NAME,
        site: new URL("https://site.example.test"),
        essential: type.class === "essential",
        confidential: type.confidential,
        importance: type.importance,
        application_id: "00000000-0000-4000-8000-000000000000",
        organization: { slug: "asso-test-exemple", name: "Asso test (exemple)", short_name: null },
        unsubscribe: type.class === "essential" ? null : SAMPLE_UNSUBSCRIBE,
      })
    : null;

  return (
    <div className="flex flex-col gap-12">
      <ManagePageHeader
        kicker="Centre de contrôle BDE"
        title="Communication"
        description={
          <p>
            Les annonces du BDE à tout le campus, et l&apos;état des e-mails envoyés par le site. Aucun contenu de message ni aucune
            adresse n&apos;apparaît ici : seulement des chiffres et des raisons.
          </p>
        }
      />
      {!aal2 && <MfaNotice what="envoyer une annonce par e-mail, l'approuver ou relancer un envoi" />}

      {canBroadcast && (
        <ManageSection title="Annonces du BDE">
          {options && bde ? (
            <div className="grid gap-10 lg:grid-cols-2">
              <div className="max-w-2xl">
                <BroadcastComposer organizationId={bde.id} options={options} />
              </div>
              <div>
                <h3 className="mb-3 type-label text-muted">Historique</h3>
                <BroadcastHistory items={history} />
              </div>
            </div>
          ) : (
            <Notice title="Les annonces ne se chargent pas pour l'instant.">Réessaie dans un instant.</Notice>
          )}
        </ManageSection>
      )}

      {canMonitor && health && (
        <ManageSection title="État des envois">
          <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <StatusBadge tone={MODE[health.mode].tone}>{MODE[health.mode].label}</StatusBadge>
              <span className="type-small text-muted">{MODE[health.mode].detail}</span>
            </div>
            {health.alerts.length > 0 && (
              <ul className="flex flex-col gap-2">
                {health.alerts.map((a) => (
                  <li key={a} className="flex items-start gap-2 rounded-sm border-2 border-warn/60 bg-warn/10 px-3 py-2 type-small font-semibold">
                    {ALERT[a] ?? a}
                  </li>
                ))}
              </ul>
            )}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {[
                ["Dus maintenant", health.queue.due],
                ["Programmés", health.queue.waiting],
                ["En nouvel essai", health.queue.retrying],
                ["En cours", health.queue.processing],
                ["Partis (24 h)", health.last_24h.accepted + health.last_24h.delivered],
                ["Remis confirmés (24 h)", health.last_24h.delivered],
                ["Échecs (24 h)", health.last_24h.failed],
                ["Adresses arrêtées", health.suppressions],
              ].map(([label, value]) => (
                <div key={label as string} className="flex flex-col gap-1 border-t-2 border-fg pt-2">
                  <dt className="type-label text-muted">{label}</dt>
                  <dd className="type-numeral text-[2rem]">{value}</dd>
                </div>
              ))}
            </dl>
            <ul className="flex flex-wrap gap-x-6 gap-y-1 type-small">
              {(
                [
                  ["Expéditeur", health.configured.email_from],
                  ["Adresse du site", health.configured.site_url],
                  ["Appel de l'envoi", health.configured.worker],
                  ["Retours du service d'envoi", health.configured.webhook],
                ] as const
              ).map(([label, ok]) => (
                <li key={label} className={cx("inline-flex items-center gap-1.5", ok ? "text-ok" : "text-muted")}>
                  {ok ? "✓" : "○"} {label} {ok ? "réglé" : "à régler"}
                </li>
              ))}
            </ul>
            <p className="type-small text-muted">
              {health.last_run
                ? `Dernier passage le ${when(health.last_run.started_at)} (${health.last_run.claimed} pris, ${health.last_run.accepted} partis, ${health.last_run.failed} en échec)${health.last_run.error ? ` · ${ERROR_WORDS[health.last_run.error] ?? health.last_run.error}` : ""}. ${health.runs_last_hour} passage${health.runs_last_hour > 1 ? "s" : ""} dans l'heure.`
                : "L'envoi n'a encore jamais tourné."}
            </p>
          </div>
        </ManageSection>
      )}

      {canMonitor && (
        <ManageSection title="E-mails non remis" count={failed.length}>
          {failed.length === 0 ? (
            <p className="type-small text-muted">Aucun échec définitif. Les envois en nouvel essai apparaissent seulement s&apos;ils finissent par échouer.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left type-small">
                <thead>
                  <tr className="border-b-2 border-fg">
                    <th scope="col" className="py-2 pr-4 type-label">Message</th>
                    <th scope="col" className="py-2 pr-4 type-label">Asso</th>
                    <th scope="col" className="py-2 pr-4 type-label">Raison</th>
                    <th scope="col" className="py-2 pr-4 type-label">Essais</th>
                    <th scope="col" className="py-2 pr-4 type-label">Dernier essai</th>
                    <th scope="col" className="py-2 type-label"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {failed.map((d) => (
                    <tr key={d.id} className="border-b border-line align-top">
                      <td className="py-2.5 pr-4">
                        {describe.get(d.kind) ?? d.kind}
                        {d.essential && <span className="ml-1.5 text-muted">· essentiel</span>}
                      </td>
                      <td className="py-2.5 pr-4">{d.organization ?? "—"}</td>
                      <td className="py-2.5 pr-4">{d.error ? (ERROR_WORDS[d.error] ?? d.error) : "—"}</td>
                      <td className="py-2.5 pr-4 font-mono">{d.attempts}</td>
                      <td className="py-2.5 pr-4">{when(d.updated_at)}</td>
                      <td className="py-2.5">
                        {d.retryable && aal2 && (
                          <ActionForm action={retryDelivery} hidden={{ delivery_id: String(d.id) }} submitLabel="Relancer" variant="secondary" size="sm" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ManageSection>
      )}

      {canMonitor && type && preview && (
        <ManageSection title="Aperçu des e-mails">
          <div className="grid gap-8 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <nav aria-label="Modèles">
              <ul className="flex max-h-[32rem] flex-col overflow-y-auto border-y border-line">
                {catalog.map((t) => (
                  <li key={t.key}>
                    <Link
                      href={`${routes.managePlatformCommunications}?modele=${t.key}#apercu`}
                      aria-current={t.key === kind ? "true" : undefined}
                      className={cx(
                        "block border-b border-line px-3 py-2 text-[0.85rem] last:border-b-0",
                        t.key === kind ? "bg-fg font-bold text-bg" : "hover:bg-fg/8",
                      )}
                    >
                      {notificationText(t.key, samplePayload(t.key)).title}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div id="apercu" className="flex min-w-0 flex-col gap-4">
              <dl className="grid gap-x-4 gap-y-1 type-small sm:grid-cols-[8rem_minmax(0,1fr)]">
                <dt className="text-muted">Type</dt>
                <dd>{type.description}</dd>
                <dt className="text-muted">Classe</dt>
                <dd>
                  {type.class === "essential" ? "Essentiel (ne se désactive pas)" : type.class === "operational" ? "Utile (e-mail désactivable)" : "Facultatif"}
                  {type.confidential ? " · confidentiel (objet neutre)" : ""}
                </dd>
                <dt className="text-muted">Objet</dt>
                <dd className="font-bold">{preview.subject}</dd>
                <dt className="text-muted">En-têtes</dt>
                <dd className="break-all font-mono text-[0.78rem]">
                  {Object.keys(preview.headers).length ? Object.keys(preview.headers).join(", ") : "aucun (pas de désabonnement en un clic)"}
                </dd>
              </dl>
              <iframe
                title={`Aperçu : ${preview.subject}`}
                srcDoc={preview.html}
                sandbox=""
                className="h-[34rem] w-full rounded-sm border-2 border-line-strong bg-white"
              />
              <details className="type-small">
                <summary className="cursor-pointer font-bold">Version texte</summary>
                <pre className="mt-2 whitespace-pre-wrap rounded-sm border border-line bg-raised p-3 font-mono text-[0.8rem]">{preview.text}</pre>
              </details>
              <p className="type-small text-muted">Valeurs d&apos;exemple, fictives. Les liens pointent vers une adresse de test.</p>
            </div>
          </div>
        </ManageSection>
      )}
    </div>
  );
}
