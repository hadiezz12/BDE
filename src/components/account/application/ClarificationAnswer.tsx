"use client";

import { useRouter } from "next/navigation";
import { startTransition, useActionState, useRef, useState } from "react";
import { answerClarification, removeClarificationDocument, type ReviewActionState } from "@/app/actions/recruitment-review";
import { routes } from "@/lib/routes";
import { formatDayMonth, formatTime } from "@/lib/format";
import { sizeLabel } from "@/lib/recruitment/documents";
import type { CandidateClarification } from "@/lib/recruitment/candidate";
import { Button } from "@/components/ui/Button";
import { Field, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ActionOutcome } from "@/components/manage/governance/ActionForm";
import { announceIfGone } from "@/components/manage/governance/DoneAnnouncer";

/**
 * A question the association asked after the application was sent: the
 * candidate answers once, and may attach files first when the association
 * allows it (checked by the upload route like any document). The answer is
 * added next to the application; what was sent never changes.
 */
export function ClarificationAnswer({ applicationId, clarification: q }: { applicationId: string; clarification: CandidateClarification }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [state, dispatch, pending] = useActionState(async (prev: ReviewActionState, data: FormData) => {
    const next = await answerClarification(prev, data);
    if (next.status === "done") announceIfGone(formRef.current, next.message);
    return next;
  }, { status: "idle" } as ReviewActionState);
  const [removed, remove, removing] = useActionState(removeClarificationDocument, { status: "idle" } as ReviewActionState);
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  function upload(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      setProblem(`Ce fichier fait ${sizeLabel(file.size)} : 10 Mo au plus.`);
      return;
    }
    setProblem(null);
    const body = new FormData();
    body.set("clarification_id", q.id);
    body.set("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", routes.applicationUpload(applicationId));
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => {
      setProgress(null);
      setProblem("L'envoi n'a pas abouti (connexion ?). Réessaie.");
    };
    xhr.onload = () => {
      setProgress(null);
      const r = xhr.response as { error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300) router.refresh();
      else setProblem(r?.error ?? "L'envoi n'a pas abouti. Réessaie.");
    };
    xhr.send(body);
  }

  return (
    <div className="flex flex-col gap-4">
      {q.allows_documents && (
        <div className="flex flex-col gap-2">
          <p className="font-bold">Fichiers (facultatif)</p>
          {q.documents.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {q.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-3">
                  <a href={routes.applicationDocument(d.id)} className="inline-flex items-center gap-2 font-semibold hover:underline">
                    <Icon name="file" size={18} className="shrink-0 text-assoc-text" />
                    {d.file_name}
                    <span className="type-meta font-normal text-muted">{sizeLabel(d.size_bytes)}</span>
                  </a>
                  <button
                    type="button"
                    className="type-small text-danger underline underline-offset-2 disabled:opacity-50"
                    disabled={removing}
                    onClick={() => {
                      const data = new FormData();
                      data.set("document_id", d.id);
                      startTransition(() => remove(data));
                    }}
                  >
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          )}
          <ActionOutcome state={removed} />
          <input
            ref={input}
            type="file"
            className="sr-only"
            accept=".pdf,.docx,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload(file);
            }}
          />
          <div>
            <Button type="button" variant="secondary" size="sm" icon="upload" iconPosition="start" disabled={progress !== null} onClick={() => input.current?.click()}>
              {progress !== null ? `Envoi… ${progress} %` : "Joindre un fichier"}
            </Button>
          </div>
          <p className="type-small text-subtle">PDF, Word (.docx), JPEG ou PNG, 10 Mo au plus. À joindre avant d&apos;envoyer ta réponse.</p>
          {problem && (
            <p role="alert" className="type-small font-semibold text-danger">
              {problem}
            </p>
          )}
        </div>
      )}
      <form
        ref={formRef}
        className="flex flex-col gap-3"
        action={dispatch}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => dispatch(data));
        }}
      >
        <input type="hidden" name="clarification_id" value={q.id} />
        <Field
          label="Ta réponse"
          hint={`Une seule réponse, qui ne se modifie plus ensuite.${q.due_at ? ` À envoyer avant le ${formatDayMonth(q.due_at)} à ${formatTime(q.due_at)}.` : ""} 4 000 caractères au plus.`}
        >
          {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="answer" rows={5} maxLength={4000} required />}
        </Field>
        <div>
          <Button type="submit" disabled={pending || progress !== null} aria-disabled={pending || progress !== null}>
            {pending ? "Un instant…" : "Envoyer ma réponse"}
          </Button>
        </div>
        <ActionOutcome state={state} />
      </form>
    </div>
  );
}
