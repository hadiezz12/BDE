"use client";

import { startTransition, useActionState, useRef, useState } from "react";
import { amendReview, deleteReviewDraft, saveReview, type ReviewActionState } from "@/app/actions/recruitment-review";
import {
  RECOMMENDATIONS,
  RECOMMENDATION_LABEL,
  reviewTotal,
  totalBasis,
  type Criterion,
  type Recommendation,
  type Scores,
} from "@/lib/recruitment/review";
import { Button } from "@/components/ui/Button";
import { Field, Select, Textarea } from "@/components/ui/Field";
import { ActionOutcome } from "@/components/manage/governance/ActionForm";
import { announceIfGone } from "@/components/manage/governance/DoneAnnouncer";

/**
 * One person's evaluation of an application (or of an interview): a score
 * per criterion of the published grid, a recommendation and a note. The
 * total is the plain weighted sum, shown with its basis; it supports a
 * human decision and never makes one.
 *
 * A draft is private and saved as often as wanted (the version number
 * guards against two tabs overwriting each other). Submitting freezes it;
 * after that, only a correction with a reason, kept in its history.
 */
export function ReviewForm({
  applicationId,
  interviewId,
  criteria,
  review,
  mode,
}: {
  applicationId: string;
  interviewId?: string;
  criteria: Criterion[];
  review: { id: string; scores: Scores; recommendation: Recommendation | null; note: string | null; version: number } | null;
  /** "edit": a new review or one's draft; "amend": a submitted review, corrected with a reason. */
  mode: "edit" | "amend";
}) {
  const [scores, setScores] = useState<Scores>(review?.scores ?? {});
  const formRef = useRef<HTMLFormElement>(null);
  const run = mode === "amend" ? amendReview : saveReview;
  const [state, dispatch, pending] = useActionState(async (prev: ReviewActionState, data: FormData) => {
    const next = await run(prev, data);
    if (next.status === "done") announceIfGone(formRef.current, next.message);
    return next;
  }, { status: "idle" } as ReviewActionState);
  const [discarded, discard, discarding] = useActionState(deleteReviewDraft, { status: "idle" } as ReviewActionState);
  const version = state.version ?? review?.version;
  const reviewId = state.reviewId ?? review?.id;
  const total = reviewTotal(criteria, scores);
  const missing = criteria.filter((c) => c.required && typeof scores[c.id] !== "number");

  if (discarded.status === "done") return <ActionOutcome state={discarded} />;

  return (
    <form
      ref={formRef}
      className="flex flex-col gap-6"
      action={dispatch}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        data.set("intent", submitter?.value ?? "save");
        data.set("scores", JSON.stringify(scores));
        startTransition(() => dispatch(data));
      }}
    >
      <input type="hidden" name="application_id" value={applicationId} />
      {interviewId && <input type="hidden" name="interview_id" value={interviewId} />}
      {mode === "amend" && reviewId && <input type="hidden" name="review_id" value={reviewId} />}
      {mode === "edit" && version !== undefined && <input type="hidden" name="version" value={version} />}

      {criteria.length === 0 ? (
        <p className="type-small text-muted">
          Pas de grille publiée pour ce recrutement : ton évaluation se fait avec un avis et un commentaire.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {criteria.map((c) => (
            <fieldset key={c.id} className="flex flex-col gap-2">
              <legend className="flex flex-wrap items-baseline gap-x-2 text-[0.95rem] font-bold">
                {c.label}
                <span className="type-meta font-normal text-subtle">
                  sur {c.max}
                  {c.weight > 1 ? ` · poids ${c.weight}` : ""}
                  {c.required ? " · obligatoire" : " · facultatif"}
                </span>
              </legend>
              {c.description && <p className="type-small text-muted">{c.description}</p>}
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: c.max }, (_, i) => i + 1).map((n) => (
                  <label
                    key={n}
                    className="focus-ring-within grid size-11 cursor-pointer place-items-center rounded-sm border-2 border-line bg-raised font-bold transition-colors hover:border-line-strong has-[:checked]:border-fg has-[:checked]:bg-fg has-[:checked]:text-bg"
                  >
                    <input
                      type="radio"
                      className="sr-only"
                      name={`score_${c.id}`}
                      value={n}
                      checked={scores[c.id] === n}
                      onChange={() => setScores((s) => ({ ...s, [c.id]: n }))}
                    />
                    {n}
                  </label>
                ))}
                {typeof scores[c.id] === "number" && !c.required && (
                  <button
                    type="button"
                    className="px-2 type-small underline underline-offset-2"
                    onClick={() =>
                      setScores((s) => {
                        const next = { ...s };
                        delete next[c.id];
                        return next;
                      })
                    }
                  >
                    Effacer
                  </button>
                )}
              </div>
            </fieldset>
          ))}
          <p className="rounded-sm bg-sunken px-3.5 py-2.5 type-small" aria-live="polite">
            <span className="font-bold">Total : </span>
            {totalBasis(total)}
          </p>
        </div>
      )}

      <Field label="Ton avis" optional={mode === "edit"} hint="Une recommandation, pas une décision : les décisions se proposent et se valident à part.">
        {({ id, describedBy }) => (
          <Select id={id} aria-describedby={describedBy} name="recommendation" defaultValue={review?.recommendation ?? ""} required={mode === "amend"}>
            <option value="">Choisir…</option>
            {RECOMMENDATIONS.map((r) => (
              <option key={r} value={r}>
                {RECOMMENDATION_LABEL[r]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label="Commentaire"
        optional
        hint="Sur ce que la personne a écrit et sur le poste. Reste factuel·le et respectueux·se : la personne peut demander à lire ce qui la concerne. 4 000 caractères au plus."
      >
        {({ id, describedBy }) => (
          <Textarea id={id} aria-describedby={describedBy} name="note" rows={5} maxLength={4000} defaultValue={review?.note ?? ""} />
        )}
      </Field>
      {mode === "amend" && (
        <Field label="Pourquoi tu corriges" hint="Gardé dans l'historique de l'évaluation, avec l'ancienne version.">
          {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="reason" rows={2} maxLength={500} required minLength={3} />}
        </Field>
      )}

      {mode === "edit" && missing.length > 0 && (
        <p className="type-small text-muted">
          Pour soumettre, note encore : {missing.map((c) => c.label).join(", ")}. Le brouillon s&apos;enregistre sans.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {mode === "edit" ? (
          <>
            <Button type="submit" name="intent" value="submit" disabled={pending} aria-disabled={pending}>
              {pending ? "Un instant…" : "Soumettre l'évaluation"}
            </Button>
            <Button type="submit" name="intent" value="save" variant="secondary" disabled={pending} aria-disabled={pending}>
              Enregistrer le brouillon
            </Button>
          </>
        ) : (
          <Button type="submit" disabled={pending} aria-disabled={pending}>
            {pending ? "Un instant…" : "Enregistrer la correction"}
          </Button>
        )}
        {mode === "edit" && reviewId && (
          <button
            type="button"
            className="type-small text-danger underline underline-offset-2 disabled:opacity-50"
            disabled={discarding}
            onClick={() => {
              const data = new FormData();
              data.set("review_id", reviewId);
              startTransition(() => discard(data));
            }}
          >
            Supprimer le brouillon
          </button>
        )}
      </div>
      <ActionOutcome state={state} />
      <ActionOutcome state={discarded} />
    </form>
  );
}
