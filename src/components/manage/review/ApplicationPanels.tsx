import type { ReactNode } from "react";
import { routes } from "@/lib/routes";
import { formatDayShort, formatTime, plural } from "@/lib/format";
import { answerText, isDocumentQuestion } from "@/lib/recruitment/form";
import { sizeLabel } from "@/lib/recruitment/documents";
import {
  DECISION_STATUS_LABEL,
  INTERVIEW_STATUS_LABEL,
  MODE_LABEL,
  OFFER_STATUS_LABEL,
  OUTCOME_LABEL,
  OUTCOME_SHORT,
  RECOMMENDATION_LABEL,
  activityLine,
  percentLabel,
  totalBasis,
  type ApplicationDetail,
  type DecisionPayload,
  type ReviewPayload,
} from "@/lib/recruitment/review";
import {
  approveDecision,
  cancelClarification,
  cancelDecision,
  cancelInterview,
  completeInterview,
  declareConflict,
  extendClarification,
  inviteToInterview,
  moveApplications,
  postComment,
  proposeDecision,
  releaseDecisions,
  requestClarification,
  rescheduleInterview,
  resolveConflict,
  retractComment,
  returnDecision,
  setApplicationTag,
  setDecisionMessage,
  startOnboarding,
  unassignReview,
  withdrawOffer,
} from "@/app/actions/recruitment-review";
import { Icon } from "@/components/ui/Icon";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { StatusBadge, type StatusTone } from "@/components/ui/StatusBadge";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { ReviewForm } from "./ReviewForm";

export const at = (iso: string) => `${formatDayShort(iso)} à ${formatTime(iso)}`;

/** A block of the application page: a ruled h2 and its content. */
export function Panel({ id, title, aside, children }: { id: string; title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b-2 border-fg pb-2">
        <h2 id={id} className="type-button text-[0.95rem]">
          {title}
        </h2>
        {aside && <div className="type-meta text-subtle">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

function DateTimeFields({ prefix, dateLabel, optional, hint }: { prefix: string; dateLabel: string; optional?: boolean; hint?: string }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={dateLabel} optional={optional}>
        {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name={`${prefix}_date`} required={!optional} />}
      </Field>
      <Field label="à" hint={hint ?? "Heure de Paris."}>
        {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="time" name={`${prefix}_time`} defaultValue="18:00" />}
      </Field>
    </div>
  );
}

function Reason({ label = "Raison", hint, optional }: { label?: string; hint?: string; optional?: boolean }) {
  return (
    <Field label={label} optional={optional} hint={hint}>
      {({ id, describedBy }) => (
        <Textarea id={id} aria-describedby={describedBy} name="reason" rows={2} maxLength={500} required={!optional} minLength={optional ? undefined : 3} />
      )}
    </Field>
  );
}

// ---- What the candidate sent ------------------------------------------------------------------------

export function AnswersPanel({ d }: { d: ApplicationDetail }) {
  if (!d.form || !d.answers) {
    return (
      <Panel id="reponses" title="Réponses">
        <p className="type-small text-muted">
          La personne a retiré sa candidature : ses réponses et ses fichiers ne sont plus consultables. L&apos;historique reste.
        </p>
      </Panel>
    );
  }
  const form = d.form;
  const groups = [
    ...form.sections.map((s) => ({ title: s.title, questions: form.questions.filter((q) => q.scope === "shared" && q.section === s.id) })),
    { title: "Pour ce poste", questions: form.questions.filter((q) => q.scope === d.position.id) },
  ].filter((g) => g.questions.length > 0);
  return (
    <Panel id="reponses" title="Réponses" aside={`Formulaire version ${d.application.form_version}, tel que rempli`}>
      {groups.map((g) => (
        <div key={g.title} className="flex flex-col gap-1">
          <h3 className="type-label text-muted">{g.title}</h3>
          <dl className="flex flex-col">
            {g.questions.map((q) => (
              <div key={q.id} className="flex flex-col gap-2 border-t border-line py-4">
                <dt className="font-bold leading-snug">{q.label}</dt>
                <dd className="max-w-[68ch] whitespace-pre-line border-l-2 border-assoc pl-4 leading-relaxed">
                  {isDocumentQuestion(q) ? (
                    d.documents === null ? (
                      <span className="text-muted">
                        {plural(d.document_count, "fichier joint", "fichiers joints")} : leur ouverture n&apos;est pas dans ta nomination.
                      </span>
                    ) : (
                      <DocumentLinks documents={d.documents.filter((x) => x.question_id === q.id)} />
                    )
                  ) : (
                    answerText(q, d.answers?.[q.id]) || <span className="text-muted">Pas de réponse</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </Panel>
  );
}

export function DocumentLinks({ documents }: { documents: { id: string; file_name: string; size_bytes: number }[] }) {
  if (documents.length === 0) return <span className="text-muted">Aucun fichier</span>;
  return (
    <ul className="flex flex-col gap-1.5">
      {documents.map((x) => (
        <li key={x.id}>
          <a href={routes.recruitmentDocument(x.id)} className="inline-flex items-center gap-2 font-semibold hover:underline" download>
            <Icon name="file" size={18} className="shrink-0 text-assoc-text" />
            {x.file_name}
            <span className="type-meta font-normal text-muted">{sizeLabel(x.size_bytes)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

// ---- Questions after submission ---------------------------------------------------------------------

const CLARIFICATION_STATUS: Record<string, { label: string; tone: StatusTone }> = {
  open: { label: "En attente de réponse", tone: "warn" },
  closed: { label: "Délai dépassé, sans réponse", tone: "neutral" },
  answered: { label: "Répondue", tone: "ok" },
  cancelled: { label: "Retirée", tone: "neutral" },
};

export function ClarificationsPanel({ d, writable }: { d: ApplicationDetail; writable: boolean }) {
  const open = d.clarifications.some((q) => q.status === "open");
  const canAsk = d.can.shortlist && writable && d.application.status === "submitted";
  if (d.clarifications.length === 0 && !canAsk) return null;
  return (
    <Panel id="questions" title="Questions à la personne" aside={d.clarifications.length ? plural(d.clarifications.length, "question") : undefined}>
      {d.clarifications.length > 0 && (
        <ol className="flex flex-col gap-4">
          {d.clarifications.map((q) => {
            const s = CLARIFICATION_STATUS[q.status];
            return (
              <li key={q.id} className="flex flex-col gap-2 rounded-md border border-line bg-raised p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                  <span className="type-meta text-subtle">
                    Posée {at(q.asked_at)}
                    {q.asked_by_name ? ` par ${q.asked_by_name}` : ""}
                    {q.due_at ? ` · réponse avant le ${at(q.due_at)}` : ""}
                  </span>
                </div>
                <p className="whitespace-pre-line font-semibold">{q.question}</p>
                {q.answer && (
                  <div className="border-l-2 border-assoc pl-4">
                    <p className="whitespace-pre-line">{q.answer}</p>
                    {q.answered_at && <p className="type-meta text-subtle">Répondu {at(q.answered_at)}</p>}
                  </div>
                )}
                {q.documents && q.documents.length > 0 && <DocumentLinks documents={q.documents} />}
                {q.documents === null && q.allows_documents && q.status === "answered" && (
                  <p className="type-small text-muted">Des fichiers ont pu être joints : leur ouverture n&apos;est pas dans ta nomination.</p>
                )}
                {q.extensions.length > 0 && (
                  <p className="type-small text-muted">
                    Délai prolongé {plural(q.extensions.length, "fois", "fois")} (date d&apos;origine :{" "}
                    {q.original_due_at ? at(q.original_due_at) : "aucune"}).
                  </p>
                )}
                {q.cancel_reason && <p className="type-small text-muted">Retirée : {q.cancel_reason}</p>}
                {d.can.shortlist && writable && (q.status === "open" || q.status === "closed") && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Disclosure summary="Prolonger le délai" icon="clock">
                      <ActionForm action={extendClarification} hidden={{ clarification_id: q.id }} submitLabel="Prolonger">
                        <DateTimeFields prefix="due" dateLabel="Nouvelle date limite" />
                        <Reason optional />
                      </ActionForm>
                    </Disclosure>
                    <Disclosure summary="Retirer la question" icon="close" tone="danger">
                      <ActionForm action={cancelClarification} hidden={{ clarification_id: q.id }} submitLabel="Retirer" variant="danger">
                        <Reason optional hint="La personne voit que la question a été retirée." />
                      </ActionForm>
                    </Disclosure>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {canAsk && !open && (
        <Disclosure summary="Poser une question à la personne" icon="edit" tone="primary">
          <ActionForm action={requestClarification} hidden={{ application_id: d.application.id }} submitLabel="Envoyer la question" resetOnDone>
            <p className="type-small text-muted">
              Une précision sur sa candidature. La réponse s&apos;ajoute à côté : ce qui a été envoyé ne change pas. Une seule question
              ouverte à la fois.
            </p>
            <Field label="La question" hint="2 000 caractères au plus.">
              {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="question" rows={3} maxLength={2000} required minLength={5} />}
            </Field>
            <DateTimeFields prefix="due" dateLabel="Réponse avant le" optional />
            <Checkbox name="allows_documents" value="1" label="La personne peut joindre des fichiers" description="PDF, Word, JPEG ou PNG, vérifiés à l'envoi." />
          </ActionForm>
        </Disclosure>
      )}
    </Panel>
  );
}

// ---- Interviews ----------------------------------------------------------------------------------------

export function InterviewsPanel({ d, writable }: { d: ApplicationDetail; writable: boolean }) {
  const live = d.interviews.find((i) => i.status === "invited" || i.status === "scheduled");
  const decided = d.decisions.some((x) => x.status === "finalized" || x.status === "released");
  const canInvite = d.can.interviews && writable && d.application.status === "submitted" && !live && !decided;
  if (d.interviews.length === 0 && !canInvite) return null;
  return (
    <Panel id="entretiens" title="Entretiens">
      {d.interviews.length > 0 && (
        <ol className="flex flex-col gap-4">
          {d.interviews.map((i) => (
            <li key={i.id} className="flex flex-col gap-2 rounded-md border border-line bg-raised p-4">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <StatusBadge tone={i.status === "scheduled" ? "info" : i.status === "invited" ? "warn" : i.status === "completed" ? "ok" : "neutral"}>
                  {INTERVIEW_STATUS_LABEL[i.status]}
                </StatusBadge>
                <span className="type-meta text-subtle">
                  Invitation {at(i.invited_at)}
                  {i.invited_by_name ? ` par ${i.invited_by_name}` : ""}
                  {i.respond_by && i.status === "invited" ? ` · créneau à choisir avant le ${at(i.respond_by)}` : ""}
                </span>
              </div>
              {i.slot && (
                <dl className="grid gap-x-6 gap-y-1 type-small sm:grid-cols-[auto_minmax(0,1fr)]">
                  <dt className="text-muted">Quand</dt>
                  <dd className="font-semibold">
                    {at(i.slot.starts_at)} – {formatTime(i.slot.ends_at)}
                  </dd>
                  <dt className="text-muted">Comment</dt>
                  <dd>
                    {MODE_LABEL[i.slot.mode]}
                    {i.slot.location ? ` · ${i.slot.location}` : ""}
                  </dd>
                  {i.slot.meeting_link && (
                    <>
                      <dt className="text-muted">Lien</dt>
                      <dd className="break-all">
                        <a href={i.slot.meeting_link} rel="noreferrer noopener" target="_blank" className="underline underline-offset-2">
                          {i.slot.meeting_link}
                        </a>
                      </dd>
                    </>
                  )}
                  <dt className="text-muted">Avec</dt>
                  <dd>{i.slot.interviewers.length ? i.slot.interviewers.join(", ") : "Personne de désigné"}</dd>
                </dl>
              )}
              {i.message && <p className="whitespace-pre-line type-small text-muted">Message : {i.message}</p>}
              {i.cancel_reason && <p className="type-small text-muted">Annulé : {i.cancel_reason}</p>}
              {d.can.interviews && writable && (i.status === "invited" || i.status === "scheduled") && (
                <div className="grid gap-2 sm:grid-cols-3">
                  {i.status === "scheduled" && (
                    <Disclosure summary="Noter comme passé" icon="check">
                      <ActionForm action={completeInterview} hidden={{ interview_id: i.id }} submitLabel="Enregistrer">
                        <Field label="Ce qui s'est passé">
                          {({ id, describedBy }) => (
                            <Select id={id} aria-describedby={describedBy} name="outcome" defaultValue="completed">
                              <option value="completed">L&apos;entretien a eu lieu</option>
                              <option value="no_show">La personne n&apos;est pas venue</option>
                            </Select>
                          )}
                        </Field>
                      </ActionForm>
                    </Disclosure>
                  )}
                  <Disclosure summary={i.status === "scheduled" ? "Déplacer" : "Réserver pour la personne"} icon="calendar">
                    <ActionForm action={rescheduleInterview} hidden={{ interview_id: i.id }} submitLabel="Enregistrer">
                      <Field label="Créneau" hint="Les créneaux libres de ce poste. Vide : la personne rechoisit elle-même.">
                        {({ id, describedBy }) => (
                          <Select id={id} aria-describedby={describedBy} name="slot_id" defaultValue="">
                            <option value="">Laisser la personne choisir</option>
                            {(d.free_slots ?? []).map((s) => (
                              <option key={s.id} value={s.id}>
                                {at(s.starts_at)} · {MODE_LABEL[s.mode]}
                                {s.location ? ` · ${s.location}` : ""}
                              </option>
                            ))}
                          </Select>
                        )}
                      </Field>
                      <Reason optional hint="Envoyée à la personne avec le changement." />
                    </ActionForm>
                  </Disclosure>
                  <Disclosure summary="Annuler l'entretien" icon="close" tone="danger">
                    <ActionForm action={cancelInterview} hidden={{ interview_id: i.id }} submitLabel="Annuler l'entretien" variant="danger">
                      <Reason hint="Envoyée à la personne." />
                    </ActionForm>
                  </Disclosure>
                </div>
              )}
              {i.can_assess && (i.status === "completed" || i.status === "scheduled") && (
                <Disclosure summary="Mon évaluation de l'entretien" icon="edit" tone="primary">
                  <InterviewAssessment d={d} interviewId={i.id} />
                </Disclosure>
              )}
            </li>
          ))}
        </ol>
      )}
      {canInvite && (
        <Disclosure summary="Inviter à un entretien" icon="calendar" tone="primary">
          <ActionForm action={inviteToInterview} hidden={{ application_ids: d.application.id }} submitLabel="Envoyer l'invitation">
            <p className="type-small text-muted">
              La personne choisit un créneau libre parmi ceux de l&apos;onglet Entretiens ({plural((d.free_slots ?? []).length, "créneau libre", "créneaux libres")}{" "}
              pour ce poste aujourd&apos;hui).
            </p>
            <Field label="Message" optional hint="1 000 caractères au plus.">
              {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="message" rows={3} maxLength={1000} />}
            </Field>
            <DateTimeFields prefix="respond_by" dateLabel="Créneau à choisir avant le" optional />
          </ActionForm>
        </Disclosure>
      )}
    </Panel>
  );
}

function InterviewAssessment({ d, interviewId }: { d: ApplicationDetail; interviewId: string }) {
  const mine = d.reviews.find((r) => r.mine && r.kind === "interview" && r.interview_id === interviewId);
  const rubric = Object.values(d.rubrics).find((v) => v.kind === "interview" && v.status === "published");
  if (mine?.status === "submitted") return <ReviewCard review={mine} d={d} />;
  return (
    <ReviewForm
      applicationId={d.application.id}
      interviewId={interviewId}
      criteria={rubric?.criteria ?? []}
      review={mine ? { id: mine.id, scores: mine.scores, recommendation: mine.recommendation, note: mine.note, version: mine.version } : null}
      mode="edit"
    />
  );
}

// ---- Reviews -------------------------------------------------------------------------------------------

export function ReviewCard({ review: r, d, amendable = false }: { review: ReviewPayload; d: ApplicationDetail; amendable?: boolean }) {
  const rubric = r.rubric_version_id ? d.rubrics[r.rubric_version_id] : undefined;
  return (
    <article className="flex flex-col gap-3 rounded-md border border-line bg-raised p-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="font-bold">{r.mine ? "Ton évaluation" : r.reviewer_name}</h3>
        <span className="type-meta text-subtle">
          {r.kind === "interview" ? "Entretien · " : ""}
          {r.status === "draft" ? "brouillon" : r.submitted_at ? `soumise ${at(r.submitted_at)}` : ""}
          {r.amended_at ? ` · corrigée ${at(r.amended_at)}` : ""}
          {rubric ? ` · grille v${rubric.number}` : ""}
        </span>
        {r.conflicted && <StatusBadge tone="warn">Conflit déclaré depuis</StatusBadge>}
      </header>
      {rubric && rubric.criteria.length > 0 && (
        <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 type-small">
          {rubric.criteria.map((c) => (
            <div key={c.id} className="contents">
              <dt className="text-muted">
                {c.label}
                {c.weight > 1 ? ` (×${c.weight})` : ""}
              </dt>
              <dd className="text-right font-semibold">{typeof r.scores[c.id] === "number" ? `${r.scores[c.id]} / ${c.max}` : "—"}</dd>
            </div>
          ))}
        </dl>
      )}
      {r.total && <p className="type-small text-muted">{totalBasis(r.total)}</p>}
      {r.recommendation && (
        <p className="type-small">
          <span className="text-muted">Avis : </span>
          <span className="font-semibold">{RECOMMENDATION_LABEL[r.recommendation]}</span>
        </p>
      )}
      {r.note && <p className="whitespace-pre-line border-l-2 border-line pl-3 type-small">{r.note}</p>}
      {r.revision_count > 1 && <p className="type-meta text-subtle">{r.revision_count} versions soumises (historique conservé)</p>}
      {amendable && (
        <Disclosure summary="Corriger mon évaluation" icon="edit">
          <ReviewForm
            applicationId={d.application.id}
            criteria={rubric?.criteria ?? []}
            review={{ id: r.id, scores: r.scores, recommendation: r.recommendation, note: r.note, version: r.version }}
            mode="amend"
          />
        </Disclosure>
      )}
    </article>
  );
}

export function ReviewsPanel({ d, writable }: { d: ApplicationDetail; writable: boolean }) {
  const mine = d.reviews.find((r) => r.mine && r.kind === "application");
  const others = d.reviews.filter((r) => !r.mine && r.kind === "application");
  const interviewReviews = d.reviews.filter((r) => !r.mine && r.kind === "interview");
  const rubric = Object.values(d.rubrics).find((v) => v.kind === "application" && v.status === "published");
  const decided = d.decisions.some((x) => x.status === "finalized" || x.status === "released");
  const canReview = d.can.review && writable && d.application.status === "submitted";
  const summary = d.summary;
  return (
    <Panel
      id="evaluations"
      title="Évaluations"
      aside={`${summary.counted}/${summary.required} soumise${summary.counted > 1 ? "s" : ""}${summary.average !== null ? ` · moyenne ${percentLabel(summary.average)}` : ""}`}
    >
      {canReview && (!mine || mine.status === "draft") && !decided && (
        <div className="rounded-md border-2 border-fg bg-raised p-4 sm:p-5">
          <h3 className="mb-4 type-card">{mine ? "Ton brouillon" : "Ton évaluation"}</h3>
          <ReviewForm
            applicationId={d.application.id}
            criteria={rubric?.criteria ?? []}
            review={mine ? { id: mine.id, scores: mine.scores, recommendation: mine.recommendation, note: mine.note, version: mine.version } : null}
            mode="edit"
          />
        </div>
      )}
      {mine?.status === "submitted" && <ReviewCard review={mine} d={d} amendable={canReview && !decided} />}
      {!d.can.review && !mine && <p className="type-small text-muted">Évaluer n&apos;est pas dans ta nomination pour cette candidature.</p>}
      {d.can.view_team ? (
        others.length + interviewReviews.length > 0 ? (
          <div className="flex flex-col gap-3">
            {summary.recommendations && (
              <p className="type-small text-muted">
                Avis :{" "}
                {Object.entries(summary.recommendations)
                  .map(([k, n]) => `${RECOMMENDATION_LABEL[k as keyof typeof RECOMMENDATION_LABEL] ?? k} (${n})`)
                  .join(", ")}
              </p>
            )}
            {[...others, ...interviewReviews].map((r) => (
              <ReviewCard key={r.id} review={r} d={d} />
            ))}
          </div>
        ) : (
          <p className="type-small text-muted">Personne d&apos;autre n&apos;a encore soumis d&apos;évaluation.</p>
        )
      ) : (
        <p className="type-small text-muted">
          Les évaluations des autres ne sont pas dans ta nomination : chaque personne évalue sans voir les autres.
        </p>
      )}
    </Panel>
  );
}

// ---- The team's discussion ------------------------------------------------------------------------------

export function DiscussionPanel({ d, writable }: { d: ApplicationDetail; writable: boolean }) {
  if (d.comments === null) return null;
  return (
    <Panel id="discussion" title="Discussion de l'équipe" aside="Jamais visible de la personne">
      {d.comments.length === 0 ? (
        <p className="type-small text-muted">Pas encore de message.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {d.comments.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 border-l-2 border-line pl-3">
              <p className="type-meta text-subtle">
                <span className="font-semibold text-fg">{c.author_name}</span> · {at(c.created_at)}
                {c.mentions.length > 0 ? ` · pour ${c.mentions.join(", ")}` : ""}
              </p>
              {c.retracted ? <p className="type-small italic text-muted">Message retiré par son auteur·rice.</p> : <p className="whitespace-pre-line type-small">{c.body}</p>}
              {c.mine && !c.retracted && writable && (
                <ActionForm action={retractComment} hidden={{ comment_id: c.id }} submitLabel="Retirer" variant="ghost" size="sm" inline />
              )}
            </li>
          ))}
        </ol>
      )}
      {writable && (
        <ActionForm action={postComment} hidden={{ application_id: d.application.id }} submitLabel="Publier" resetOnDone size="sm">
          <Field label="Un message pour l'équipe" hint="Factuel et respectueux : la personne peut demander à lire ce qui la concerne. 2 000 caractères au plus.">
            {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="body" rows={3} maxLength={2000} required />}
          </Field>
          {(d.mentionable ?? []).length > 0 && (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 type-small font-bold">Prévenir (facultatif)</legend>
              <div className="flex flex-wrap gap-x-5">
                {(d.mentionable ?? []).map((m) => (
                  <Checkbox key={m.id} name="mentions" value={m.id} label={m.name} />
                ))}
              </div>
            </fieldset>
          )}
        </ActionForm>
      )}
    </Panel>
  );
}

// ---- Decision ---------------------------------------------------------------------------------------------

const DECISION_TONE: Record<string, StatusTone> = {
  proposed: "accent",
  finalized: "info",
  released: "ok",
  returned: "neutral",
  cancelled: "neutral",
  superseded: "neutral",
};

export function DecisionPanel({ d, writable, aal2 }: { d: ApplicationDetail; writable: boolean; aal2: boolean }) {
  const current = [...d.decisions].reverse().find((x) => x.status === "proposed" || x.status === "finalized" || x.status === "released");
  const past = d.decisions.filter((x) => x !== current);
  const decide = d.can.propose || d.can.approve || d.can.release;
  if (!decide && !current) return null;
  const submitted = d.application.status === "submitted";
  return (
    <Panel id="decision" title="Décision">
      {current ? (
        <DecisionCard decision={current} d={d} writable={writable && submitted} aal2={aal2} />
      ) : d.can.propose && writable && submitted ? (
        <ProposeForm d={d} />
      ) : (
        <p className="type-small text-muted">Pas de décision proposée.</p>
      )}
      {current?.status === "released" && current.outcome === "waitlist" && d.can.propose && writable && submitted && (
        <Disclosure summary="Proposer de retenir la personne (place libérée)" icon="arrow-right">
          <ProposeForm d={d} only="offer" />
        </Disclosure>
      )}
      {past.length > 0 && (
        <details className="type-small">
          <summary className="cursor-pointer font-semibold">Décisions précédentes ({past.length})</summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {past.map((x) => (
              <li key={x.id} className="text-muted">
                {OUTCOME_SHORT[x.outcome]} · {DECISION_STATUS_LABEL[x.status]}
                {x.return_reason ? ` : ${x.return_reason}` : ""}
                {x.cancel_reason ? ` : ${x.cancel_reason}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

function ProposeForm({ d, only }: { d: ApplicationDetail; only?: "offer" }) {
  const full = d.position.openings !== null && d.position.offers >= d.position.openings;
  return (
    <ActionForm action={proposeDecision} hidden={{ application_id: d.application.id }} submitLabel="Proposer la décision">
      <p className="type-small text-muted">
        Une proposition reste interne. Elle est ensuite validée selon les règles du recrutement, puis annoncée : la personne n&apos;en
        sait rien avant.
      </p>
      <Field label="Décision proposée">
        {({ id, describedBy }) => (
          <Select id={id} aria-describedby={describedBy} name="outcome" defaultValue={only ?? ""} required>
            {!only && <option value="">Choisir…</option>}
            {(only ? (["offer"] as const) : (["offer", "waitlist", "reject"] as const)).map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABEL[o]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {full && (
        <p className="flex items-start gap-2 type-small text-warn">
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          {d.position.offers} proposition{d.position.offers > 1 ? "s" : ""} déjà faite{d.position.offers > 1 ? "s" : ""} pour {d.position.openings} place
          {d.position.openings! > 1 ? "s" : ""} : retenir une personne de plus demandera une raison à la validation.
        </p>
      )}
      <Field label="Pourquoi" optional hint="Pour l'équipe seulement. 2 000 caractères au plus.">
        {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="rationale" rows={3} maxLength={2000} />}
      </Field>
      <Field label="Message à la personne" optional hint="Envoyé avec la décision quand elle est annoncée ; sinon, le message type. 2 000 caractères au plus.">
        {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="message" rows={3} maxLength={2000} />}
      </Field>
    </ActionForm>
  );
}

function DecisionCard({ decision: x, d, writable, aal2 }: { decision: DecisionPayload; d: ApplicationDetail; writable: boolean; aal2: boolean }) {
  const reviewsShort = d.summary.counted < d.summary.required;
  const capacityShort = x.outcome === "offer" && d.position.openings !== null && d.position.offers >= d.position.openings;
  return (
    <div className="flex flex-col gap-3 rounded-md border-2 border-fg bg-raised p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusBadge tone={DECISION_TONE[x.status]}>{DECISION_STATUS_LABEL[x.status]}</StatusBadge>
        <span className="font-bold">{OUTCOME_LABEL[x.outcome]}</span>
        {x.waitlist_rank !== null && x.outcome === "waitlist" && <span className="type-meta text-subtle">rang {x.waitlist_rank}</span>}
      </div>
      <p className="type-meta text-subtle">
        Proposée {at(x.proposed_at)}
        {x.proposed_by_name ? ` par ${x.proposed_by_name}` : ""}
        {x.approvals.length > 0
          ? ` · approuvée par ${x.approvals.map((a) => `${a.name}${a.as_president ? " (présidence)" : ""}`).join(", ")}`
          : ""}
        {x.released_at ? ` · annoncée ${at(x.released_at)}${x.released_by_name ? ` par ${x.released_by_name}` : ""}` : ""}
        {x.release_scheduled_at && !x.released_at ? ` · annonce programmée le ${at(x.release_scheduled_at)}` : ""}
      </p>
      {x.rationale && <p className="whitespace-pre-line type-small">{x.rationale}</p>}
      {x.reviews_override_reason && <p className="type-small text-muted">Validée sans toutes les évaluations : {x.reviews_override_reason}</p>}
      {x.capacity_override_reason && <p className="type-small text-muted">Au-delà des places : {x.capacity_override_reason}</p>}
      {x.message && <p className="whitespace-pre-line border-l-2 border-line pl-3 type-small text-muted">Message à la personne : {x.message}</p>}

      {x.offer && (
        <div className="flex flex-col gap-1 rounded-sm bg-sunken px-3.5 py-2.5 type-small">
          <p className="font-semibold">Proposition : {OFFER_STATUS_LABEL[x.offer.status]}</p>
          {x.offer.expires_at && x.offer.status === "pending" && <p className="text-muted">Réponse attendue avant le {at(x.offer.expires_at)}</p>}
          {x.offer.response_note && <p className="text-muted">Mot de la personne : {x.offer.response_note}</p>}
          {x.offer.withdraw_reason && <p className="text-muted">Retirée : {x.offer.withdraw_reason}</p>}
          {x.offer.onboarding && (
            <p className="text-muted">
              Invitation dans l&apos;équipe envoyée {at(x.offer.onboarding.at)}
              {x.offer.onboarding.by_name ? ` par ${x.offer.onboarding.by_name}` : ""} ({x.offer.onboarding.status === "accepted" ? "acceptée" : x.offer.onboarding.status === "pending" ? "en attente" : x.offer.onboarding.status})
            </p>
          )}
        </div>
      )}

      {writable && (
        <div className="flex flex-col gap-2">
          {x.status === "proposed" && d.can.approve && !x.approved_by_me && (
            <Disclosure summary="Approuver" icon="check" tone="primary" open>
              <ActionForm action={approveDecision} hidden={{ decision_id: x.id }} submitLabel="Approuver" submitIcon="check">
                {!aal2 && <p className="type-small text-warn">La validation demande une connexion avec la double authentification.</p>}
                {reviewsShort && (
                  <Field label="Évaluations incomplètes : pourquoi décider quand même" hint={`${d.summary.counted} sur ${d.summary.required} demandées.`}>
                    {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="reviews_reason" rows={2} maxLength={500} />}
                  </Field>
                )}
                {capacityShort && (
                  <Field label="Places déjà pourvues : pourquoi retenir quand même" hint={`${d.position.offers} proposition(s) pour ${d.position.openings} place(s).`}>
                    {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="capacity_reason" rows={2} maxLength={500} />}
                  </Field>
                )}
              </ActionForm>
            </Disclosure>
          )}
          {x.status === "proposed" && d.can.approve && (
            <Disclosure summary="Renvoyer la proposition" icon="arrow-left">
              <ActionForm action={returnDecision} hidden={{ decision_id: x.id }} submitLabel="Renvoyer" variant="secondary">
                <Reason hint="Pour l'équipe : ce qui manque ou ce qui ne va pas." />
              </ActionForm>
            </Disclosure>
          )}
          {x.status === "finalized" && d.can.release && (
            <Disclosure summary="Annoncer à la personne" icon="mail" tone="primary" open>
              <ActionForm action={releaseDecisions} hidden={{ decision_ids: x.id }} submitLabel={aal2 ? "Annoncer" : "Annoncer (double authentification requise)"}>
                <p className="type-small text-muted">
                  La personne reçoit une notification et voit la décision dans son espace. Pour plusieurs annonces à la fois, passe par
                  l&apos;onglet Décisions.
                </p>
                {x.outcome === "offer" && <DateTimeFields prefix="expires" dateLabel="Réponse attendue avant le" optional />}
                <DateTimeFields prefix="at" dateLabel="Annoncer plus tard, le" optional hint="Vide : tout de suite." />
              </ActionForm>
            </Disclosure>
          )}
          {(x.status === "proposed" || x.status === "finalized") && d.can.release && (
            <Disclosure summary="Message envoyé avec la décision" icon="edit">
              <ActionForm action={setDecisionMessage} hidden={{ decision_id: x.id }} submitLabel="Enregistrer le message">
                <Field label="Message" hint="Vide : le message type du recrutement, ou le message standard.">
                  {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="message" rows={3} maxLength={2000} defaultValue={x.message ?? ""} />}
                </Field>
              </ActionForm>
            </Disclosure>
          )}
          {(x.status === "proposed" || (x.status === "finalized" && d.can.approve)) && (x.mine || d.can.approve) && (
            <Disclosure summary="Annuler la décision" icon="close" tone="danger">
              <ActionForm action={cancelDecision} hidden={{ decision_id: x.id }} submitLabel="Annuler la décision" variant="danger">
                <Reason />
              </ActionForm>
            </Disclosure>
          )}
          {x.offer?.status === "pending" && d.can.release && (
            <Disclosure summary="Retirer la proposition" icon="close" tone="danger">
              <ActionForm action={withdrawOffer} hidden={{ offer_id: x.offer.id }} submitLabel="Retirer la proposition" variant="danger">
                <Reason hint="Envoyée à la personne. Double authentification requise." />
              </ActionForm>
            </Disclosure>
          )}
          {x.offer?.status === "accepted" && !x.offer.onboarding && d.can.invite_members && (
            <Disclosure summary="Inviter dans l'équipe de l'asso" icon="users" tone="primary">
              <OnboardingForm offerId={x.offer.id} positions={d.team_positions ?? []} />
            </Disclosure>
          )}
        </div>
      )}
    </div>
  );
}

function OnboardingForm({ offerId, positions }: { offerId: string; positions: { id: string; title: string }[] }) {
  return (
    <ActionForm action={startOnboarding} hidden={{ offer_id: offerId }} submitLabel="Envoyer l'invitation">
      <p className="type-small text-muted">
        L&apos;invitation habituelle de l&apos;équipe : la personne l&apos;accepte depuis son espace. Aucun droit n&apos;est donné
        avant, et un poste de bureau (présidence, trésorerie…) ne se donne jamais par ici.
      </p>
      {positions.length > 0 && (
        <Field label="Poste dans l'asso" optional hint="Ses droits viennent de ce poste, tels qu'ils sont définis dans « Postes et droits ».">
          {({ id, describedBy }) => (
            <Select id={id} aria-describedby={describedBy} name="position_id" defaultValue="">
              <option value="">Membre, sans poste</option>
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
      )}
      <Field label="Fin du mandat (si un poste est choisi)" optional>
        {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="ends_on" />}
      </Field>
    </ActionForm>
  );
}

// ---- Side: stage, tags, assignments, conflicts ---------------------------------------------------------------

export function TeamSide({ d, writable }: { d: ApplicationDetail; writable: boolean }) {
  const submitted = d.application.status === "submitted";
  return (
    <div className="flex flex-col gap-6">
      {d.pipeline && submitted && (
        <section aria-labelledby="etape" className="flex flex-col gap-2">
          <h2 id="etape" className="type-label text-muted">
            Étape interne
          </h2>
          <p className="font-bold">{d.pipeline.stage === "new" ? "Nouvelle" : d.pipeline.stage === "under_review" ? "En examen" : d.pipeline.stage === "shortlisted" ? "Présélectionnée" : "Entretien"}</p>
          <p className="type-meta text-subtle">
            Depuis le {at(d.pipeline.changed_at)}
            {d.pipeline.changed_by_name ? ` · ${d.pipeline.changed_by_name}` : ""}
          </p>
          {d.can.shortlist && writable && (d.pipeline.stage === "new" || d.pipeline.stage === "under_review") && (
            <ActionForm
              action={moveApplications}
              hidden={{ application_ids: d.application.id, stage: d.pipeline.stage === "new" ? "under_review" : "shortlisted" }}
              submitLabel={d.pipeline.stage === "new" ? "Passer en examen" : "Présélectionner"}
              variant="secondary"
              size="sm"
            />
          )}
        </section>
      )}

      {d.tags.length > 0 && (
        <section aria-labelledby="etiquettes" className="flex flex-col gap-2">
          <h2 id="etiquettes" className="type-label text-muted">
            Étiquettes
          </h2>
          <ul className="flex flex-wrap gap-2">
            {d.tags.map((t) => (
              <li key={t.id}>
                {writable && (d.can.review || d.can.shortlist) ? (
                  <ActionForm
                    action={setApplicationTag}
                    hidden={{ application_id: d.application.id, tag_id: t.id, on: t.on ? "0" : "1" }}
                    submitLabel={t.on ? `✓ ${t.label}` : t.label}
                    variant={t.on ? "primary" : "secondary"}
                    size="sm"
                    inline
                  />
                ) : (
                  t.on && <span className="rounded-xs bg-sunken px-2 py-1 type-small">{t.label}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {d.assignments !== null && (
        <section aria-labelledby="confiee" className="flex flex-col gap-2">
          <h2 id="confiee" className="type-label text-muted">
            Confiée à
          </h2>
          {d.assignments.length === 0 ? (
            <p className="type-small text-muted">Personne. On confie les candidatures depuis la liste.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {d.assignments.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 type-small">
                  <span>
                    <span className="font-semibold">{a.name}</span>
                    <span className="text-muted"> · {a.review === "submitted" ? "évaluée" : a.review === "draft" ? "brouillon" : "à faire"}</span>
                  </span>
                  {d.can.committee && writable && !a.review && (
                    <ActionForm action={unassignReview} hidden={{ assignment_id: a.id }} submitLabel="Retirer" variant="ghost" size="sm" inline />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {d.conflicts !== null && d.conflicts.length > 0 && (
        <section aria-labelledby="conflits" className="flex flex-col gap-2">
          <h2 id="conflits" className="type-label text-muted">
            Conflits d&apos;intérêts
          </h2>
          <ul className="flex flex-col gap-3">
            {d.conflicts.map((c) => (
              <li key={c.id} className="flex flex-col gap-1 type-small">
                <span>
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-muted">
                    {" "}
                    · {c.status === "open" ? "à régler" : c.status === "reassigned" ? "écarté·e" : "levé"} · {at(c.declared_at)}
                  </span>
                </span>
                {c.note && <span className="text-muted">{c.note}</span>}
                {c.status === "open" && writable && (
                  <Disclosure summary="Régler" icon="shield">
                    <ActionForm action={resolveConflict} hidden={{ conflict_id: c.id }} submitLabel="Enregistrer">
                      <Field label="Décision">
                        {({ id, describedBy }) => (
                          <Select id={id} aria-describedby={describedBy} name="resolution" defaultValue="reassigned">
                            <option value="reassigned">La personne reste à l&apos;écart de cette candidature</option>
                            <option value="cleared">Pas de conflit réel : elle retrouve l&apos;accès</option>
                          </Select>
                        )}
                      </Field>
                      <Reason />
                    </ActionForm>
                  </Disclosure>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {submitted && writable && (
        <Disclosure summary="Déclarer un conflit d'intérêts" icon="shield">
          <ActionForm action={declareConflict} hidden={{ application_id: d.application.id }} submitLabel="Déclarer et me retirer">
            <p className="type-small text-muted">
              Un lien personnel avec la personne (ami·e, colocation, couple, famille…). Tu ne verras plus cette candidature ; la personne qui
              compose le comité la confiera à quelqu&apos;un d&apos;autre.
            </p>
            <Field label="Précision" optional hint="Visible de la personne qui compose le comité. 500 caractères au plus.">
              {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="note" rows={2} maxLength={500} />}
            </Field>
          </ActionForm>
        </Disclosure>
      )}
    </div>
  );
}

// ---- History ---------------------------------------------------------------------------------------------

export function HistoryPanel({ d }: { d: ApplicationDetail }) {
  return (
    <Panel id="historique" title="Historique de l'équipe" aside="Les 100 dernières étapes">
      <ol className="flex flex-col border-b border-line">
        {d.activity.map((h, i) => (
          <li key={`${h.at}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-line py-2.5 type-small">
            <span>
              <span className="font-semibold">{activityLine(h)}</span>
              {h.actor_name && <span className="text-muted"> · {h.actor_name}</span>}
            </span>
            <time dateTime={h.at} className="type-meta text-subtle">
              {at(h.at)}
            </time>
          </li>
        ))}
      </ol>
      {d.access !== null && (
        <details className="type-small">
          <summary className="cursor-pointer font-semibold">Qui a ouvert cette candidature ({d.access.length})</summary>
          <ol className="mt-2 flex flex-col gap-1">
            {d.access.map((l, i) => (
              <li key={`${l.at}-${i}`} className="text-muted">
                {l.actor_name} · {l.action === "document_opened" ? `a ouvert « ${l.file_name ?? "un fichier"} »` : "a ouvert la candidature"} · {at(l.at)}
              </li>
            ))}
          </ol>
        </details>
      )}
    </Panel>
  );
}
