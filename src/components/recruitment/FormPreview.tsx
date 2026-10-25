"use client";

import { useMemo, useState } from "react";
import { answerErrors, isDocumentQuestion, type FormSchema } from "@/lib/recruitment/form";
import { formatsLine } from "@/lib/recruitment/documents";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { QuestionField } from "@/components/account/application/QuestionField";

/**
 * The form a candidate to one position fills, for its team to try: the same
 * fields, the same checks, nothing saved anywhere (no application is
 * created, no file is sent). "Vérifier" shows what a candidate would be
 * told before sending.
 */
export function FormPreview({ form, positionId }: { form: FormSchema; positionId: string }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [checked, setChecked] = useState(false);
  const errors = useMemo(() => answerErrors(form, positionId, answers, {}, checked), [form, positionId, answers, checked]);
  const groups = [
    ...form.sections.map((s) => ({
      key: s.id,
      title: s.title,
      description: s.description,
      questions: form.questions.filter((q) => q.scope === "shared" && q.section === s.id),
    })),
    { key: "poste", title: "Pour ce poste", description: undefined, questions: form.questions.filter((q) => q.scope === positionId) },
  ].filter((g) => g.questions.length > 0);

  if (groups.length === 0) {
    return <p className="type-small text-muted">Ce formulaire ne pose encore aucune question à ce poste.</p>;
  }

  return (
    <div className="flex flex-col gap-10">
      {groups.map((g, i) => (
        <section key={g.key} aria-labelledby={`apercu-${g.key}`} className="flex flex-col gap-6">
          <header className="flex flex-col gap-1 border-t-2 border-fg pt-3">
            <p className="type-label text-muted">
              Étape {i + 1} sur {groups.length + 1}
            </p>
            <h2 id={`apercu-${g.key}`} className="type-title text-[clamp(1.4rem,1.15rem+0.9vw,1.9rem)]">
              {g.title}
            </h2>
            {g.description && <p className="text-muted">{g.description}</p>}
          </header>
          {g.questions.map((q) =>
            isDocumentQuestion(q) ? (
              <div key={q.id} className="flex flex-col gap-2">
                <p className="text-[0.95rem] font-bold leading-snug">
                  {q.label}
                  {!q.required && <span className="ml-1.5 font-normal text-subtle">(facultatif)</span>}
                </p>
                <p className="type-small text-subtle">
                  {[q.help, `${formatsLine(q.file_types ?? ["pdf"], q.max_size_mb ?? 10)}.`].filter(Boolean).join(" ")}
                </p>
                <Button type="button" variant="secondary" icon="upload" iconPosition="start" disabled className="self-start">
                  Choisir un fichier
                </Button>
                <p className="type-small text-muted">Aperçu : aucun fichier n&apos;est envoyé.</p>
              </div>
            ) : (
              <QuestionField
                key={q.id}
                question={q}
                value={answers[q.id]}
                error={errors[q.id]}
                onChange={(v) =>
                  setAnswers((prev) => {
                    const next = { ...prev };
                    if (v === null || v === "" || (Array.isArray(v) && v.length === 0)) delete next[q.id];
                    else next[q.id] = v;
                    return next;
                  })
                }
              />
            ),
          )}
        </section>
      ))}
      <div className="flex flex-col gap-3 border-t-2 border-fg pt-4">
        <Button type="button" variant="secondary" icon="check" iconPosition="start" className="self-start" onClick={() => setChecked(true)}>
          Vérifier comme avant l&apos;envoi
        </Button>
        {checked && (
          <p role="status" className="flex items-start gap-1.5 type-small font-semibold">
            <Icon name={Object.keys(errors).length ? "alert" : "check"} size={15} className="mt-0.5 shrink-0" />
            {Object.keys(errors).length
              ? `${Object.keys(errors).length} point(s) bloqueraient l'envoi (les documents obligatoires comptent).`
              : "Ces réponses passeraient la vérification de l'envoi."}
          </p>
        )}
      </div>
    </div>
  );
}
