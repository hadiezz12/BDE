"use client";

import { useId } from "react";
import { cx } from "@/lib/cx";
import { ANSWER_ERROR_LABEL, maxLengthOf, type AnswerError, type FormQuestion } from "@/lib/recruitment/form";
import { Field, Input, Textarea } from "@/components/ui/Field";

/**
 * One question of an application form, as a controlled field: the answer is
 * kept as the database stores it (text, option id, list of option ids,
 * boolean, number, "YYYY-MM-DD"). Labels and help are the association's
 * plain text, rendered as text, never as HTML. Required questions are not
 * starred; optional ones say "(facultatif)", like every form of the site.
 */
export function QuestionField({
  question: q,
  value,
  error,
  disabled,
  onChange,
  onBlur,
}: {
  question: FormQuestion;
  value: unknown;
  error?: AnswerError;
  disabled?: boolean;
  onChange: (value: unknown) => void;
  onBlur?: () => void;
}) {
  const groupId = useId();
  const message = error ? ANSWER_ERROR_LABEL[error] : undefined;

  if (q.type === "single_choice" || q.type === "multiple_choice" || q.type === "yes_no") {
    const multiple = q.type === "multiple_choice";
    const options =
      q.type === "yes_no"
        ? [
            { id: "yes", label: "Oui" },
            { id: "no", label: "Non" },
          ]
        : (q.options ?? []);
    const picked = (id: string) =>
      q.type === "yes_no" ? (id === "yes" ? value === true : value === false) : multiple ? Array.isArray(value) && value.includes(id) : value === id;
    const toggle = (id: string, checked: boolean) => {
      if (q.type === "yes_no") return onChange(id === "yes");
      if (!multiple) return onChange(id);
      const list = Array.isArray(value) ? (value as string[]) : [];
      onChange(checked ? [...list.filter((x) => x !== id), id] : list.filter((x) => x !== id));
    };
    const hint = [
      q.help,
      multiple && q.max_selected ? `${q.max_selected} réponse${q.max_selected > 1 ? "s" : ""} au plus.` : null,
      multiple && q.min_selected ? `Au moins ${q.min_selected}.` : null,
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <fieldset
        aria-describedby={[hint ? `${groupId}-hint` : null, message ? `${groupId}-error` : null].filter(Boolean).join(" ") || undefined}
        aria-invalid={Boolean(error) || undefined}
        className="flex flex-col gap-2"
        onBlur={onBlur}
      >
        <legend className="mb-1 text-[0.95rem] font-bold leading-snug">
          {q.label}
          {!q.required && <span className="ml-1.5 font-normal text-subtle">(facultatif)</span>}
        </legend>
        <div className={cx("grid gap-2", q.type === "yes_no" ? "grid-cols-2 sm:max-w-sm" : "sm:grid-cols-2")}>
          {options.map((o) => (
            <label
              key={o.id}
              className="focus-ring-within flex min-h-12 cursor-pointer items-center gap-3 rounded-sm border-2 border-line bg-raised px-3.5 py-2.5 transition-colors hover:border-line-strong has-[:checked]:border-fg has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                name={`q-${q.id}`}
                value={o.id}
                checked={picked(o.id)}
                disabled={disabled}
                onChange={(e) => toggle(o.id, e.target.checked)}
                className="size-5 shrink-0 accent-accent"
              />
              <span className="font-semibold leading-snug">{o.label}</span>
            </label>
          ))}
        </div>
        {hint && (
          <p id={`${groupId}-hint`} className="type-small text-subtle">
            {hint}
          </p>
        )}
        {message && (
          <p id={`${groupId}-error`} role="alert" className="type-small font-semibold text-danger">
            {message}
          </p>
        )}
      </fieldset>
    );
  }

  const text = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
  const max = q.type === "short_text" || q.type === "long_text" ? maxLengthOf(q) : undefined;
  const counter = max ? `${text.trim().length.toLocaleString("fr-FR")} / ${max.toLocaleString("fr-FR")} caractères` : null;
  const bounds =
    q.type === "number" && (q.min !== undefined || q.max !== undefined)
      ? q.min !== undefined && q.max !== undefined
        ? `Entre ${q.min} et ${q.max}.`
        : q.min !== undefined
          ? `Au moins ${q.min}.`
          : `Au plus ${q.max}.`
      : null;
  const hint = [q.help, bounds, counter].filter(Boolean).join(" · ") || undefined;

  return (
    <Field label={q.label} hint={hint} error={message} optional={!q.required}>
      {({ id, describedBy, invalid }) =>
        q.type === "long_text" ? (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={text}
            maxLength={max ? max + 200 : undefined}
            rows={6}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
          />
        ) : (
          <Input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            value={text}
            disabled={disabled}
            type={q.type === "number" ? "number" : q.type === "date" ? "date" : q.type === "url" ? "url" : "text"}
            inputMode={q.type === "number" ? (q.integer ? "numeric" : "decimal") : q.type === "url" ? "url" : undefined}
            min={q.type === "number" ? q.min : q.type === "date" ? q.min_date : undefined}
            max={q.type === "number" ? q.max : q.type === "date" ? q.max_date : undefined}
            step={q.type === "number" ? (q.integer ? 1 : "any") : undefined}
            maxLength={q.type === "short_text" && max ? max + 50 : q.type === "url" ? 500 : undefined}
            placeholder={q.type === "url" ? "https://…" : undefined}
            autoComplete="off"
            onChange={(e) => {
              const v = e.target.value;
              if (q.type === "number") {
                if (v === "") return onChange(null);
                const n = Number(v.replace(",", "."));
                return onChange(Number.isFinite(n) ? n : v);
              }
              onChange(v === "" && q.type === "date" ? null : v);
            }}
            onBlur={onBlur}
          />
        )
      }
    </Field>
  );
}
