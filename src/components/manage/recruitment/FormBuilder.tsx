"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { discardFormDraft, publishForm, saveRecruitmentForm } from "@/app/actions/recruitment";
import type { GovernanceActionState } from "@/app/actions/governance";
import {
  FORM_LIMITS,
  QUESTION_TYPES,
  QUESTION_TYPE_LABEL,
  cleanQuestion,
  formProblem,
  idFrom,
  move,
  newQuestion,
  type FormOption,
  type FormQuestion,
  type FormSchema,
  type QuestionType,
} from "@/lib/recruitment/form";
import { KIND_LABEL } from "@/lib/recruitment/documents";
import type { DocumentKind } from "@/lib/types";
import { cx } from "@/lib/cx";
import { Button } from "@/components/ui/Button";
import { Checkbox, Input, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";

/**
 * The application form builder. The form is one document (sections, then
 * questions with stable ids) saved as the campaign's draft version
 * (save_recruitment_form, with the edit version this tab loaded: a
 * teammate's newer save is never overwritten). The version candidates use
 * never changes here: once the campaign is online, "Publier cette version"
 * makes the draft the next version; applications already sent keep theirs.
 * Questions are data the site renders as text — no HTML, no script.
 * Reordering uses buttons (keyboard and screen readers), not drag and drop.
 */

export interface BuilderProps {
  campaignId: string;
  asso: string;
  /** The draft (or the live version to start from, or an empty form). */
  schema: FormSchema;
  editVersion: number;
  draftNumber: number | null;
  live: { number: number; publishedAt: string } | null;
  positions: { id: string; title: string }[];
  /** recruitment.questions.manage, and the association can write. */
  editable: boolean;
  /** Online once and recruitment.campaigns.publish: the draft can become the next version. */
  canPublishVersion: boolean;
  firstPublished: boolean;
  hasDraft: boolean;
}

type Target = { scope: "shared"; section: string } | { scope: string; section?: undefined };

const KINDS: DocumentKind[] = ["pdf", "docx", "image"];

export function FormBuilder(props: BuilderProps) {
  const { campaignId, asso, positions, editable } = props;
  const [schema, setSchema] = useState<FormSchema>(props.schema);
  const [editVersion, setEditVersion] = useState(props.editVersion);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string; at: number } | null>(null);
  const [hasDraft, setHasDraft] = useState(props.hasDraft);
  const [conflict, setConflict] = useState(false);
  const positionIds = useMemo(() => positions.map((p) => p.id), [positions]);
  const problem = useMemo(() => formProblem(schema, positionIds), [schema, positionIds]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function update(next: FormSchema) {
    setSchema(next);
    setDirty(true);
    setOutcome(null);
  }

  const setQuestion = (id: string, patch: Partial<FormQuestion>) =>
    update({ ...schema, questions: schema.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) });

  async function save() {
    if (problem) {
      setOutcome({ ok: false, message: problem, at: Date.now() });
      return;
    }
    setSaving(true);
    const clean: FormSchema = {
      sections: schema.sections.map((s) => ({ id: s.id, title: s.title.trim(), ...(s.description?.trim() ? { description: s.description.trim() } : {}) })),
      questions: schema.questions.map(cleanQuestion),
    };
    const r = await saveRecruitmentForm(campaignId, editVersion, clean, positionIds);
    setSaving(false);
    if (!r.ok) {
      if (r.code === "draft_conflict") setConflict(true);
      setOutcome({
        ok: false,
        message:
          r.code === "draft_conflict"
            ? "Quelqu'un a enregistré le formulaire entre-temps. Recharge la page pour voir sa version (tes changements ici ne sont pas enregistrés)."
            : r.message,
        at: Date.now(),
      });
      return;
    }
    setEditVersion(r.editVersion);
    setDirty(false);
    setHasDraft(true);
    setOutcome({
      ok: true,
      message: props.firstPublished
        ? "Brouillon du formulaire enregistré. Les candidat·es voient toujours la version en ligne, jusqu'à ce que tu publies celle-ci."
        : "Formulaire enregistré. Il part en ligne avec le recrutement.",
      at: Date.now(),
    });
  }

  function add(type: QuestionType, target: Target) {
    if (schema.questions.length >= FORM_LIMITS.questions) return;
    const q = newQuestion(type, schema, target.scope);
    if (target.scope === "shared") q.section = target.section;
    // A new question goes at the end of its group (the global order keeps groups together).
    const questions = [...schema.questions];
    let at = -1;
    questions.forEach((x, i) => {
      if (x.scope === target.scope && (target.scope !== "shared" || x.section === target.section)) at = i;
    });
    questions.splice(at >= 0 ? at + 1 : questions.length, 0, q);
    update({ ...schema, questions });
    requestAnimationFrame(() => document.getElementById(`q-${q.id}-label`)?.focus());
  }

  function moveQuestion(id: string, direction: -1 | 1) {
    const q = schema.questions.find((x) => x.id === id)!;
    const group = schema.questions.filter((x) => x.scope === q.scope && (q.scope !== "shared" || x.section === q.section));
    const i = group.findIndex((x) => x.id === id);
    const other = group[i + direction];
    if (!other) return;
    const a = schema.questions.indexOf(q);
    const b = schema.questions.indexOf(other);
    const questions = [...schema.questions];
    [questions[a], questions[b]] = [questions[b], questions[a]];
    update({ ...schema, questions });
  }

  function addSection() {
    if (schema.sections.length >= FORM_LIMITS.sections) return;
    const id = idFrom(`partie ${schema.sections.length + 1}`, schema.sections.map((s) => s.id), "s");
    update({ ...schema, sections: [...schema.sections, { id, title: `Partie ${schema.sections.length + 1}` }] });
  }

  const disabled = !editable || conflict;
  const groups: { key: string; title: string; target: Target; questions: FormQuestion[]; sectionIndex?: number }[] = [
    ...schema.sections.map((s, i) => ({
      key: `s-${s.id}`,
      title: s.title || `Partie ${i + 1}`,
      target: { scope: "shared", section: s.id } as Target,
      questions: schema.questions.filter((q) => q.scope === "shared" && q.section === s.id),
      sectionIndex: i,
    })),
    ...positions.map((p) => ({
      key: `p-${p.id}`,
      title: `Pour le poste « ${p.title} »`,
      target: { scope: p.id } as Target,
      questions: schema.questions.filter((q) => q.scope === p.id),
    })),
  ];
  // Questions whose position was deleted (kept until removed, the database refuses them).
  const orphans = schema.questions.filter((q) => q.scope !== "shared" && !positionIds.includes(q.scope));

  return (
    <div className="flex flex-col gap-8">
      <aside className="flex items-start gap-3 rounded-sm border-2 border-fg bg-raised p-4">
        <Icon name="shield" size={20} className="mt-0.5 shrink-0" />
        <div className="flex flex-col gap-1.5 type-small">
          <p className="font-bold">Ne demande que ce qui sert à choisir.</p>
          <p className="text-muted">
            Le nom, l&apos;e-mail, le programme et l&apos;année viennent déjà du profil : inutile de les redemander. Pas de questions
            sur la santé, la religion, les opinions politiques ou syndicales, l&apos;orientation sexuelle ou l&apos;origine, ni de
            photo d&apos;identité ou de numéro de pièce d&apos;identité.
          </p>
        </div>
      </aside>

      <VersionLine live={props.live} draftNumber={props.draftNumber} hasDraft={hasDraft} firstPublished={props.firstPublished} />

      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`${g.key}-titre`} className="flex flex-col gap-4">
          {g.sectionIndex !== undefined ? (
            <SectionHeaderEditor
              section={schema.sections[g.sectionIndex]}
              index={g.sectionIndex}
              count={schema.sections.length}
              empty={g.questions.length === 0}
              disabled={disabled}
              headingId={`${g.key}-titre`}
              onChange={(patch) =>
                update({ ...schema, sections: schema.sections.map((s, i) => (i === g.sectionIndex ? { ...s, ...patch } : s)) })
              }
              onMove={(d) => update({ ...schema, sections: move(schema.sections, g.sectionIndex!, d) })}
              onRemove={() => update({ ...schema, sections: schema.sections.filter((_, i) => i !== g.sectionIndex) })}
            />
          ) : (
            <h3 id={`${g.key}-titre`} className="border-t-2 border-fg pt-3 type-card">
              {g.title}
              <span className="ml-2 type-meta font-normal text-muted">seulement les candidat·es à ce poste</span>
            </h3>
          )}
          {g.questions.length === 0 && <p className="type-small text-muted">Pas de question ici.</p>}
          <ol className="flex flex-col gap-3">
            {g.questions.map((q, i) => (
              <li key={q.id}>
                <QuestionEditor
                  question={q}
                  index={i}
                  count={g.questions.length}
                  sections={schema.sections}
                  positions={positions}
                  disabled={disabled}
                  onChange={(patch) => setQuestion(q.id, patch)}
                  onMove={(d) => moveQuestion(q.id, d)}
                  onRemove={() => update({ ...schema, questions: schema.questions.filter((x) => x.id !== q.id) })}
                />
              </li>
            ))}
          </ol>
          {!disabled && <AddQuestion onAdd={(t) => add(t, g.target)} hasCv={schema.questions.some((q) => q.type === "cv")} />}
        </section>
      ))}

      {orphans.length > 0 && (
        <section className="flex flex-col gap-3 rounded-sm border-2 border-danger/50 p-4">
          <p className="type-small font-bold text-danger">Questions d&apos;un poste supprimé : retire-les pour enregistrer.</p>
          {orphans.map((q) => (
            <div key={q.id} className="flex items-center justify-between gap-3">
              <span>{q.label || QUESTION_TYPE_LABEL[q.type]}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => update({ ...schema, questions: schema.questions.filter((x) => x.id !== q.id) })}>
                Retirer
              </Button>
            </div>
          ))}
        </section>
      )}

      {!disabled && schema.sections.length < FORM_LIMITS.sections && (
        <Button type="button" variant="secondary" icon="plus" iconPosition="start" className="self-start" onClick={addSection}>
          Ajouter une partie
        </Button>
      )}

      {editable && (
        <div className="sticky bottom-[calc(var(--tabbar-h,0px)+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-col gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur-sm sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" icon="check" iconPosition="start" onClick={save} disabled={saving || conflict || !dirty}>
              {saving ? "Enregistrement…" : props.firstPublished ? "Enregistrer le brouillon" : "Enregistrer le formulaire"}
            </Button>
            <span className="type-small text-muted" aria-live="polite">
              {dirty ? "Modifications non enregistrées" : `${schema.questions.length} question${schema.questions.length > 1 ? "s" : ""}`}
            </span>
          </div>
          {problem && dirty && (
            <p className="flex items-start gap-1.5 type-small font-semibold text-warn">
              <Icon name="alert" size={15} className="mt-0.5 shrink-0" />
              {problem}
            </p>
          )}
          {outcome && (
            <p
              key={outcome.at}
              role={outcome.ok ? "status" : "alert"}
              className={cx("flex items-start gap-1.5 type-small font-semibold", outcome.ok ? "text-ok" : "text-danger")}
            >
              <Icon name={outcome.ok ? "check" : "alert"} size={15} className="mt-0.5 shrink-0" />
              {outcome.message}
            </p>
          )}
        </div>
      )}

      {props.firstPublished && hasDraft && (
        <VersionActions
          campaignId={campaignId}
          asso={asso}
          canPublish={props.canPublishVersion && !dirty}
          canDiscard={editable && Boolean(props.live)}
          dirty={dirty}
          nextNumber={props.draftNumber ?? (props.live ? props.live.number + 1 : 1)}
        />
      )}
    </div>
  );
}

function VersionLine({
  live,
  draftNumber,
  hasDraft,
  firstPublished,
}: {
  live: BuilderProps["live"];
  draftNumber: number | null;
  hasDraft: boolean;
  firstPublished: boolean;
}) {
  if (!firstPublished) {
    return (
      <p className="type-small text-muted">
        Le formulaire part en ligne avec le recrutement : sa première version est figée à la publication. Ensuite, chaque changement
        devient une nouvelle version, publiée quand tu le décides.
      </p>
    );
  }
  return (
    <p className="type-small text-muted">
      En ligne : <strong className="text-fg">version {live?.number ?? 1}</strong>
      {hasDraft ? ` · tu modifies le brouillon de la version ${draftNumber ?? (live ? live.number + 1 : 2)}` : ""}. Les candidatures déjà
      envoyées gardent la version sur laquelle elles ont été remplies.
    </p>
  );
}

function SectionHeaderEditor({
  section,
  index,
  count,
  empty,
  disabled,
  headingId,
  onChange,
  onMove,
  onRemove,
}: {
  section: FormSchema["sections"][number];
  index: number;
  count: number;
  empty: boolean;
  disabled: boolean;
  headingId: string;
  onChange: (patch: Partial<FormSchema["sections"][number]>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t-2 border-fg pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="type-label text-muted">
          Partie {index + 1} · pour tout le monde
        </h3>
        {!disabled && (
          <div className="flex items-center gap-1">
            <IconButton icon="up" label={`Monter la partie ${index + 1}`} disabled={index === 0} onClick={() => onMove(-1)} />
            <IconButton icon="down" label={`Descendre la partie ${index + 1}`} disabled={index === count - 1} onClick={() => onMove(1)} />
            {empty && count > 1 && (
              <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
                Supprimer la partie
              </Button>
            )}
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="type-caption">Titre de la partie</span>
          <Input value={section.title} maxLength={FORM_LIMITS.sectionTitle} disabled={disabled} onChange={(e) => onChange({ title: e.target.value })} />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="type-caption">Sous-titre (facultatif)</span>
          <Input
            value={section.description ?? ""}
            maxLength={FORM_LIMITS.sectionDescription}
            disabled={disabled}
            onChange={(e) => onChange({ description: e.target.value || undefined })}
          />
        </label>
      </div>
    </div>
  );
}

function IconButton({ icon, label, disabled, onClick }: { icon: "up" | "down"; label: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-sm border border-line text-fg transition-colors hover:border-fg disabled:opacity-30"
    >
      <Icon name="chevron-down" size={16} className={cx(icon === "up" && "rotate-180")} />
    </button>
  );
}

function QuestionEditor({
  question: q,
  index,
  count,
  sections,
  positions,
  disabled,
  onChange,
  onMove,
  onRemove,
}: {
  question: FormQuestion;
  index: number;
  count: number;
  sections: FormSchema["sections"];
  positions: { id: string; title: string }[];
  disabled: boolean;
  onChange: (patch: Partial<FormQuestion>) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const where = q.scope === "shared" ? `shared:${q.section}` : q.scope;
  return (
    <article aria-labelledby={`q-${q.id}-titre`} className="rounded-sm border-2 border-line bg-raised p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <p id={`q-${q.id}-titre`} className="type-label text-muted">
          {index + 1}. {QUESTION_TYPE_LABEL[q.type]}
          {q.required ? " · obligatoire" : " · facultative"}
        </p>
        {!disabled && (
          <div className="flex items-center gap-1">
            <IconButton icon="up" label={`Monter la question ${index + 1}`} disabled={index === 0} onClick={() => onMove(-1)} />
            <IconButton icon="down" label={`Descendre la question ${index + 1}`} disabled={index === count - 1} onClick={() => onMove(1)} />
            <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
              Supprimer
            </Button>
          </div>
        )}
      </header>
      <fieldset disabled={disabled} className="mt-3 flex min-w-0 flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-[0.95rem] font-bold">Question</span>
          <Input
            id={`q-${q.id}-label`}
            value={q.label}
            maxLength={FORM_LIMITS.label}
            placeholder={q.type === "cv" ? "Ton CV" : "Ex : Pourquoi veux-tu rejoindre l'asso ?"}
            aria-invalid={!q.label.trim() || undefined}
            onChange={(e) => onChange({ label: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="type-caption">Aide sous la question (facultatif)</span>
          <Input value={q.help ?? ""} maxLength={FORM_LIMITS.help} onChange={(e) => onChange({ help: e.target.value || undefined })} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Checkbox label="Obligatoire" checked={q.required} onChange={(e) => onChange({ required: e.target.checked })} />
          <label className="flex min-w-0 flex-col gap-1">
            <span className="type-caption">Pour qui</span>
            <Select
              value={where}
              onChange={(e) => {
                const v = e.target.value;
                if (v.startsWith("shared:")) onChange({ scope: "shared", section: v.slice(7) });
                else onChange({ scope: v, section: undefined });
              }}
            >
              {sections.map((s, i) => (
                <option key={s.id} value={`shared:${s.id}`}>
                  Tout le monde · {s.title || `Partie ${i + 1}`}
                </option>
              ))}
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  Le poste « {p.title} » seulement
                </option>
              ))}
            </Select>
          </label>
        </div>
        <TypeSettings question={q} onChange={onChange} />
      </fieldset>
    </article>
  );
}

function TypeSettings({ question: q, onChange }: { question: FormQuestion; onChange: (patch: Partial<FormQuestion>) => void }) {
  const num = (v: string) => (v === "" ? undefined : Number(v));
  switch (q.type) {
    case "short_text":
    case "long_text": {
      const max = q.type === "short_text" ? FORM_LIMITS.shortText : FORM_LIMITS.longText;
      return (
        <label className="flex max-w-xs flex-col gap-1">
          <span className="type-caption">Longueur maximale (caractères)</span>
          <Input type="number" min={1} max={max.max} placeholder={String(max.default)} value={q.max_length ?? ""} onChange={(e) => onChange({ max_length: num(e.target.value) })} />
        </label>
      );
    }
    case "single_choice":
    case "multiple_choice":
      return (
        <div className="flex flex-col gap-3">
          <OptionsEditor options={q.options ?? []} onChange={(options) => onChange({ options })} />
          {q.type === "multiple_choice" && (
            <div className="grid max-w-md grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="type-caption">Au moins</span>
                <Input type="number" min={0} max={q.options?.length ?? 30} value={q.min_selected ?? ""} onChange={(e) => onChange({ min_selected: num(e.target.value) })} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="type-caption">Au plus</span>
                <Input type="number" min={1} max={q.options?.length ?? 30} value={q.max_selected ?? ""} onChange={(e) => onChange({ max_selected: num(e.target.value) })} />
              </label>
            </div>
          )}
        </div>
      );
    case "number":
      return (
        <div className="grid max-w-md grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="type-caption">Minimum</span>
            <Input type="number" value={q.min ?? ""} onChange={(e) => onChange({ min: num(e.target.value) })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="type-caption">Maximum</span>
            <Input type="number" value={q.max ?? ""} onChange={(e) => onChange({ max: num(e.target.value) })} />
          </label>
          <Checkbox className="col-span-2" label="Nombre entier seulement" checked={Boolean(q.integer)} onChange={(e) => onChange({ integer: e.target.checked || undefined })} />
        </div>
      );
    case "date":
      return (
        <div className="grid max-w-md grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="type-caption">À partir du</span>
            <Input type="date" value={q.min_date ?? ""} onChange={(e) => onChange({ min_date: e.target.value || undefined })} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="type-caption">Jusqu&apos;au</span>
            <Input type="date" value={q.max_date ?? ""} onChange={(e) => onChange({ max_date: e.target.value || undefined })} />
          </label>
        </div>
      );
    case "file":
    case "cv": {
      const allowed = q.type === "cv" ? (["pdf", "docx"] as DocumentKind[]) : KINDS;
      const kinds = q.file_types ?? [];
      return (
        <div className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="type-caption">Formats acceptés</legend>
            <div className="flex flex-wrap gap-x-5">
              {allowed.map((k) => (
                <Checkbox
                  key={k}
                  label={KIND_LABEL[k]}
                  checked={kinds.includes(k)}
                  onChange={(e) => onChange({ file_types: e.target.checked ? [...kinds.filter((x) => x !== k), k] : kinds.filter((x) => x !== k) })}
                />
              ))}
            </div>
          </fieldset>
          <div className="grid max-w-md grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="type-caption">Taille maximale (Mo)</span>
              <Select value={String(q.max_size_mb ?? 10)} onChange={(e) => onChange({ max_size_mb: Number(e.target.value) })}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} Mo
                  </option>
                ))}
              </Select>
            </label>
            {q.type === "file" && (
              <label className="flex flex-col gap-1">
                <span className="type-caption">Fichiers au plus</span>
                <Select value={String(q.max_files ?? 1)} onChange={(e) => onChange({ max_files: Number(e.target.value) })}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </label>
            )}
          </div>
          <p className="type-small text-subtle">
            Les fichiers restent privés : ni l&apos;asso, ni le BDE ne les ouvrent pour l&apos;instant. Le site vérifie le vrai format
            de chaque fichier, mais ne les analyse pas contre les virus.
          </p>
        </div>
      );
    }
    default:
      return null;
  }
}

function OptionsEditor({ options, onChange }: { options: FormOption[]; onChange: (options: FormOption[]) => void }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="type-caption">Choix proposés (de 2 à 30)</legend>
      <ol className="flex flex-col gap-2">
        {options.map((o, i) => (
          <li key={o.id} className="flex items-center gap-2">
            <Input
              aria-label={`Choix ${i + 1}`}
              value={o.label}
              maxLength={FORM_LIMITS.optionLabel}
              onChange={(e) => onChange(options.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))}
            />
            <IconButton icon="up" label={`Monter le choix ${i + 1}`} disabled={i === 0} onClick={() => onChange(move(options, i, -1))} />
            <IconButton icon="down" label={`Descendre le choix ${i + 1}`} disabled={i === options.length - 1} onClick={() => onChange(move(options, i, 1))} />
            <Button type="button" variant="ghost" size="sm" disabled={options.length <= 2} onClick={() => onChange(options.filter((x) => x.id !== o.id))}>
              Retirer
            </Button>
          </li>
        ))}
      </ol>
      {options.length < FORM_LIMITS.options && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon="plus"
          iconPosition="start"
          className="self-start"
          onClick={() => {
            const label = `Choix ${options.length + 1}`;
            onChange([...options, { id: idFrom(label, options.map((x) => x.id), "choix"), label }]);
          }}
        >
          Ajouter un choix
        </Button>
      )}
    </fieldset>
  );
}

function AddQuestion({ onAdd, hasCv }: { onAdd: (type: QuestionType) => void; hasCv: boolean }) {
  const [type, setType] = useState<QuestionType>("long_text");
  const choices = QUESTION_TYPES.filter((t) => t.type !== "cv" || !hasCv);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex min-w-0 flex-col gap-1">
        <span className="type-caption">Nouvelle question</span>
        <Select value={type} onChange={(e) => setType(e.target.value as QuestionType)}>
          {choices.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label}
              {t.hint ? ` — ${t.hint}` : ""}
            </option>
          ))}
        </Select>
      </label>
      <Button type="button" variant="secondary" icon="plus" iconPosition="start" onClick={() => onAdd(choices.some((c) => c.type === type) ? type : "long_text")}>
        Ajouter
      </Button>
    </div>
  );
}

function VersionActions({
  campaignId,
  asso,
  canPublish,
  canDiscard,
  dirty,
  nextNumber,
}: {
  campaignId: string;
  asso: string;
  canPublish: boolean;
  canDiscard: boolean;
  dirty: boolean;
  nextNumber: number;
}) {
  const [published, publish, publishing] = useActionState<GovernanceActionState, FormData>(publishForm, { status: "idle" });
  const [discarded, discard, discarding] = useActionState<GovernanceActionState, FormData>(discardFormDraft, { status: "idle" });
  const [confirm, setConfirm] = useState(false);
  return (
    <section aria-labelledby="version-titre" className="flex flex-col gap-3 rounded-sm border-2 border-fg bg-raised p-4">
      <h3 id="version-titre" className="type-label">
        Version {nextNumber} du formulaire
      </h3>
      <p className="type-small text-muted">
        Publier en fait le formulaire des nouvelles candidatures. Celles déjà envoyées gardent leur version ; les candidat·es qui ont
        un brouillon sont prévenu·es et passent à la nouvelle version avant d&apos;envoyer.
      </p>
      {dirty && <p className="type-small font-semibold">Enregistre d&apos;abord tes modifications.</p>}
      <div className="flex flex-wrap gap-3">
        {canPublish && (
          <form action={publish}>
            <input type="hidden" name="campaign_id" value={campaignId} />
            <input type="hidden" name="organization_slug" value={asso} />
            {confirm ? (
              <span className="flex flex-wrap items-center gap-2">
                <Button type="submit" disabled={publishing}>
                  {publishing ? "Publication…" : `Oui, publier la version ${nextNumber}`}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirm(false)}>
                  Pas encore
                </Button>
              </span>
            ) : (
              <Button type="button" icon="arrow-right" onClick={() => setConfirm(true)}>
                Publier cette version
              </Button>
            )}
          </form>
        )}
        {canDiscard && (
          <form action={discard}>
            <input type="hidden" name="campaign_id" value={campaignId} />
            <input type="hidden" name="organization_slug" value={asso} />
            <Button type="submit" variant="ghost" disabled={discarding}>
              Abandonner ce brouillon
            </Button>
          </form>
        )}
      </div>
      {!canPublish && !dirty && (
        <p className="type-small text-muted">Publier une version demande le droit « Publier les recrutements » et la double authentification.</p>
      )}
      {[published, discarded].map(
        (s, i) =>
          s.status === "error" &&
          s.message && (
            <p key={`${i}-${s.at}`} role="alert" className="type-small font-semibold text-danger">
              {s.message}
            </p>
          ),
      )}
    </section>
  );
}

