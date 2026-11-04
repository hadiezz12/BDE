import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { routes } from "@/lib/routes";
import { getAuthContext } from "@/lib/auth/context";
import { getMyAccess } from "@/lib/governance/access";
import { canHandlePrivacy } from "@/lib/governance/workspace";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { formatDateLong, formatDayShort, formatTime } from "@/lib/format";
import { getPrivacyRequest } from "@/lib/privacy/data";
import {
  DATA_COUNT_LABEL,
  DECISIONS,
  IDENTITY_STATUS,
  REQUEST_EVENT_LABEL,
  REQUEST_KIND_LABEL,
  REQUEST_STATUS,
  RESPONSIBILITY_KIND,
  dueDayIso,
} from "@/lib/privacy/labels";
import {
  addPrivacyNote,
  completePrivacyRequest,
  decidePrivacyRequest,
  executePrivacyErasure,
  extendPrivacyRequest,
  preparePrivacyExport,
  verifyPrivacyIdentity,
} from "@/app/actions/privacy";
import { ButtonLink } from "@/components/ui/Button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManageMain } from "@/components/manage/ManageFrame";
import { ManageGateState } from "@/components/manage/ManageState";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { MfaNotice, Notice } from "@/components/manage/governance/Notices";

type Params = Promise<{ id: string }>;

export const metadata: Metadata = { title: "Demande sur les données", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /manage/donnees/demandes/[id] — one request, for the privacy officer: who
 * asked (name and address, to answer), what they hold, their
 * responsibilities, the history, and the next step (identity, decision,
 * extension, export, erasure, completion). The database checks every step.
 */
export default async function PrivacyRequestPage({ params }: { params: Params }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") {
    return (
      <ManageMain>
        <ManageGateState reason="login" />
      </ManageMain>
    );
  }
  if (!canHandlePrivacy(await getMyAccess())) notFound();
  if (ctx.aal !== "aal2") {
    return (
      <ManageMain>
        <div className="flex flex-col gap-8">
          <ManagePageHeader kicker="Données personnelles" title="Demande" />
          <MfaNotice what="Traiter une demande sur les données" />
        </div>
      </ManageMain>
    );
  }
  const read = await getPrivacyRequest(id.toLowerCase());
  if (!read.ok) {
    if (read.code === "privacy_request_not_found") notFound();
    return (
      <ManageMain>
        <Notice tone="danger" icon="alert" title={governanceErrorMessage(read.code)} />
      </ManageMain>
    );
  }
  const { request: q, requester, events, artifacts, pending_files } = read.data;
  const st = REQUEST_STATUS[q.status];
  const open = !["completed", "refused", "withdrawn"].includes(q.status);
  const deciding = q.status === "received" || q.status === "under_review";
  const acting = ["approved", "partially_approved", "in_progress"].includes(q.status);
  const hidden = { request_id: q.id };

  return (
    <ManageMain>
      <div className="flex flex-col gap-10">
        <ManagePageHeader
          kicker="Données personnelles"
          title={`${q.reference} · ${REQUEST_KIND_LABEL[q.kind]}`}
          description={
            <p>
              Reçue le {formatDateLong(q.received_at)}
              {q.source === "offline" ? " (hors du site)" : ""}.{" "}
              {open ? (
                <>
                  Réponse au plus tard le <strong>{formatDateLong(dueDayIso(q.effective_due_at))}</strong>
                  {q.extended_until ? " (délai prolongé)" : ""}.
                </>
              ) : null}
            </p>
          }
          meta={<StatusBadge tone={st.tone}>{st.label}</StatusBadge>}
          actions={
            <ButtonLink href={routes.managePrivacy} variant="secondary" size="sm" icon="arrow-left" iconPosition="start">
              Toutes les demandes
            </ButtonLink>
          }
        />

        <ManageSection title="La demande">
          <dl className="flex flex-col gap-3 rounded-md border border-line bg-raised p-4">
            <div>
              <dt className="type-label text-[0.7rem] text-subtle">Personne</dt>
              <dd>
                {requester ? (
                  <>
                    {requester.name}
                    {requester.email && <span className="text-muted"> · {requester.email}</span>}
                    {requester.erased && <span className="text-muted"> · compte effacé</span>}
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="type-label text-[0.7rem] text-subtle">Identité</dt>
              <dd>
                {IDENTITY_STATUS[q.identity_status] ?? q.identity_status}
                {q.identity_note && <span className="block type-small text-muted">{q.identity_note}</span>}
              </dd>
            </div>
            {q.details && (
              <div>
                <dt className="type-label text-[0.7rem] text-subtle">Précisions</dt>
                <dd className="whitespace-pre-line">{q.details}</dd>
              </div>
            )}
            {q.decision_reason && (
              <div>
                <dt className="type-label text-[0.7rem] text-subtle">Motif de la décision</dt>
                <dd>{q.decision_reason}</dd>
              </div>
            )}
          </dl>
        </ManageSection>

        {requester && (
          <ManageSection title="Ce que le site garde sur cette personne" description="Des comptes, pour préparer la réponse ; le détail est dans l'export.">
            <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {Object.entries(DATA_COUNT_LABEL).map(([key, label]) => (
                <div key={key} className="flex items-baseline justify-between gap-3 border-b border-line py-2 type-small">
                  <dt>{label}</dt>
                  <dd className="type-meta font-bold">{String(requester.counts[key] ?? 0)}</dd>
                </div>
              ))}
            </dl>
            {(requester.held || requester.held_applications > 0) && (
              <Notice tone="warn" icon="lock" title="Conservation exceptionnelle en cours" className="mt-4">
                <p>
                  {requester.held
                    ? "Le compte entier est concerné : l'effacement est bloqué tant qu'elle s'applique."
                    : `${requester.held_applications} candidature(s) concernée(s) : elles resteront, le reste sera effacé.`}
                </p>
              </Notice>
            )}
            {requester.responsibilities.length > 0 && (
              <Notice tone="warn" icon="users" title="Responsabilités en cours" className="mt-4">
                <ul className="flex flex-col gap-1">
                  {requester.responsibilities.map((r, i) => (
                    <li key={i}>
                      {RESPONSIBILITY_KIND[r.kind] ?? r.kind}
                      {r.title ? ` « ${r.title} »` : ""}
                      {r.organization ? ` · ${r.organization}` : ""} · jusqu&apos;au {formatDayShort(r.ends_at)}
                    </li>
                  ))}
                </ul>
                <p className="mt-2">
                  Un effacement les terminerait : préviens l&apos;équipe ou le BDE pour qu&apos;une succession soit organisée, sans faire attendre la
                  demande au-delà du délai.
                </p>
              </Notice>
            )}
          </ManageSection>
        )}

        {open && (
          <ManageSection title="Étape suivante">
            <div className="flex max-w-2xl flex-col gap-6">
              {deciding && (
                <ActionForm action={verifyPrivacyIdentity} hidden={hidden} submitLabel="Enregistrer la vérification" variant="secondary" size="sm">
                  <Field label="Identité">
                    {({ id: fid, describedBy }) => (
                      <Select id={fid} aria-describedby={describedBy} name="identity_status" defaultValue="verified">
                        <option value="verified">Vérifiée</option>
                        <option value="pending">À vérifier encore</option>
                        <option value="failed">Non vérifiée</option>
                      </Select>
                    )}
                  </Field>
                  <Field label="Comment" hint="Ce qui a suffi, sans copier de pièce d'identité.">
                    {({ id: fid, describedBy }) => <Input id={fid} aria-describedby={describedBy} name="note" required maxLength={500} />}
                  </Field>
                </ActionForm>
              )}
              {deciding && (
                <ActionForm action={decidePrivacyRequest} hidden={hidden} submitLabel="Enregistrer la décision" size="sm">
                  <Field label="Décision">
                    {({ id: fid, describedBy }) => (
                      <Select id={fid} aria-describedby={describedBy} name="decision">
                        {DECISIONS.map((d) => (
                          <option key={d.key} value={d.key}>
                            {d.label}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Motif (envoyé à la personne)" hint="Pour un refus ou une réponse partielle : la règle ou le droit d'autrui qui s'applique. La personne peut saisir la CNIL.">
                    {({ id: fid, describedBy }) => <Textarea id={fid} aria-describedby={describedBy} name="reason" rows={3} maxLength={2000} />}
                  </Field>
                </ActionForm>
              )}
              {q.extension_possible && (
                <ActionForm action={extendPrivacyRequest} hidden={hidden} submitLabel="Prolonger le délai" variant="secondary" size="sm">
                  <p className="type-small text-muted">Une fois, si la demande est complexe ou nombreuse ; la personne reçoit la raison.</p>
                  <Field label="De">
                    {({ id: fid, describedBy }) => (
                      <Select id={fid} aria-describedby={describedBy} name="months" defaultValue="1">
                        <option value="1">1 mois</option>
                        <option value="2">2 mois</option>
                      </Select>
                    )}
                  </Field>
                  <Field label="Raison">
                    {({ id: fid, describedBy }) => <Textarea id={fid} aria-describedby={describedBy} name="reason" rows={2} required maxLength={1000} />}
                  </Field>
                </ActionForm>
              )}
              {acting && (q.kind === "access" || q.kind === "portability") && (
                <ActionForm action={preparePrivacyExport} hidden={hidden} submitLabel="Préparer l'export" size="sm">
                  <p className="type-small text-muted">
                    Les données du compte, comme dans le téléchargement de la personne, disponibles 14 jours dans Mes données.
                  </p>
                  {q.kind === "access" && (
                    <Checkbox
                      name="assessments"
                      label="Inclure les évaluations de ses candidatures"
                      description="Notes, recommandations et décisions, sans le nom des évaluateur·rices ni les commentaires d'équipe."
                    />
                  )}
                </ActionForm>
              )}
              {acting && q.kind === "erasure" && requester && !requester.erased && (
                <ActionForm action={executePrivacyErasure} hidden={hidden} submitLabel="Effacer les données" variant="danger" size="sm">
                  <p className="type-small">
                    Efface les candidatures et fichiers, inscriptions, enregistrés, choix et notifications, et ferme le compte (le profil
                    devient « Compte supprimé » dans l&apos;historique). Les éléments sous conservation exceptionnelle restent.
                  </p>
                  {requester.responsibilities.length > 0 && (
                    <Checkbox name="end_responsibilities" label="Mettre fin maintenant à ses responsabilités en cours" />
                  )}
                  <Field label={`Recopie la référence (${q.reference}) pour confirmer`}>
                    {({ id: fid, describedBy }) => <Input id={fid} aria-describedby={describedBy} name="confirm" required autoComplete="off" />}
                  </Field>
                </ActionForm>
              )}
              {acting && (
                <ActionForm action={completePrivacyRequest} hidden={hidden} submitLabel="Terminer la demande" variant="secondary" size="sm">
                  {pending_files > 0 && (
                    <p className="type-small text-warn">{pending_files} fichier(s) encore à supprimer du stockage : la demande se termine ensuite.</p>
                  )}
                  <Field label="Ce qui a été fait (envoyé à la personne)">
                    {({ id: fid, describedBy }) => <Input id={fid} aria-describedby={describedBy} name="note" required maxLength={2000} />}
                  </Field>
                </ActionForm>
              )}
              <ActionForm action={addPrivacyNote} hidden={hidden} submitLabel="Ajouter" variant="ghost" size="sm" resetOnDone>
                <Field label="Note ou message">
                  {({ id: fid, describedBy }) => <Textarea id={fid} aria-describedby={describedBy} name="note" rows={2} required maxLength={2000} />}
                </Field>
                <Checkbox name="visible" label="L'envoyer à la personne (sinon, note interne)" />
              </ActionForm>
            </div>
          </ManageSection>
        )}

        <ManageSection title="Historique" count={events.length}>
          <ol className="flex flex-col gap-2 border-l-2 border-line pl-4 type-small">
            {events.map((e, i) => (
              <li key={i}>
                <span className="font-semibold">{REQUEST_EVENT_LABEL[e.action] ?? e.action}</span>
                <span className="text-muted">
                  {" "}
                  · {formatDayShort(e.at)} {formatTime(e.at)}
                  {e.by ? ` · ${e.by}` : ""}
                  {e.visible ? " · visible par la personne" : ""}
                </span>
                {e.note && <span className="block whitespace-pre-line">{e.note}</span>}
              </li>
            ))}
          </ol>
          {artifacts.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 type-small">
              {artifacts.map((a) => (
                <li key={a.id}>
                  Export du {formatDayShort(a.created_at)} · {Math.ceil(a.size_bytes / 1024)} Ko ·{" "}
                  {a.purged_at ? "effacé" : `disponible jusqu'au ${formatDayShort(a.expires_at)}`} · téléchargé {a.download_count} fois
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 type-small text-muted">
            <Link href={routes.privacy} className="link">
              Notice de confidentialité
            </Link>
          </p>
        </ManageSection>
      </div>
    </ManageMain>
  );
}
