import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { formatDayShort, plural } from "@/lib/format";
import { toDateInput } from "@/lib/governance/labels";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { getCommittee } from "@/lib/recruitment/review-data";
import {
  APPROVAL_POLICY_LABEL,
  POWER_LABEL,
  ROLE_PRESETS,
  SCOPE_LABEL,
  TEMPLATE_KINDS,
  TEMPLATE_LABEL,
  type ApprovalPolicy,
  type CommitteeBoard,
} from "@/lib/recruitment/review";
import {
  appointMember,
  createTag,
  deleteTag,
  discardRubric,
  publishRubric,
  resolveConflict,
  revokeMember,
  setReviewPolicy,
  updateMember,
} from "@/app/actions/recruitment-review";
import { transferReviews } from "@/app/actions/continuity";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ManageSection } from "@/components/manage/ManagePageHeader";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { MfaNotice, Notice, ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { readOnlyReason } from "@/components/manage/content/desk";
import { loadReviewFrame, ReviewDenied, ReviewHeader, ReviewUnavailable } from "@/components/manage/review/ReviewFrame";
import { PowerPicker, RubricEditor, ScopePicker, TemplateEditor } from "@/components/manage/review/CommitteeForms";
import { at } from "@/components/manage/review/ApplicationPanels";

type Params = Promise<{ asso: string; campaign: string }>;

export const metadata: Metadata = { title: "Comité de recrutement" };

/** At most 18 months from today (the database's limit for an appointment). */
function maxEnd(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 18);
  return toDateInput(d);
}

/**
 * /manage/[asso]/recruitment/[campaign]/comite — who reads and decides in
 * this recruitment. Appointments are named, limited in time and in scope,
 * and never more than the appointer's own powers; the people who read
 * through their position in the association (its keys) are listed too, for
 * the record. The grids, the rules, the message models, the labels, the
 * declared conflicts and who opened what are managed here by whoever holds
 * the "committee" power.
 */
export default async function CommitteePage({ params }: { params: Params }) {
  const { asso, campaign } = await params;
  const frame = await loadReviewFrame(asso, campaign, "comite");
  if (!frame.ok) return frame.node;
  const { ctx, access, campaignId, has } = frame;
  if (!has("view")) return <ReviewDenied asso={asso} access={access} what="La composition du comité" />;
  const result = await getCommittee(campaignId);
  if (!result.ok) return <ReviewUnavailable asso={asso} message={governanceErrorMessage(result.code)} />;
  const b = result.data;
  const readOnly = readOnlyReason(ctx);
  const writable = !readOnly && !access.archived;
  const manage = has("committee") && writable;
  const aal2 = ctx.aal === "aal2";
  const live = b.members.filter((m) => m.live);
  const ended = b.members.filter((m) => !m.live);
  const sample = {
    prenom: "[prénom]",
    association: b.organization.short_name ?? b.organization.name,
    recrutement: b.campaign.title,
    poste: b.positions[0]?.title ?? "le poste",
    reference: "[référence]",
  };

  return (
    <div className="flex flex-col gap-10">
      <ReviewHeader
        asso={asso}
        access={access}
        description={
          <p>
            Les personnes nommées pour ce recrutement, ce qu&apos;elles peuvent faire et jusqu&apos;à quand. Une nomination ne donne
            aucun droit ailleurs dans l&apos;asso, et elle s&apos;arrête seule à sa date de fin.
          </p>
        }
      />
      <div className="flex flex-col gap-3 empty:hidden">
        {readOnly && <ReadOnlyNotice reason={readOnly} />}
        {manage && !aal2 && <MfaNotice what="Nommer des personnes, modifier une nomination ou les règles de validation" />}
        {b.campaign.sealed && (
          <Notice tone="info" icon="lock" title="Recrutement clos pour l'équipe">
            <p>
              Depuis le {b.campaign.sealed_at ? formatDayShort(b.campaign.sealed_at) : "—"}, seules les personnes qui avaient les droits à
              ce moment gardent l&apos;accès : une équipe élue plus tard ne lit pas les candidatures d&apos;une année précédente.
            </p>
          </Notice>
        )}
      </div>

      <ManageSection title="Comité" count={live.length}>
        {live.length === 0 ? (
          <ManageEmpty icon="users" title="Personne n'est nommé pour l'instant">
            <p>
              Sans nomination, seuls les postes de l&apos;asso qui en ont le droit lisent les candidatures (ci-dessous). Nomme des
              personnes pour évaluer, faire passer les entretiens ou décider, avec un périmètre et une date de fin.
            </p>
          </ManageEmpty>
        ) : (
          <MemberList members={live} b={b} manage={manage} />
        )}
        {manage && (
          <Disclosure summary="Nommer quelqu'un" icon="plus" tone="primary">
            {(b.eligible ?? []).length === 0 ? (
              <p className="type-small text-muted">Tous les membres actifs de l&apos;asso sont déjà nommés.</p>
            ) : (
              <ActionForm action={appointMember} hidden={{ campaign_id: campaignId }} submitLabel="Nommer" className="max-w-2xl">
                <Field label="Qui" hint="Un membre actif de l'asso. Une personne qui candidate à ce recrutement ne peut pas être nommée.">
                  {({ id, describedBy }) => (
                    <Select id={id} aria-describedby={describedBy} name="membership_id" required defaultValue="">
                      <option value="" disabled>
                        Choisir…
                      </option>
                      {(b.eligible ?? []).map((e) => (
                        <option key={e.membership_id} value={e.membership_id} disabled={e.candidate}>
                          {e.name}
                          {e.positions.length ? ` (${e.positions.join(", ")})` : ""}
                          {e.candidate ? " · candidate" : ""}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <PowerPicker mine={b.powers} />
                <ScopePicker positions={b.positions} />
                <Field label="Jusqu'au" hint="18 mois au plus. La nomination s'arrête seule à cette date.">
                  {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="ends_on" min={toDateInput(new Date())} max={maxEnd()} required />}
                </Field>
                <Field label="Pourquoi" optional hint="Pour l'historique : « évaluer les candidatures du pôle communication ».">
                  {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="purpose" maxLength={200} />}
                </Field>
              </ActionForm>
            )}
          </Disclosure>
        )}
        {ended.length > 0 && (
          <details className="type-small">
            <summary className="cursor-pointer font-semibold">Nominations terminées ({ended.length})</summary>
            <ul className="mt-2 flex flex-col gap-1">
              {ended.map((m) => (
                <li key={m.id} className="text-muted">
                  {m.name} · {ROLE_PRESETS[m.role].label} · {m.revoked_at ? `terminée le ${formatDayShort(m.revoked_at)}` : `jusqu'au ${formatDayShort(m.ends_at)}`}
                  {m.revoke_reason ? ` : ${m.revoke_reason}` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
      </ManageSection>

      <ManageSection
        title="Par leur poste dans l'asso"
        count={b.by_position.length}
        description="Ces personnes lisent les candidatures parce que leur poste en a le droit (« Postes et droits »), sans nomination. Aucune autre asso, ni le BDE, n'y a accès."
      >
        {b.by_position.length === 0 ? (
          <p className="type-small text-muted">Aucun poste de l&apos;asso ne donne accès aux candidatures.</p>
        ) : (
          <ul className="flex flex-col border-y border-line">
            {b.by_position.map((p) => (
              <li key={p.name} className="flex flex-col gap-0.5 border-b border-line py-2.5 type-small last:border-b-0">
                <span>
                  <span className="font-semibold">{p.name}</span>
                  <span className="text-muted"> · {p.positions.join(", ")}</span>
                  {p.candidate && <span className="text-warn"> · candidate à ce recrutement : aucun accès</span>}
                </span>
                <span className="text-muted">{p.powers.map((k) => POWER_LABEL[k]).join(" · ")}</span>
              </li>
            ))}
          </ul>
        )}
      </ManageSection>

      <ManageSection title="Règles">
        {manage ? (
          <ActionForm action={setReviewPolicy} hidden={{ campaign_id: campaignId }} submitLabel="Enregistrer les règles" className="max-w-2xl">
            <Field label="Évaluations demandées par candidature" hint="Avant de valider une décision. Valider avec moins demande une raison, gardée dans l'historique.">
              {({ id, describedBy }) => (
                <Select id={id} aria-describedby={describedBy} name="required_reviews" defaultValue={String(b.campaign.required_reviews)}>
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n === 0 ? "Aucune" : n}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Validation des décisions" hint={b.president_name ? `Présidence actuelle : ${b.president_name}.` : "L'asso n'a pas de présidence en poste : la troisième option ne pourra pas aboutir."}>
              {({ id, describedBy }) => (
                <Select id={id} aria-describedby={describedBy} name="approval_policy" defaultValue={b.campaign.approval_policy}>
                  {(Object.keys(APPROVAL_POLICY_LABEL) as ApprovalPolicy[]).map((p) => (
                    <option key={p} value={p}>
                      {APPROVAL_POLICY_LABEL[p]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </ActionForm>
        ) : (
          <dl className="grid gap-x-8 gap-y-2 type-small sm:grid-cols-[auto_minmax(0,1fr)]">
            <dt className="text-muted">Évaluations demandées</dt>
            <dd className="font-semibold">{b.campaign.required_reviews}</dd>
            <dt className="text-muted">Validation</dt>
            <dd className="font-semibold">{APPROVAL_POLICY_LABEL[b.campaign.approval_policy]}</dd>
          </dl>
        )}
      </ManageSection>

      {(["application", "interview"] as const).map((kind) => {
        const r = b.rubrics[kind];
        return (
          <ManageSection
            key={kind}
            title={kind === "application" ? "Grille d'évaluation des candidatures" : "Grille d'évaluation des entretiens"}
            description="Une note par critère, pondérée : le total aide à comparer, il ne décide rien. Une grille publiée ne change plus ; une nouvelle version s'applique aux évaluations suivantes."
          >
            {r.live ? (
              <div className="flex flex-col gap-2 rounded-md border border-line bg-raised p-4">
                <p className="font-bold">
                  Version {r.live.number}, publiée le {formatDayShort(r.live.published_at)}
                  <span className="font-normal text-muted"> · {plural(r.live.reviews, "évaluation faite", "évaluations faites")} avec</span>
                </p>
                <ul className="flex flex-col gap-1 type-small">
                  {r.live.criteria.map((c) => (
                    <li key={c.id}>
                      <span className="font-semibold">{c.label}</span>
                      <span className="text-muted">
                        {" "}
                        · sur {c.max}
                        {c.weight > 1 ? ` · poids ${c.weight}` : ""}
                        {c.required ? "" : " · facultatif"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="type-small text-muted">Pas de grille publiée : les évaluations se font avec un avis et un commentaire.</p>
            )}
            {manage && (
              <Disclosure summary={r.draft ? `Brouillon de la version ${r.draft.number}` : r.live ? "Préparer une nouvelle version" : "Créer la grille"} icon="edit" open={Boolean(r.draft)}>
                <div className="flex flex-col gap-4">
                  <RubricEditor
                    campaignId={campaignId}
                    kind={kind}
                    criteria={r.draft?.criteria ?? r.live?.criteria ?? null}
                    editVersion={r.draft?.edit_version ?? null}
                  />
                  {r.draft && (
                    <div className="flex flex-wrap gap-3 border-t border-line pt-4">
                      <ActionForm action={publishRubric} hidden={{ campaign_id: campaignId, kind }} submitLabel="Publier cette version" size="sm" inline />
                      <ActionForm action={discardRubric} hidden={{ campaign_id: campaignId, kind }} submitLabel="Abandonner le brouillon" variant="ghost" size="sm" inline />
                    </div>
                  )}
                </div>
              </Disclosure>
            )}
          </ManageSection>
        );
      })}

      <ManageSection title="Messages types" description="Ajoutés aux messages que le site envoie aux candidat·es. Jamais de note, de commentaire ni de nom de l'équipe : seulement les mots autorisés.">
        <div className="flex flex-col gap-2">
          {TEMPLATE_KINDS.map((k) => (
            <Disclosure key={k} summary={`${TEMPLATE_LABEL[k]}${b.templates[k] ? "" : " (message standard)"}`} icon="mail">
              {manage ? (
                <TemplateEditor campaignId={campaignId} kind={k} body={b.templates[k] ?? ""} sample={sample} />
              ) : (
                <p className="whitespace-pre-line type-small">{b.templates[k] ?? "Le message standard du site."}</p>
              )}
            </Disclosure>
          ))}
        </div>
      </ManageSection>

      <ManageSection title="Étiquettes" count={b.tags.length} description="Pour trier les candidatures entre vous (« à revoir », « bilingue »…). Jamais visibles de la personne.">
        {b.tags.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {b.tags.map((t) => (
              <li key={t.id} className="flex items-center gap-1.5 rounded-xs bg-sunken px-2 py-1 type-small">
                {t.label}
                <span className="text-subtle">({t.used})</span>
                {manage && <ActionForm action={deleteTag} hidden={{ tag_id: t.id }} submitLabel="Supprimer" variant="ghost" size="sm" inline />}
              </li>
            ))}
          </ul>
        )}
        {manage && (
          <ActionForm action={createTag} hidden={{ campaign_id: campaignId }} submitLabel="Ajouter" size="sm" resetOnDone className="max-w-sm">
            <Field label="Nouvelle étiquette" hint="40 caractères au plus.">
              {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="label" maxLength={40} required />}
            </Field>
          </ActionForm>
        )}
      </ManageSection>

      {b.conflicts !== null && (
        <ManageSection title="Conflits d'intérêts déclarés" count={b.conflicts.length}>
          {b.conflicts.length === 0 ? (
            <p className="type-small text-muted">Aucun.</p>
          ) : (
            <ul className="flex flex-col border-y border-line">
              {b.conflicts.map((x) => (
                <li key={x.id} className="flex flex-col gap-1.5 border-b border-line py-3 type-small last:border-b-0">
                  <span>
                    <span className="font-semibold">{x.name}</span> · candidature{" "}
                    <Link href={routes.manageApplication(asso, campaignId, x.application_id)} className="underline underline-offset-2">
                      {x.reference}
                    </Link>{" "}
                    · {at(x.declared_at)}{" "}
                    <StatusBadge tone={x.status === "open" ? "warn" : "neutral"}>
                      {x.status === "open" ? "À régler" : x.status === "reassigned" ? "Écarté·e" : "Levé"}
                    </StatusBadge>
                  </span>
                  {x.note && <span className="text-muted">{x.note}</span>}
                  {x.resolution && <span className="text-muted">Décision : {x.resolution}</span>}
                  {x.status === "open" && manage && (
                    <Disclosure summary="Régler" icon="shield" className="max-w-xl">
                      <ActionForm action={resolveConflict} hidden={{ conflict_id: x.id }} submitLabel="Enregistrer">
                        <Field label="Décision">
                          {({ id, describedBy }) => (
                            <Select id={id} aria-describedby={describedBy} name="resolution" defaultValue="reassigned">
                              <option value="reassigned">La personne reste à l&apos;écart de cette candidature</option>
                              <option value="cleared">Pas de conflit réel : elle retrouve l&apos;accès</option>
                            </Select>
                          )}
                        </Field>
                        <Field label="Raison">
                          {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="reason" rows={2} maxLength={500} required minLength={3} />}
                        </Field>
                      </ActionForm>
                    </Disclosure>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ManageSection>
      )}

      {b.access !== null && (
        <ManageSection title="Qui a ouvert quoi" count={b.access.length} description="Les 100 dernières ouvertures de candidatures et de fichiers dans ce recrutement.">
          {b.access.length === 0 ? (
            <p className="type-small text-muted">Aucune ouverture pour l&apos;instant.</p>
          ) : (
            <ol className="flex flex-col gap-1 type-small">
              {b.access.map((l, i) => (
                <li key={`${l.at}-${i}`} className="text-muted">
                  <span className="font-semibold text-fg">{l.actor_name}</span> ·{" "}
                  {l.action === "document_opened" ? `a ouvert « ${l.file_name ?? "un fichier"} » de` : "a ouvert"}{" "}
                  <Link href={routes.manageApplication(asso, campaignId, l.application_id)} className="underline underline-offset-2">
                    {l.reference}
                  </Link>{" "}
                  · {at(l.at)}
                </li>
              ))}
            </ol>
          )}
        </ManageSection>
      )}
    </div>
  );
}

function MemberList({ members, b, manage }: { members: CommitteeBoard["members"]; b: CommitteeBoard; manage: boolean }) {
  const titles = new Map(b.positions.map((p) => [p.id, p.title]));
  const reviewersBesides = (id: string) => members.filter((o) => o.id !== id && o.live && !o.candidate && o.powers.includes("review"));
  return (
    <ul className="flex flex-col border-y border-line">
      {members.map((m) => (
        <li key={m.id} className="grid gap-x-6 gap-y-2 border-b border-line py-3.5 last:border-b-0 md:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-bold">
                {m.name}
                {m.me ? " (toi)" : ""}
              </span>
              <StatusBadge tone="neutral">{ROLE_PRESETS[m.role].label}</StatusBadge>
              {m.candidate && <StatusBadge tone="warn">Candidate : accès suspendu</StatusBadge>}
            </span>
            <span className="type-small text-muted">
              {m.scope === "positions" ? m.positions.map((p) => titles.get(p) ?? "poste").join(", ") : SCOPE_LABEL[m.scope]} · jusqu&apos;au{" "}
              {formatDayShort(m.ends_at)}
              {m.appointed_by_name ? ` · nommée par ${m.appointed_by_name}` : ""}
            </span>
            <span className="type-small">{m.powers.map((p) => POWER_LABEL[p]).join(" · ")}</span>
            {m.purpose && <span className="type-small text-muted">« {m.purpose} »</span>}
            <span className="type-meta text-subtle">
              {m.assigned} confiée{m.assigned > 1 ? "s" : ""} · {m.reviewed} évaluée{m.reviewed > 1 ? "s" : ""}
            </span>
          </div>
          {manage && !m.me && (
            <div className="flex flex-col gap-2">
              <Disclosure summary="Modifier" icon="edit">
                <ActionForm action={updateMember} hidden={{ member_id: m.id }} submitLabel="Enregistrer">
                  <PowerPicker role={m.role} powers={m.powers} mine={b.powers} />
                  <ScopePicker scope={m.scope} positions={b.positions} chosen={m.positions} />
                  <Field label="Jusqu'au">
                    {({ id, describedBy }) => (
                      <Input id={id} aria-describedby={describedBy} type="date" name="ends_on" defaultValue={toDateInput(new Date(m.ends_at))} max={maxEnd()} required />
                    )}
                  </Field>
                </ActionForm>
              </Disclosure>
              {m.live && m.assigned > m.reviewed && reviewersBesides(m.id).length > 0 && (
                // Phase 11: hand the pending reviews (and upcoming interviews) to another reviewer, with a reason.
                <Disclosure summary="Confier ses évaluations" icon="users">
                  <ActionForm
                    action={transferReviews}
                    hidden={{ campaign_id: b.campaign.id, from_member: m.id, slug: b.organization.slug }}
                    submitLabel="Confier"
                  >
                    <p className="type-small text-muted">
                      Les candidatures que {m.name} n&apos;a pas encore évaluées passent à la personne choisie, avec les mêmes contrôles
                      (périmètre, conflits déclarés)
                      {b.powers.includes("interviews") ? ", ainsi que ses entretiens à venir" : ""}. Ses évaluations déjà envoyées restent
                      les siennes.
                    </p>
                    <Field label="À">
                      {({ id, describedBy }) => (
                        <Select id={id} aria-describedby={describedBy} name="to_member" required>
                          {reviewersBesides(m.id).map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.name}
                            </option>
                          ))}
                        </Select>
                      )}
                    </Field>
                    <Field label="Raison" hint="Gardée dans l'historique.">
                      {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="reason" rows={2} required minLength={3} maxLength={500} />}
                    </Field>
                  </ActionForm>
                </Disclosure>
              )}
              <Disclosure summary="Mettre fin à la nomination" icon="close" tone="danger">
                <ActionForm action={revokeMember} hidden={{ member_id: m.id }} submitLabel="Mettre fin" variant="danger">
                  <Field label="Raison" optional>
                    {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="reason" rows={2} maxLength={500} />}
                  </Field>
                </ActionForm>
              </Disclosure>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
