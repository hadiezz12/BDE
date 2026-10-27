import type { Metadata } from "next";
import { getAuthContext } from "@/lib/auth/context";
import { formatDateLong } from "@/lib/format";
import { getMyAccess, hasPlatform } from "@/lib/governance/access";
import { getPlatformOperations, getSecurityHealth } from "@/lib/continuity/data";
import { INCIDENT_KIND, INCIDENT_SEVERITY, INCIDENT_STATUS, NOTIFICATION_MODE, SECURITY_CHECK } from "@/lib/continuity/labels";
import { LATEST_MIGRATION } from "@/lib/continuity/schema";
import { openIncident, updateIncident } from "@/app/actions/continuity";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { StatGroup, StatTile } from "@/components/manage/StatTile";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { MfaNotice, Notice } from "@/components/manage/governance/Notices";
import { PlatformDenied } from "@/components/manage/moderation/PlatformDenied";
import { IssueList, JobsTable, when } from "@/components/continuity/ContinuityBlocks";

export const metadata: Metadata = { title: "Opérations" };

const CHECK_TONE = { ok: "ok", attention: "danger", info: "neutral" } as const;

function checkValue(key: string, value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "aucun";
  if (key === "notification_mode") return NOTIFICATION_MODE[String(value)] ?? String(value);
  return value === null || value === undefined ? "—" : String(value);
}

/**
 * /manage/plateforme/continuite/operations — what keeps running without
 * anyone: the recurring jobs (health measured from their last success, a
 * safe retry with the second factor), the e-mail and file queues, a
 * security self-check (counts and object names only), schema drift, and the
 * incident log. No secret, no connection string, no "run SQL".
 */
export default async function OperationsPage() {
  const [access, ctx] = await Promise.all([getMyAccess(), getAuthContext()]);
  if (!hasPlatform(access, "platform.operations.monitor")) return <PlatformDenied title="Opérations" right="Suivre la continuité du site" />;
  const aal2 = ctx.status === "authenticated" && ctx.aal === "aal2";
  const [ops, security] = await Promise.all([getPlatformOperations(), getSecurityHealth()]);
  if (!ops) return <Notice tone="danger" icon="alert" title="Les opérations n'ont pas pu être chargées." />;

  const storageJob = ops.jobs.find((j) => j.key === "storage-cleanup");
  const storageReason = storageJob?.last_result?.reason;
  const drift = ops.schema_version && ops.schema_version !== LATEST_MIGRATION;
  const open = ops.incidents.filter((i) => i.status !== "resolved");
  const resolved = ops.incidents.filter((i) => i.status === "resolved");
  const testAccounts = process.env.AUTH_TEST_ACCOUNTS === "on";

  return (
    <div className="flex flex-col gap-12">
      <ManagePageHeader
        kicker="Continuité"
        title="Opérations"
        description={
          <p>
            Les tâches qui tournent seules, les files d&apos;attente, un contrôle de sécurité et les incidents. Les comptes techniques
            (base, hébergement, e-mails) ne s&apos;administrent pas d&apos;ici&nbsp;: voir le registre et le guide du responsable technique.
          </p>
        }
      />
      {!aal2 && <MfaNotice what="relancer une tâche" />}

      {ops.issues.length > 0 && (
        <ManageSection title="Points techniques" count={ops.issues.length}>
          <IssueList issues={ops.issues} target="operations" empty="" />
        </ManageSection>
      )}

      <ManageSection title="Tâches automatiques" count={ops.jobs.length}>
        <JobsTable jobs={ops.jobs} canRetry={aal2} schedulerAvailable={ops.scheduler_available} />
      </ManageSection>

      <ManageSection title="Files d'attente">
        <StatGroup label="Files d'attente">
          <StatTile
            label="E-mails"
            value={({ off: "Arrêtés", capture: "Test", live: "En service" } as Record<string, string>)[ops.notifications.mode] ?? ops.notifications.mode}
            tone={ops.notifications.mode === "live" ? "ok" : "neutral"}
            comparison={NOTIFICATION_MODE[ops.notifications.mode]}
          />
          <StatTile label="E-mails dus maintenant" value={ops.notifications.due} tone={ops.notifications.due > 50 ? "danger" : "neutral"} />
          <StatTile label="Non remis (7 jours)" value={ops.notifications.failed_7d} comparison={`${ops.notifications.accepted_7d} partis`} tone={ops.notifications.failed_7d ? "danger" : "neutral"} />
          <StatTile
            label="Fichiers à supprimer"
            value={ops.storage.pending}
            tone={ops.storage.stuck ? "danger" : "neutral"}
            comparison={ops.storage.stuck ? `${ops.storage.stuck} bloqués après 10 essais` : ops.storage.oldest ? `le plus ancien du ${formatDateLong(ops.storage.oldest)}` : "rien en attente"}
          />
        </StatGroup>
        {storageReason === "not_configured" && ops.storage.pending > 0 && (
          <Notice tone="warn" icon="alert" title="Le nettoyage des fichiers n'est pas encore branché.">
            <p>
              Des fichiers attendent, mais l&apos;adresse et le jeton du nettoyage ne sont pas dans le coffre de la base. Rien n&apos;est
              perdu&nbsp;: ils partiront dès que le ou la responsable technique l&apos;aura configuré (voir son guide).
            </p>
          </Notice>
        )}
      </ManageSection>

      <ManageSection title="Contrôle de sécurité" description="Refait à chaque visite. Il signale ; il ne corrige jamais une règle tout seul.">
        {!security ? (
          <Notice tone="danger" icon="alert" title="Le contrôle n'a pas pu être lancé." />
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-md border border-line bg-raised">
            {security.checks.map((c) => (
              <li key={c.key} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-semibold">{SECURITY_CHECK[c.key]?.label ?? c.key}</span>
                  <span className="type-small text-muted">{SECURITY_CHECK[c.key]?.help}</span>
                  {(c.status !== "ok" || c.key === "schema_version" || c.key === "anon_functions") && (
                    <span className="break-all font-mono text-[0.78rem]">{checkValue(c.key, c.value)}</span>
                  )}
                </span>
                <StatusBadge tone={CHECK_TONE[c.status]}>{c.status === "ok" ? "OK" : c.status === "info" ? "Info" : "À corriger"}</StatusBadge>
              </li>
            ))}
            <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">Schéma de la base et code du site</span>
                <span className="type-small text-muted">
                  Dernière migration du code&nbsp;: <span className="font-mono">{LATEST_MIGRATION}</span> · de la base&nbsp;:{" "}
                  <span className="font-mono">{ops.schema_version ?? "inconnue"}</span>
                  {drift && ". Ils diffèrent : appliquer les migrations manquantes (ou déployer le code) selon le guide, sans modifier la base à la main."}
                </span>
              </span>
              <StatusBadge tone={drift ? "danger" : ops.schema_version ? "ok" : "neutral"}>{drift ? "Écart" : ops.schema_version ? "À jour" : "Inconnu"}</StatusBadge>
            </li>
            <li className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <span className="flex flex-col gap-0.5">
                <span className="font-semibold">Comptes de test sur ce serveur</span>
                <span className="type-small text-muted">
                  {testAccounts
                    ? "Activés (AUTH_TEST_ACCOUNTS=on). Normal en développement ; ne doit jamais l'être sur le site en service."
                    : "Désactivés."}
                </span>
              </span>
              <StatusBadge tone={testAccounts ? "warn" : "ok"}>{testAccounts ? "Activés" : "Désactivés"}</StatusBadge>
            </li>
          </ul>
        )}
      </ManageSection>

      <ManageSection title="Incidents" count={open.length} description="Un problème sérieux, qui s'en occupe, et où il en est. Jamais de détail sur une personne candidate.">
        <Disclosure summary="Ouvrir un incident" icon="plus" tone="primary" open={open.length === 0 ? undefined : false}>
          <ActionForm action={openIncident} submitLabel="Ouvrir l'incident" resetOnDone>
            <Field label="Ce qui se passe" hint="Ex : Les e-mails de confirmation partent en retard">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="title" required minLength={3} maxLength={140} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Type">
                {({ id, describedBy }) => (
                  <Select id={id} aria-describedby={describedBy} name="kind" defaultValue="infrastructure">
                    {Object.entries(INCIDENT_KIND).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Gravité">
                {({ id, describedBy }) => (
                  <Select id={id} aria-describedby={describedBy} name="severity" defaultValue="medium">
                    {Object.entries(INCIDENT_SEVERITY).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Field label="Conséquences" optional hint="Ce que les étudiant·es ou les assos remarquent.">
              {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="impact" maxLength={500} className="min-h-16" />}
            </Field>
          </ActionForm>
        </Disclosure>

        {ops.incidents.length === 0 ? (
          <ManageEmpty icon="check" title="Aucun incident">
            <p>Les incidents ouverts et ceux résolus ces trois derniers mois apparaissent ici.</p>
          </ManageEmpty>
        ) : (
          <ul className="flex flex-col gap-4">
            {[...open, ...resolved].map((i) => {
              const status = INCIDENT_STATUS[i.status] ?? INCIDENT_STATUS.open;
              return (
                <li key={i.id} className="flex flex-col gap-2 rounded-md border border-line bg-raised px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{i.title}</span>
                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                  </div>
                  <p className="type-small text-muted">
                    {INCIDENT_KIND[i.kind]?.label ?? i.kind} · gravité {(INCIDENT_SEVERITY[i.severity] ?? i.severity).toLowerCase()} · relevé le{" "}
                    {when(i.detected_at)}
                    {i.owner_name && ` · suivi par ${i.owner_name}`}
                    {i.resolved_at && ` · résolu le ${when(i.resolved_at)}`}
                  </p>
                  {i.impact && <p className="type-small">{i.impact}</p>}
                  {i.status !== "resolved" && <p className="type-small">À prévenir&nbsp;: {INCIDENT_KIND[i.kind]?.escalation}</p>}
                  {i.updates.length > 0 && (
                    <ol className="flex flex-col gap-1 border-l-2 border-line pl-3 type-small">
                      {i.updates.map((u, k) => (
                        <li key={k}>
                          <span className="text-muted">
                            {when(u.created_at)}
                            {u.author_name ? `, ${u.author_name}` : ""} · {(INCIDENT_STATUS[u.status] ?? INCIDENT_STATUS.open).label}&nbsp;:
                          </span>{" "}
                          {u.note}
                        </li>
                      ))}
                    </ol>
                  )}
                  {i.status !== "resolved" && (
                    <Disclosure summary="Mettre à jour" icon="edit">
                      <ActionForm action={updateIncident} hidden={{ incident_id: i.id }} submitLabel="Enregistrer" resetOnDone>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="État">
                            {({ id, describedBy }) => (
                              <Select id={id} aria-describedby={describedBy} name="status" defaultValue={i.status}>
                                {Object.entries(INCIDENT_STATUS).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v.label}
                                  </option>
                                ))}
                              </Select>
                            )}
                          </Field>
                          <Field label="Gravité">
                            {({ id, describedBy }) => (
                              <Select id={id} aria-describedby={describedBy} name="severity" defaultValue={i.severity}>
                                {Object.entries(INCIDENT_SEVERITY).map(([k, v]) => (
                                  <option key={k} value={k}>
                                    {v}
                                  </option>
                                ))}
                              </Select>
                            )}
                          </Field>
                        </div>
                        <Field label="Note" hint="Ce qui a été fait ou constaté.">
                          {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="note" required maxLength={1000} className="min-h-16" />}
                        </Field>
                      </ActionForm>
                    </Disclosure>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </ManageSection>
    </div>
  );
}
