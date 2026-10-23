"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { normalizeTag } from "@/lib/posts/document";
import { POST_LIMITS } from "@/lib/posts/content";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";

/**
 * Keywords as chips: type one and press Entrée (or a comma), remove one with
 * its cross. Each is stored in its plain form ("Week-end d'intégration" →
 * week-end-d-integration), shown as such right away, eight at most.
 */
export function TagInput({
  tags,
  onChange,
  disabled,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = tags.length >= POST_LIMITS.tags;

  function add() {
    if (!draft.trim()) return;
    const tag = normalizeTag(draft);
    if (!tag) {
      setError("Un mot-clé compte au moins deux lettres ou chiffres.");
      return;
    }
    setDraft("");
    setError(null);
    if (!tags.includes(tag) && !full) onChange([...tags, tag]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[0.95rem] font-bold leading-snug">
        Mots-clés <span className="ml-1 font-normal text-subtle">(facultatif)</span>
      </label>
      {tags.length > 0 && (
        <ul aria-label="Mots-clés de l'article" className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li key={tag} className="inline-flex min-h-9 items-center rounded-sm border border-line-strong bg-raised pl-2.5">
              <span className="type-meta">
                <span aria-hidden className="text-subtle">
                  #
                </span>
                {tag}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                className="ml-1 inline-flex size-9 items-center justify-center rounded-sm text-muted hover:bg-fg/8 hover:text-fg disabled:hidden"
              >
                <Icon name="close" size={14} />
                <span className="sr-only">Retirer le mot-clé {tag}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          id={id}
          value={draft}
          disabled={disabled || full}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={onKeyDown}
          maxLength={40}
          autoComplete="off"
          enterKeyHint="done"
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
          aria-invalid={error ? true : undefined}
          placeholder={full ? undefined : "Ex : soirée de rentrée"}
          className="min-w-0"
        />
        <Button type="button" variant="secondary" size="sm" disabled={disabled || full || !draft.trim()} onClick={add}>
          Ajouter
        </Button>
      </div>
      <p id={`${id}-hint`} className="type-small text-subtle">
        {full
          ? `${POST_LIMITS.tags} mots-clés au plus : retire-en un pour en ajouter un autre.`
          : `Pour retrouver l'article dans la recherche du fil. ${tags.length} / ${POST_LIMITS.tags}.`}
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="type-small font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
