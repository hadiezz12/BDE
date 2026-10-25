"use client";

import { useId, useRef, useState } from "react";
import { removeApplicationDocument } from "@/app/actions/recruitment";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { ANSWER_ERROR_LABEL, type AnswerError, type FormQuestion } from "@/lib/recruitment/form";
import { acceptFor, formatsLine, sizeLabel } from "@/lib/recruitment/documents";
import type { ApplicationDocument } from "@/lib/recruitment/model";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

/**
 * A document question (CV, portfolio…): the candidate's files for it, each
 * downloadable by them alone, replaceable and removable while the draft is
 * not sent; a picker that uploads right away through the upload route
 * (which checks the file's real content), with a progress bar. The database
 * decides the formats, size and count; the picker only says them first.
 */
export function DocumentField({
  question: q,
  applicationId,
  documents,
  error,
  disabled,
  onChanged,
}: {
  question: FormQuestion;
  applicationId: string;
  documents: ApplicationDocument[];
  error?: AnswerError;
  disabled?: boolean;
  /** After an upload or a removal: the new list for this question and the application's new version. */
  onChanged: (documents: ApplicationDocument[], version: number | null) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const kinds = q.file_types ?? ["pdf"];
  const maxMb = q.max_size_mb ?? 10;
  const maxFiles = q.type === "cv" ? 1 : (q.max_files ?? 1);
  const full = documents.length >= maxFiles;
  const busy = progress !== null;

  function pick(replace: string | null) {
    setReplacing(replace);
    setProblem(null);
    input.current?.click();
  }

  function upload(file: File) {
    if (file.size > maxMb * 1024 * 1024) {
      setProblem(`Ce fichier fait ${sizeLabel(file.size)} : ${maxMb} Mo au plus pour cette question.`);
      return;
    }
    const body = new FormData();
    body.set("question_id", q.id);
    body.set("file", file);
    if (replacing) body.set("replaces", replacing);
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
      const r = xhr.response as { document?: ApplicationDocument; version?: number | null; error?: string } | null;
      if (xhr.status >= 200 && xhr.status < 300 && r?.document) {
        const added: ApplicationDocument = { ...r.document, status: "ready", created_at: new Date().toISOString() };
        onChanged([...documents.filter((d) => d.id !== replacing), added], r.version ?? null);
        setReplacing(null);
      } else {
        setProblem(r?.error ?? "L'envoi n'a pas abouti. Réessaie.");
      }
    };
    setProgress(0);
    xhr.send(body);
  }

  async function remove(documentId: string) {
    setProblem(null);
    const r = await removeApplicationDocument(documentId);
    if (!r.ok) return setProblem(r.message);
    onChanged(
      documents.filter((d) => d.id !== documentId),
      r.version || null,
    );
  }

  const message = problem ?? (error ? ANSWER_ERROR_LABEL[error] : null);

  return (
    <div role="group" aria-labelledby={`${id}-label`} aria-describedby={`${id}-hint`} className="flex flex-col gap-3">
      <p id={`${id}-label`} className="text-[0.95rem] font-bold leading-snug">
        {q.label}
        {!q.required && <span className="ml-1.5 font-normal text-subtle">(facultatif)</span>}
      </p>
      <p id={`${id}-hint`} className="type-small text-subtle">
        {[q.help, `${formatsLine(kinds, maxMb)}${maxFiles > 1 ? `, ${maxFiles} fichiers au plus` : ""}.`].filter(Boolean).join(" ")}
      </p>

      {documents.length > 0 && (
        <ul className="flex flex-col border-y border-line">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
              <a href={routes.applicationDocument(d.id)} className="inline-flex min-w-0 items-center gap-2 font-semibold hover:underline">
                <Icon name="file" size={18} className="shrink-0" />
                <span className="truncate">{d.file_name}</span>
                <span className="shrink-0 type-meta font-normal text-muted">{sizeLabel(d.size_bytes)}</span>
              </a>
              {!disabled && (
                <span className="flex gap-2">
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => pick(d.id)}>
                    Remplacer
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => remove(d.id)}>
                    Retirer
                  </Button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <input
        ref={input}
        type="file"
        accept={acceptFor(kinds)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) upload(file);
        }}
      />
      {!disabled && !full && (
        <Button type="button" variant="secondary" icon="upload" iconPosition="start" disabled={busy} className="self-start" onClick={() => pick(null)}>
          {documents.length > 0 ? "Ajouter un autre fichier" : "Choisir un fichier"}
        </Button>
      )}
      {busy && (
        <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
          <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-sunken">
            <div className={cx("h-full bg-assoc transition-[width]")} style={{ width: `${progress}%` }} />
          </div>
          <p className="type-small text-muted">Envoi… {progress} %</p>
        </div>
      )}
      {message && (
        <p role="alert" className="type-small font-semibold text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
