"use client";

import Link from "next/link";
import { startTransition, useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteApplicationDraft, saveApplicationAnswers, submitApplication } from "@/app/actions/recruitment";
import type { GovernanceActionState } from "@/app/actions/governance";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import {
  ANSWER_ERROR_LABEL,
  answerErrors,
  answerText,
  isDocumentQuestion,
  type AnswerError,
  type FormQuestion,
  type FormSchema,
} from "@/lib/recruitment/form";
import { sizeLabel } from "@/lib/recruitment/documents";
import type { ApplicationDocument, CandidatePayload } from "@/lib/recruitment/model";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { QuestionField } from "./QuestionField";
import { DocumentField } from "./DocumentField";

/**
 * A student's draft application, step by step: one step per part of the
 * form (shared questions), then the position's own questions, then "Relire
 * et envoyer". Answers save themselves a moment after each change
 * (save_application_answers, with the version this tab knows: another tab's
 * newer work is never overwritten — this tab says so and stops). Documents
 * upload as soon as they are picked. Submitting first saves what is
 * pending, then submit_application decides (deadline, eligibility, limit,
 * form version, every answer and document) in one transaction.
 */

export interface EditorProps {
  applicationId: string;
  version: number;
  positionId: string;
  form: FormSchema;
  answers: Record<string, unknown>;
  documents: ApplicationDocument[];
  lastSavedAt: string | null;
  candidate: CandidatePayload;
  privacy: { notice: string | null; contact: string | null; retention: string[] };
  /** Why it cannot be sent now (in words), or null. */
  blocked: string | null;
  /** "Clôture le 20 novembre à 23h59". */
  deadline: string;
}

type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

interface Step {
  key: string;
  title: string;
  description?: string;
  questions: FormQuestion[];
}

const timeFormat = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function ApplicationEditor(props: EditorProps) {
  const { applicationId, positionId, form, candidate, privacy, blocked, deadline } = props;
  const [answers, setAnswers] = useState<Record<string, unknown>>(props.answers);
  const [documents, setDocuments] = useState<ApplicationDocument[]>(props.documents);
  const [save, setSave] = useState<{ state: SaveState; at: string | null; message?: string }>({
    state: "saved",
    at: props.lastSavedAt,
  });
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [stepIndex, setStepIndex] = useState(0);
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitState, submit, submitting] = useActionState<GovernanceActionState, FormData>(submitApplication, { status: "idle" });

  const version = useRef(props.version);
  const latest = useRef(answers);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);

  const steps = useMemo<Step[]>(() => {
    const list: Step[] = form.sections
      .map((s) => ({
        key: s.id,
        title: s.title,
        description: s.description,
        questions: form.questions.filter((q) => q.scope === "shared" && q.section === s.id),
      }))
      .filter((s) => s.questions.length > 0);
    const own = form.questions.filter((q) => q.scope === positionId);
    if (own.length > 0) list.push({ key: "poste", title: "Pour ce poste", questions: own });
    list.push({ key: "envoi", title: "Relire et envoyer", questions: [] });
    return list;
  }, [form, positionId]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const d of documents) out[d.question_id] = (out[d.question_id] ?? 0) + 1;
    return out;
  }, [documents]);
  const draftErrors = useMemo(() => answerErrors(form, positionId, answers, counts, false), [form, positionId, answers, counts]);
  const finalErrors = useMemo(() => answerErrors(form, positionId, answers, counts, true), [form, positionId, answers, counts]);
  const step = steps[Math.min(stepIndex, steps.length - 1)];
  const review = step.key === "envoi";

  /** Sends what this tab holds; resolves true when the database has it. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (stopped.current) return false;
    if (inFlight.current) await inFlight.current;
    const sending = latest.current;
    const run = (async () => {
      setSave((s) => ({ ...s, state: "saving" }));
      const r = await saveApplicationAnswers(applicationId, version.current, sending);
      if (!r.ok) {
        if (r.code === "draft_conflict" || r.code === "application_locked") {
          stopped.current = true;
          setSave({
            state: "conflict",
            at: null,
            message:
              r.code === "application_locked"
                ? "Cette candidature a été envoyée depuis un autre onglet : elle ne se modifie plus."
                : "Ce brouillon a été modifié dans un autre onglet ou sur un autre appareil. Recharge la page pour reprendre la dernière version (ce que tu viens de taper ici n'a pas été enregistré).",
          });
        } else {
          setSave((s) => ({ ...s, state: "error", message: r.message }));
        }
        return false;
      }
      version.current = r.version;
      setSave({ state: latest.current === sending ? "saved" : "dirty", at: r.savedAt });
      return true;
    })();
    inFlight.current = run;
    const ok = await run;
    inFlight.current = null;
    return ok;
  }, [applicationId]);

  const schedule = useCallback(() => {
    if (stopped.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 1200);
  }, [flush]);

  // A tab closed with unsaved answers: warn (the browser shows its own words).
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (save.state === "dirty" || save.state === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save.state]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function setAnswer(id: string, value: unknown) {
    setAnswers((prev) => {
      const next = { ...prev };
      if (value === null || value === undefined || (typeof value === "string" && value === "") || (Array.isArray(value) && value.length === 0)) delete next[id];
      else next[id] = value;
      latest.current = next;
      return next;
    });
    setSave((s) => (s.state === "conflict" ? s : { ...s, state: "dirty" }));
    schedule();
  }

  function touch(id: string) {
    setTouched((t) => (t.has(id) ? t : new Set(t).add(id)));
  }

  async function go(index: number) {
    if (save.state === "dirty") await flush();
    // What the student leaves behind is shown with its problems from now on.
    setTouched((t) => {
      const next = new Set(t);
      step.questions.forEach((q) => next.add(q.id));
      return next;
    });
    setStepIndex(index);
    requestAnimationFrame(() => document.getElementById("candidature-etape")?.focus());
  }

  const disabled = save.state === "conflict";
  const errorFor = (q: FormQuestion): AnswerError | undefined =>
    review || touched.has(q.id) ? (finalErrors[q.id] ?? draftErrors[q.id]) : draftErrors[q.id];

  const missing = Object.keys(finalErrors);
  const stepOf = (questionId: string) => steps.findIndex((s) => s.questions.some((q) => q.id === questionId));

  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
      <nav aria-label="Étapes de la candidature" className="-mx-[var(--gutter)] overflow-x-auto px-[var(--gutter)] [scrollbar-width:none] lg:mx-0 lg:overflow-visible lg:px-0">
        <ol className="flex min-w-max gap-1 border-b border-line lg:sticky lg:top-[calc(var(--header-h)+1rem)] lg:min-w-0 lg:flex-col lg:border-b-0 lg:border-l">
          {steps.map((s, i) => {
            const todo = s.questions.some((q) => finalErrors[q.id]);
            const active = i === stepIndex;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => go(i)}
                  aria-current={active ? "step" : undefined}
                  className={cx(
                    "relative flex min-h-11 w-full items-center gap-2.5 whitespace-nowrap px-3 text-left text-[0.9rem] font-semibold transition-colors lg:-ml-px lg:border-l-[3px] lg:border-transparent",
                    active ? "text-fg lg:border-assoc" : "text-muted hover:text-fg",
                  )}
                >
                  <span className="type-meta text-[0.75rem] text-subtle">{i + 1}</span>
                  {s.title}
                  {s.key !== "envoi" && !todo && <Icon name="check" size={14} strokeWidth={2.5} className="text-ok" aria-label="complet" />}
                  {s.key !== "envoi" && todo && <span className="size-1.5 rounded-full bg-warn" aria-label="à compléter" role="img" />}
                </button>
              </li>
            );
          })}
        </ol>
        <SaveLine save={save} />
      </nav>

      <div className="min-w-0 max-w-3xl">
        {save.state === "conflict" && (
          <div role="alert" className="mb-6 flex flex-col gap-3 rounded-sm border-2 border-danger/60 bg-danger/5 p-4">
            <p className="type-small font-semibold text-danger">{save.message}</p>
            <Button type="button" variant="secondary" className="self-start" onClick={() => window.location.reload()}>
              Recharger la page
            </Button>
          </div>
        )}

        <section aria-labelledby="candidature-etape" className="flex flex-col gap-8">
          <header className="flex flex-col gap-2">
            <p className="type-label text-muted">
              Étape {stepIndex + 1} sur {steps.length}
            </p>
            <h2 id="candidature-etape" tabIndex={-1} className="type-title text-[clamp(1.5rem,1.2rem+1vw,2.1rem)] outline-none">
              {step.title}
            </h2>
            {step.description && <p className="text-muted">{step.description}</p>}
          </header>

          {!review &&
            step.questions.map((q) =>
              isDocumentQuestion(q) ? (
                <DocumentField
                  key={q.id}
                  question={q}
                  applicationId={applicationId}
                  documents={documents.filter((d) => d.question_id === q.id)}
                  error={touched.has(q.id) ? finalErrors[q.id] : undefined}
                  disabled={disabled}
                  onChanged={(list, v) => {
                    setDocuments((all) => [...all.filter((d) => d.question_id !== q.id), ...list]);
                    if (v) version.current = v;
                    touch(q.id);
                  }}
                />
              ) : (
                <QuestionField
                  key={q.id}
                  question={q}
                  value={answers[q.id]}
                  error={errorFor(q)}
                  disabled={disabled}
                  onChange={(v) => setAnswer(q.id, v)}
                  onBlur={() => {
                    touch(q.id);
                    if (save.state === "dirty") void flush();
                  }}
                />
              ),
            )}

          {review && (
            <Review
              steps={steps}
              answers={answers}
              documents={documents}
              candidate={candidate}
              missing={missing}
              onGo={(i) => go(i)}
              stepOf={stepOf}
              errors={finalErrors}
            />
          )}

          {review && (
            <form
              action={submit}
              onSubmit={async (e) => {
                e.preventDefault();
                const ok = save.state === "saved" ? true : await flush();
                if (!ok) return;
                const data = new FormData();
                data.set("application_id", applicationId);
                data.set("version", String(version.current));
                data.set("privacy", acknowledged ? "1" : "");
                startTransition(() => submit(data));
              }}
              className="flex flex-col gap-5 border-t-2 border-fg pt-6"
            >
              <section aria-labelledby="donnees" className="flex flex-col gap-3">
                <h3 id="donnees" className="type-label">
                  Tes données
                </h3>
                {privacy.notice ? (
                  <div className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-sm border border-line bg-raised p-4 type-small">
                    {privacy.notice.split(/\n\s*\n/).map((p, i) => (
                      <p key={i} className="whitespace-pre-line">
                        {p}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="type-small text-muted">
                    Le BDE n&apos;a pas encore publié sa notice détaillée. En bref : ta candidature (réponses, documents et les
                    informations de ton profil listées plus haut) est destinée à l&apos;association qui recrute, pour ce
                    recrutement seulement. Les documents restent privés : pour l&apos;instant, toi seul·e peux les ouvrir.
                  </p>
                )}
                <ul className="flex flex-col gap-1 type-small text-muted">
                  {privacy.retention.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                  {privacy.contact && <li>Une question sur tes données : {privacy.contact}</li>}
                </ul>
                <Checkbox
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  label="J'ai lu comment mes données sont utilisées, et je confirme que mes réponses sont les miennes."
                />
              </section>

              {blocked ? (
                <p role="status" className="flex items-start gap-2 type-small font-semibold">
                  <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
                  {blocked}
                </p>
              ) : (
                <p className="type-small text-muted">
                  {deadline}. Une fois envoyée, ta candidature ne se modifie plus (tu pourras la retirer). Envoyée ne veut pas
                  dire acceptée.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  type="submit"
                  size="lg"
                  icon="arrow-right"
                  disabled={Boolean(blocked) || disabled || submitting || missing.length > 0 || !acknowledged}
                  aria-disabled={Boolean(blocked) || disabled || submitting || missing.length > 0 || !acknowledged}
                >
                  {submitting ? "Envoi…" : "Envoyer ma candidature"}
                </Button>
                {missing.length > 0 && (
                  <span className="type-small font-semibold">
                    {missing.length} point{missing.length > 1 ? "s" : ""} à régler avant l&apos;envoi (voir plus haut).
                  </span>
                )}
              </div>
              {submitState.status === "error" && submitState.message && (
                <p key={submitState.at} role="alert" className="flex items-start gap-2 rounded-sm border-2 border-danger/50 bg-danger/5 p-3 type-small font-semibold text-danger">
                  <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                  {submitState.message}
                </p>
              )}
            </form>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
            {stepIndex > 0 ? (
              <Button type="button" variant="ghost" icon="arrow-left" iconPosition="start" onClick={() => go(stepIndex - 1)}>
                {steps[stepIndex - 1].title}
              </Button>
            ) : (
              <span />
            )}
            {!review && (
              <Button type="button" icon="arrow-right" onClick={() => go(stepIndex + 1)}>
                {steps[stepIndex + 1].key === "envoi" ? "Relire" : "Suivant"}
              </Button>
            )}
          </div>
        </section>

        <DeleteDraft applicationId={applicationId} />
      </div>
    </div>
  );
}

function SaveLine({ save }: { save: { state: SaveState; at: string | null; message?: string } }) {
  const text =
    save.state === "saving"
      ? "Enregistrement…"
      : save.state === "dirty"
        ? "Modifications en cours…"
        : save.state === "error"
          ? (save.message ?? "Pas enregistré. Réessaie dans un instant.")
          : save.state === "conflict"
            ? "Enregistrement arrêté"
            : save.at
              ? `Enregistré à ${timeFormat.format(new Date(save.at)).replace(":", "h")}`
              : "Rien à enregistrer pour l'instant";
  return (
    <p
      role="status"
      aria-live="polite"
      className={cx("mt-3 hidden px-3 type-meta lg:block", save.state === "error" || save.state === "conflict" ? "font-bold text-danger" : "text-muted")}
    >
      {text}
    </p>
  );
}

function Review({
  steps,
  answers,
  documents,
  candidate,
  missing,
  errors,
  onGo,
  stepOf,
}: {
  steps: Step[];
  answers: Record<string, unknown>;
  documents: ApplicationDocument[];
  candidate: CandidatePayload;
  missing: string[];
  errors: Record<string, AnswerError>;
  onGo: (index: number) => void;
  stepOf: (questionId: string) => number;
}) {
  const name = [candidate.first_name, candidate.last_name].filter(Boolean).join(" ") || candidate.display_name;
  return (
    <div className="flex flex-col gap-8">
      {missing.length > 0 && (
        <div role="alert" className="flex flex-col gap-2 rounded-sm border-2 border-warn/60 bg-warn/5 p-4">
          <p className="type-small font-bold">Avant d&apos;envoyer :</p>
          <ul className="flex flex-col gap-1.5">
            {missing.map((id) => {
              const i = stepOf(id);
              const q = steps[i]?.questions.find((x) => x.id === id);
              return (
                <li key={id} className="type-small">
                  <button type="button" className="link font-semibold" onClick={() => onGo(Math.max(0, i))}>
                    {q?.label ?? id}
                  </button>{" "}
                  — {ANSWER_ERROR_LABEL[errors[id]]}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <section aria-labelledby="ce-que-recoit" className="flex flex-col gap-3">
        <h3 id="ce-que-recoit" className="type-label">
          Avec tes réponses, l&apos;association recevra
        </h3>
        <dl className="grid gap-x-6 gap-y-2 rounded-sm bg-sunken p-4 sm:grid-cols-2">
          <Row label="Nom">{name || "—"}</Row>
          <Row label="E-mail">{candidate.email ?? "—"}</Row>
          <Row label="Programme">{candidate.program ?? "Non renseigné"}</Row>
          <Row label="Année d'études">{candidate.study_year ? `${candidate.study_year}${candidate.study_year === 1 ? "re" : "e"} année` : "Non renseignée"}</Row>
        </dl>
        <Link href={routes.accountProfile} className="link self-start type-small font-bold">
          Corriger mon profil
        </Link>
      </section>

      {steps
        .filter((s) => s.key !== "envoi")
        .map((s, i) => (
          <section key={s.key} aria-labelledby={`relire-${s.key}`} className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h3 id={`relire-${s.key}`} className="type-card">
                {s.title}
              </h3>
              <button type="button" className="link type-small font-bold" onClick={() => onGo(i)}>
                Modifier
              </button>
            </div>
            <dl className="flex flex-col border-y border-line">
              {s.questions.map((q) => (
                <div key={q.id} className="flex flex-col gap-1 border-b border-line py-3 last:border-b-0">
                  <dt className="type-small font-bold">{q.label}</dt>
                  <dd className={cx("whitespace-pre-line", errors[q.id] && "text-danger")}>
                    {isDocumentQuestion(q)
                      ? documents
                          .filter((d) => d.question_id === q.id)
                          .map((d) => `${d.file_name} (${sizeLabel(d.size_bytes)})`)
                          .join(", ") || (q.required ? "Aucun fichier — obligatoire" : "Aucun fichier")
                      : answerText(q, answers[q.id]) || (q.required ? "Pas de réponse — obligatoire" : "Pas de réponse")}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="type-meta text-muted">{label}</dt>
      <dd className="font-semibold break-words">{children}</dd>
    </div>
  );
}

function DeleteDraft({ applicationId }: { applicationId: string }) {
  const [state, action, pending] = useActionState<GovernanceActionState, FormData>(deleteApplicationDraft, { status: "idle" });
  const [confirming, setConfirming] = useState(false);
  return (
    <form action={action} className="mt-14 flex flex-col gap-3 border-t border-line pt-6">
      <input type="hidden" name="application_id" value={applicationId} />
      <h2 className="type-label text-muted">Plus envie de candidater&nbsp;?</h2>
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="type-small">Le brouillon et ses documents seront supprimés pour de bon.</p>
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Suppression…" : "Supprimer le brouillon"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
            Garder
          </Button>
        </div>
      ) : (
        <Button type="button" variant="ghost" className="self-start" onClick={() => setConfirming(true)}>
          Supprimer ce brouillon
        </Button>
      )}
      {state.status === "error" && state.message && (
        <p role="alert" className="type-small font-semibold text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}
