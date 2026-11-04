import Link from "next/link";
import { routes } from "@/lib/routes";
import { formatDateLong, formatDayShort, formatTime } from "@/lib/format";
import type { PrivacyQueue } from "@/lib/privacy/data";
import {
  AUTHORITY_DECISION,
  DATA_CATEGORIES,
  HOLD_SCOPE,
  INCIDENT_RISK,
  INDIVIDUALS_DECISION,
  REQUEST_KIND_LABEL,
  REQUEST_KINDS,
  REQUEST_STATUS,
  dueDayIso,
} from "@/lib/privacy/labels";
import { DRAFT_VERSION } from "@/lib/privacy/notice";
import {
  assessPrivacyIncident,
  openPrivacyIncident,
  placeRetentionHold,
  reconcileErasures,
  recordOfflinePrivacyRequest,
  recordPrivacyNoticeApproval,
  releaseRetentionHold,
} from "@/app/actions/privacy";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManageSection } from "@/components/manage/ManagePageHeader";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";

/**
 * The privacy officer's desk (Phase 14): the requests with their deadline,
 * personal-data incidents with the 72-hour clock, retention holds, the
 * approval of the notice and the reconciliation after a restore. Every
 * action goes through a database function that checks the officer's key
 * and the second factor again.
 */

const when = (iso: string) => `${formatDayShort(iso)} · ${formatTime(iso)}`;

export function RequestQueue({ queue }: { queue: PrivacyQueue }) {
  const open = queue.requests.filter((r) => !["completed", "refused", "withdrawn"].includes(r.status));
  const closed = queue.requests.filter((r) => ["completed", "refused", "withdrawn"].includes(r.status));
  return (
    <ManageSection
      title="Demandes"
      count={open.length}
      description="Un mois pour répondre à partir de la réception ; une seule prolongation (deux mois au plus), annoncée avant la fin du premier mois."
    >
      {queue.requests.length === 0 ? (
        <p className="type-small text-muted">Aucune demande.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-line bg-raised">
          <table className="w-full min-w-[44rem] border-collapse text-left type-small">
            <thead>
              <tr className="border-b border-line bg-sunken/60">
                {["Référence", "Demande", "Personne", "Statut", "À répondre avant"].map((h) => (
                  <th key={h} scope="col" className="px-3.5 py-2 type-label text-[0.68rem] text-subtle">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...open, ...closed].map((r) => {
                const st = REQUEST_STATUS[r.status];
                return (
                  <tr key={r.id} className="border-b border-line align-top last:border-b-0">
                    <th scope="row" className="px-3.5 py-2.5">
                      <Link href={routes.managePrivacyRequest(r.id)} className="font-mono font-bold underline-offset-2 hover:underline">
                        {r.reference}
                      </Link>
                      {r.source === "offline" && <span className="block type-meta text-subtle">hors du site</span>}
                    </th>
                    <td className="px-3.5 py-2.5">{REQUEST_KIND_LABEL[r.kind]}</td>
                    <td className="px-3.5 py-2.5">{r.requester ?? "—"}</td>
                    <td className="px-3.5 py-2.5">
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                    </td>
                    <td className="px-3.5 py-2.5 type-meta">
                      {["completed", "refused", "withdrawn"].includes(r.status) ? (
                        "—"
                      ) : (
                        <span className={r.overdue ? "font-bold text-danger" : undefined}>
                          {formatDateLong(dueDayIso(r.due_at))}
                          {r.extended && " (prolongé)"}
                          {r.overdue && " · dépassé"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Disclosure summary="Enregistrer une demande reçue hors du site" icon="mail" className="mt-4">
        <div className="px-3.5 pb-3.5">
          <ActionForm action={recordOfflinePrivacyRequest} submitLabel="Enregistrer la demande" variant="secondary" size="sm" resetOnDone>
            <p className="type-small text-muted">
              Pour une personne qui n&apos;a plus accès à son compte. Vérifie son identité avec ce qui suffit (un échange depuis son
              adresse de l&apos;école, par exemple) : pas de pièce d&apos;identité quand ce n&apos;est pas nécessaire.
            </p>
            <Field label="Adresse e-mail du compte">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="email" name="email" required autoComplete="off" />}
            </Field>
            <Field label="Demande">
              {({ id, describedBy }) => (
                <Select id={id} aria-describedby={describedBy} name="kind" required>
                  {REQUEST_KINDS.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Reçue le">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="received_on" required />}
            </Field>
            <Field label="Comment l'identité sera vérifiée">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="identity_note" required maxLength={500} />}
            </Field>
            <Field label="Précisions" optional>
              {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="details" rows={3} maxLength={2000} />}
            </Field>
          </ActionForm>
        </div>
      </Disclosure>
    </ManageSection>
  );
}

function IncidentAssessment({ incident }: { incident: PrivacyQueue["incidents"][number] }) {
  const aware = incident.aware_at ? new Date(incident.aware_at) : null;
  const local = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
          .format(d)
          .replace(" ", "T")
      : undefined;
  return (
    <ActionForm action={assessPrivacyIncident} hidden={{ incident_id: incident.id }} submitLabel="Enregistrer l'évaluation" variant="secondary" size="sm">
      <Field label="Des données personnelles sont-elles touchées ?">
        {({ id, describedBy }) => (
          <Select id={id} aria-describedby={describedBy} name="personal_data" defaultValue={incident.personal_data}>
            <option value="unknown">À déterminer</option>
            <option value="yes">Oui</option>
            <option value="no">Non</option>
          </Select>
        )}
      </Field>
      <Field label="Découvert le (heure de Paris)" hint="Le délai de 72 heures court depuis ce moment.">
        {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="datetime-local" name="aware_at" defaultValue={local(aware)} />}
      </Field>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 font-semibold">Données concernées</legend>
        {DATA_CATEGORIES.map((c) => (
          <Checkbox key={c.key} name="categories" value={c.key} label={c.label} />
        ))}
      </fieldset>
      <Field label="Nombre de personnes concernées (estimation)" optional>
        {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="number" min={0} name="affected_estimate" />}
      </Field>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 font-semibold">Atteinte</legend>
        <Checkbox name="impact" value="confidentiality" label="Confidentialité (données vues par qui ne devait pas)" />
        <Checkbox name="impact" value="integrity" label="Intégrité (données modifiées)" />
        <Checkbox name="impact" value="availability" label="Disponibilité (données perdues ou inaccessibles)" />
      </fieldset>
      <Field label="Risque pour les personnes">
        {({ id, describedBy }) => (
          <Select id={id} aria-describedby={describedBy} name="risk" defaultValue={incident.risk}>
            {Object.entries(INCIDENT_RISK).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Notification à la CNIL" hint="La décision appartient au responsable du traitement ; le site n'envoie rien lui-même.">
        {({ id, describedBy }) => (
          <Select id={id} aria-describedby={describedBy} name="authority_decision" defaultValue={incident.authority_decision}>
            {Object.entries(AUTHORITY_DECISION).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Notifiée le (si faite)" optional>
        {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="datetime-local" name="authority_notified_at" />}
      </Field>
      <Field label="Information des personnes">
        {({ id, describedBy }) => (
          <Select id={id} aria-describedby={describedBy} name="individuals_decision" defaultValue={incident.individuals_decision}>
            {Object.entries(INDIVIDUALS_DECISION).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Informées le (si fait)" optional>
        {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="datetime-local" name="individuals_informed_at" />}
      </Field>
      <Field label="Analyse et motifs" hint="Obligatoire pour toute décision. Jamais les données exposées elles-mêmes, jamais un mot de passe.">
        {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="note" rows={4} maxLength={4000} />}
      </Field>
    </ActionForm>
  );
}

export function IncidentsSection({ queue }: { queue: PrivacyQueue }) {
  return (
    <ManageSection
      title="Incidents de données"
      count={queue.incidents.filter((i) => i.pending_decision).length}
      description="Une violation de données personnelles se notifie à la CNIL dans les 72 heures quand elle présente un risque pour les personnes, et aux personnes quand ce risque est élevé. Le site trace les faits et les décisions ; la notification se fait par le responsable (cnil.fr)."
    >
      {queue.incidents.length === 0 ? (
        <p className="type-small text-muted">Aucun incident enregistré.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {queue.incidents.map((i) => (
            <li key={i.id} className="flex flex-col gap-3 rounded-md border border-line bg-raised p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{i.title}</span>
                <StatusBadge tone={i.pending_decision ? "danger" : "neutral"}>
                  {i.pending_decision ? "Décision de notification en attente" : AUTHORITY_DECISION[i.authority_decision]}
                </StatusBadge>
              </div>
              <p className="type-small text-muted">
                Détecté {when(i.detected_at)}
                {i.aware_at && i.authority_deadline && (
                  <>
                    {" "}
                    · découvert {when(i.aware_at)} · 72 heures le <strong className="text-fg">{when(i.authority_deadline)}</strong>
                  </>
                )}
                {" · "}
                {INCIDENT_RISK[i.risk]}
              </p>
              <Disclosure summary="Évaluer et décider" icon="edit">
                <div className="px-3.5 pb-3.5">
                  <IncidentAssessment incident={i} />
                </div>
              </Disclosure>
            </li>
          ))}
        </ul>
      )}
      <Disclosure summary="Ouvrir un incident de données" icon="alert" className="mt-4">
        <div className="px-3.5 pb-3.5">
          <ActionForm action={openPrivacyIncident} submitLabel="Ouvrir l'incident" variant="secondary" size="sm" resetOnDone>
            <Field label="Titre">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="title" required maxLength={140} />}
            </Field>
            <Field label="Ce qui s'est passé" hint="Les faits, sans recopier les données concernées." optional>
              {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="impact" rows={3} maxLength={500} />}
            </Field>
            <Field label="Découvert le (heure de Paris)">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="datetime-local" name="aware_at" required />}
            </Field>
          </ActionForm>
        </div>
      </Disclosure>
    </ManageSection>
  );
}

export function HoldsSection({ queue }: { queue: PrivacyQueue }) {
  return (
    <ManageSection
      title="Conservations exceptionnelles"
      count={queue.holds.length}
      description="Une exception à l'effacement (un litige, une réclamation), avec son objet, sa base, qui l'a décidée et une date de revue dans l'année. Passé cette date, elle ne s'applique plus."
    >
      {queue.holds.length === 0 ? (
        <p className="type-small text-muted">Aucune.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {queue.holds.map((h) => (
            <li key={h.id} className="flex flex-col gap-2 rounded-md border border-line bg-raised p-4 type-small">
              <p>
                <span className="font-semibold">{HOLD_SCOPE[h.scope] ?? h.scope}</span>
                <span className="font-mono text-subtle"> · {h.subject_id}</span>
              </p>
              <p>{h.purpose}</p>
              <p className="text-muted">
                Base : {h.legal_basis} · décidée par {h.decided_by} · revue le {formatDateLong(`${h.review_on}T12:00:00Z`)}
                {h.lapsed && " · échue (ne s'applique plus)"}
              </p>
              <Disclosure summary="Lever">
                <div className="px-3.5 pb-3.5">
                  <ActionForm action={releaseRetentionHold} hidden={{ hold_id: h.id }} submitLabel="Lever la conservation" variant="secondary" size="sm">
                    <Field label="Raison">
                      {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="reason" required maxLength={500} />}
                    </Field>
                  </ActionForm>
                </div>
              </Disclosure>
            </li>
          ))}
        </ul>
      )}
      <Disclosure summary="Placer une conservation exceptionnelle" icon="lock" className="mt-4">
        <div className="px-3.5 pb-3.5">
          <ActionForm action={placeRetentionHold} submitLabel="Enregistrer" variant="secondary" size="sm" resetOnDone>
            <Field label="Portée">
              {({ id, describedBy }) => (
                <Select id={id} aria-describedby={describedBy} name="scope" required>
                  {Object.entries(HOLD_SCOPE).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Identifiant (compte, candidature, recrutement, événement ou asso)" hint="Copié depuis la page concernée.">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="subject_id" required spellCheck={false} />}
            </Field>
            <Field label="Objet (pourquoi garder)">
              {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="purpose" rows={2} required maxLength={500} />}
            </Field>
            <Field label="Base (obligation, droit en justice…)">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="legal_basis" required maxLength={500} />}
            </Field>
            <Field label="Décidée par">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="decided_by" required maxLength={200} />}
            </Field>
            <Field label="Date de revue (dans l'année)">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="review_on" required />}
            </Field>
          </ActionForm>
        </div>
      </Disclosure>
    </ManageSection>
  );
}

export function NoticeApproval({ current }: { current: { version: string; effective_at: string } | null }) {
  return (
    <ManageSection
      title="Notice de confidentialité"
      description={
        current
          ? `Version en vigueur : ${current.version} (depuis le ${formatDateLong(current.effective_at)}).`
          : "Aucune version approuvée : la page Confidentialité montre le projet, présenté comme tel."
      }
    >
      <Disclosure summary="Enregistrer l'approbation du texte actuel" icon="check">
        <div className="px-3.5 pb-3.5">
          <ActionForm action={recordPrivacyNoticeApproval} submitLabel="Enregistrer l'approbation" variant="secondary" size="sm">
            <p className="type-small text-muted">
              Le texte enregistré est exactement celui de la page Confidentialité (projet {DRAFT_VERSION}). Ne l&apos;enregistre qu&apos;après
              son approbation par le responsable du traitement, une fois les points en attente complétés dans le texte.
            </p>
            <Field label="Numéro de version">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="version" defaultValue={DRAFT_VERSION} required maxLength={40} />}
            </Field>
            <Field label="Approuvée par (instance, fonction)">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="approved_by" required maxLength={200} />}
            </Field>
            <Field label="Référence de la décision" optional>
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="reference" maxLength={300} />}
            </Field>
            <Field label="Approuvée le">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="approved_on" required />}
            </Field>
            <Field label="En vigueur à partir du">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="effective_on" required />}
            </Field>
          </ActionForm>
        </div>
      </Disclosure>
    </ManageSection>
  );
}

export function ReconcileSection() {
  return (
    <ManageSection
      title="Après une restauration"
      description="Une sauvegarde restaurée peut ramener des données effacées depuis. Avant de rouvrir le site, refais ces effacements : le site les retrouve avec une clé à sens unique, sans garder ce qui a été effacé."
    >
      <ActionForm action={reconcileErasures} submitLabel="Refaire les effacements" variant="secondary" size="sm" />
    </ManageSection>
  );
}
