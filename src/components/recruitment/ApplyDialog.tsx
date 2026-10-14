"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import type { AccentKey, ApplicationAttachmentSpec, ApplicationFormSpec, ApplicationQuestion } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/format";
import { Dialog } from "@/components/ui/Dialog";
import { Button, ButtonLink, buttonClass } from "@/components/ui/Button";
import { Checkbox, ChoiceGroup, Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { RequirementsList } from "./RequirementsList";

/**
 * The application form of a campaign, opened by ApplyProvider. Phase 1 demo:
 * it validates what the fiche says is required, then says plainly that
 * nothing was sent. Inputs are uncontrolled and the dialog stays mounted when
 * closed, so the draft survives closing and reopening (until a reload).
 */

export interface ApplyPosition {
  id: string;
  title: string;
  team?: string;
  seats: number;
  /** "ferme le 21 oct. à 23h59", when the role closes before the campaign. */
  closesEarly?: string;
}

/** Everything the dialog needs, prepared and worded on the server (see apply-form.ts). */
export interface ApplyFormData {
  campaignTitle: string;
  associationName: string;
  accent: AccentKey;
  /** "Clôture le 19 octobre à 23h59". */
  deadline: string;
  /** Roles still open, in fiche order. */
  positions: ApplyPosition[];
  spec: ApplicationFormSpec;
  requirements: string[];
  /** Null for visitors: the dialog explains that applying needs an account. */
  applicant: { name: string; programme: string; email: string } | null;
  /** The student's own application to this campaign, if there is one. */
  existing: { id: string; positionId: string; positionTitle: string; statusLabel: string; draft: boolean } | null;
}

interface ApplyDialogProps {
  form: ApplyFormData;
  open: boolean;
  onClose: () => void;
  /** Increments on every opening: hides the demo notice, keeps the draft. */
  openKey: number;
  positionId?: string;
  /** Increments when a specific role is asked for: re-preselects it. */
  choiceKey: number;
}

export function ApplyDialog({ form, open, onClose, openKey, positionId, choiceKey }: ApplyDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      label={`Candidater : ${form.campaignTitle}, ${form.associationName}`}
      variant="screen"
      surface="paper"
      className="sm:max-h-[84dvh]"
    >
      <div data-accent={form.accent} className="flex min-h-0 flex-1 flex-col">
        <header className="relative flex shrink-0 items-start justify-between gap-4 border-b-2 border-fg px-4 pb-4 pt-6 sm:px-7">
          <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-assoc sm:rounded-t-[6px]" />
          <div className="flex min-w-0 flex-col gap-1.5">
            <p className="type-label text-assoc-text">Candidature · {form.associationName}</p>
            <h2 className="type-card text-[1.45rem] break-words hyphens-auto sm:text-[1.65rem]">{form.campaignTitle}</h2>
            <p className="type-meta text-muted">{form.deadline}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="-mr-2 -mt-1 inline-grid size-11 shrink-0 place-items-center rounded-sm transition-colors hover:bg-fg/8"
          >
            <Icon name="close" size={22} />
          </button>
        </header>

        {form.applicant ? (
          <ApplicationForm
            form={form}
            applicant={form.applicant}
            onClose={onClose}
            openKey={openKey}
            positionId={positionId}
            choiceKey={choiceKey}
          />
        ) : (
          <SignInRequired form={form} onClose={onClose} />
        )}
      </div>
    </Dialog>
  );
}

/* ---- Visitor ------------------------------------------------------------ */

function SignInRequired({ form, onClose }: { form: ApplyFormData; onClose: () => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 sm:px-7">
      <div className="flex flex-col gap-4 border-b border-line pb-7">
        <p className="flex items-center gap-2 type-label text-muted">
          <Icon name="lock" size={14} />
          Compte nécessaire
        </p>
        <h3 className="type-card text-[1.35rem]">Connecte-toi pour candidater.</h3>
        <p className="text-muted">
          Ta candidature est liée à ton compte : c&apos;est là que tu suis sa lecture, l&apos;entretien et la réponse de{" "}
          {form.associationName}. La fiche, elle, reste lisible sans compte.
        </p>
        <div className="mt-1 flex flex-wrap gap-3">
          <ButtonLink href={routes.login} icon="arrow-right">
            Se connecter
          </ButtonLink>
          <Button variant="secondary" onClick={onClose}>
            Continuer à lire
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-4 pt-7">
        <h3 className="type-label text-muted">Ce qu&apos;on te demandera</h3>
        <RequirementsList items={form.requirements} />
      </div>
    </div>
  );
}

/* ---- Student ------------------------------------------------------------ */

const MAX_FILE_BYTES = 10 * 1024 * 1024;

const REQUIRED: Record<ApplicationQuestion["kind"], string> = {
  long: "Écris quelques lignes ici, même courtes.",
  short: "Ce champ est à remplir.",
  tel: "Indique ton numéro de téléphone.",
  choice: "Choisis une option.",
};

type Errors = Record<string, string>;
type PickedFile = { name: string; size: number };

const questionName = (q: ApplicationQuestion) => `q-${q.id}`;
const attachmentName = (a: ApplicationAttachmentSpec) => `f-${a.id}`;
const appliesTo = (onlyFor: string[] | undefined, positionId: string | undefined) =>
  !onlyFor || (positionId !== undefined && onlyFor.includes(positionId));

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

function isPhone(value: string): boolean {
  return /^(?:\+\d{10,14}|0\d{9})$/.test(value.replace(/[\s.\-()]/g, ""));
}

function ApplicationForm({
  form,
  applicant,
  onClose,
  openKey,
  positionId,
  choiceKey,
}: Omit<ApplyDialogProps, "open"> & { applicant: NonNullable<ApplyFormData["applicant"]> }) {
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const positionErrorId = `${uid}-position-error`;
  const consentErrorId = `${uid}-consent-error`;

  const only = form.positions.length === 1 ? form.positions[0].id : undefined;
  const preselect = positionId && form.positions.some((p) => p.id === positionId) ? positionId : only;

  // The role currently ticked: re-seeded whenever a specific role is asked for.
  const [choice, setChoice] = useState({ key: choiceKey, value: preselect });
  if (choice.key !== choiceKey) setChoice({ key: choiceKey, value: preselect });
  const picked = choice.value;

  const [errors, setErrors] = useState<Errors>({});
  const [attempt, setAttempt] = useState(0);
  const [checkedKey, setCheckedKey] = useState<number | null>(null);
  const [lengths, setLengths] = useState<Record<string, number>>({});
  const [files, setFiles] = useState<Record<string, PickedFile | null>>({});

  const noticeVisible = checkedKey === openKey;
  const existing = form.existing;
  const alreadyApplied = existing && !existing.draft ? existing.positionId : undefined;

  const questions = form.spec.questions.map((q) => ({ q, name: questionName(q), active: appliesTo(q.onlyFor, picked) }));
  const attachments = form.spec.attachments.map((a) => ({
    a,
    name: attachmentName(a),
    active: appliesTo(a.onlyFor, picked),
  }));

  // Labels for the error summary, in the order fields appear. Fields hidden
  // since (another role picked) drop out: their error can't be fixed there.
  const fieldLabels: [string, string][] = [
    ["position", "Le poste"],
    ...questions.filter((x) => x.active).map(({ q, name }): [string, string] => [name, q.label]),
    ...attachments.filter((x) => x.active).map(({ a, name }): [string, string] => [name, a.label]),
    ["consent", "Ton accord"],
  ];
  const errorEntries = fieldLabels.filter(([name]) => errors[name]);

  useEffect(() => {
    if (attempt > 0) summaryRef.current?.focus();
  }, [attempt]);

  function clearError(name: string) {
    setErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function handleChange(target: EventTarget) {
    if (
      !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)
    ) {
      return;
    }
    const { name } = target;
    if (!name) return;
    if (name === "position") setChoice((c) => ({ ...c, value: target.value }));
    if (target instanceof HTMLInputElement && target.type === "file") {
      const file = target.files?.[0];
      setFiles((prev) => ({ ...prev, [name]: file ? { name: file.name, size: file.size } : null }));
    } else if (target instanceof HTMLTextAreaElement || target.type === "text") {
      setLengths((prev) => ({ ...prev, [name]: target.value.length }));
    }
    clearError(name);
  }

  function validate(el: HTMLFormElement): Errors {
    const data = new FormData(el);
    const next: Errors = {};
    const position = data.get("position");
    if (!position) next.position = "Choisis le poste qui t'intéresse.";
    else if (position === alreadyApplied) next.position = "Tu as déjà candidaté à ce poste : suis ta candidature depuis ton espace.";

    for (const { q, name, active } of questions) {
      if (!active) continue;
      const value = String(data.get(name) ?? "").trim();
      if (!value) {
        if (!q.optional) next[name] = REQUIRED[q.kind];
      } else if (q.kind === "tel" && !isPhone(value)) {
        next[name] = "Ce numéro ne ressemble pas à un numéro de téléphone : 10 chiffres, ou +33…";
      }
    }

    for (const { a, name, active } of attachments) {
      if (!active) continue;
      const entry = data.get(name);
      const file = entry instanceof File && entry.name ? entry : null;
      if (!file) {
        if (!a.optional) next[name] = "Ajoute ce fichier pour pouvoir candidater.";
      } else if (file.size > MAX_FILE_BYTES) {
        next[name] = `Ce fichier fait ${formatSize(file.size)} : la limite est de 10 Mo.`;
      }
    }

    if (!data.get("consent")) next.consent = "Coche cette case pour pouvoir envoyer ta candidature.";
    return next;
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const next = validate(e.currentTarget);
    setErrors(next);
    if (Object.keys(next).length > 0) {
      setCheckedKey(null);
      setAttempt((n) => n + 1);
      return;
    }
    // Phase 1: nothing leaves the browser. Say so, keep the draft.
    setCheckedKey(openKey);
  }

  function focusField(name: string) {
    const item = formRef.current?.elements.namedItem(name);
    const target =
      item instanceof RadioNodeList
        ? ((Array.from(item).find((r) => (r as HTMLInputElement).checked) ?? item[0]) as HTMLElement | undefined)
        : (item as HTMLElement | null);
    target?.closest("[data-field]")?.scrollIntoView({ block: "center" });
    target?.focus({ preventScroll: true });
  }

  function clearFile(name: string) {
    const input = formRef.current?.elements.namedItem(name);
    if (input instanceof HTMLInputElement) {
      input.value = "";
      input.focus();
    }
    setFiles((prev) => ({ ...prev, [name]: null }));
  }

  const activeAttachments = attachments.filter((x) => x.active);

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={handleSubmit}
      onChange={(e) => handleChange(e.target)}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto overscroll-contain px-4 py-6 sm:px-7">
        {existing && (
          <div className="flex items-start gap-3.5 rounded-sm border-2 border-fg bg-raised p-4">
            <Icon name={existing.draft ? "edit" : "check"} size={20} className="mt-0.5 shrink-0 text-assoc-text" />
            <div className="flex flex-col gap-1.5">
              <p className="font-bold leading-snug">
                {existing.draft
                  ? `Tu as un brouillon pour le poste ${existing.positionTitle}.`
                  : `Tu as déjà candidaté au poste ${existing.positionTitle}.`}
              </p>
              <p className="type-small text-muted">
                {existing.draft
                  ? "Tu peux le reprendre depuis ton espace, ou repartir de zéro ici."
                  : `Statut : ${existing.statusLabel.toLowerCase()}. Tu peux candidater à un autre poste ci-dessous.`}
              </p>
              <Link href={routes.accountApplication(existing.id)} className="link type-small font-bold">
                {existing.draft ? "Reprendre mon brouillon" : "Suivre ma candidature"}
              </Link>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1 border-y border-line py-3.5">
          <p className="type-label text-subtle">Tu candidates en tant que</p>
          <p className="font-bold leading-snug">{applicant.name}</p>
          <p className="type-meta break-all text-muted">
            {applicant.programme} · {applicant.email}
          </p>
        </div>

        {errorEntries.length > 0 && (
          <div
            ref={summaryRef}
            tabIndex={-1}
            role="group"
            aria-labelledby={`${uid}-summary`}
            className="flex flex-col gap-3 rounded-sm border-2 border-danger p-4 outline-none focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--focus)_35%,transparent)]"
          >
            <h3 id={`${uid}-summary`} className="font-bold text-danger">
              {errorEntries.length === 1
                ? "Un point à compléter avant d'envoyer"
                : `${errorEntries.length} points à compléter avant d'envoyer`}
            </h3>
            <ul className="flex flex-col gap-1.5">
              {errorEntries.map(([name, label]) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => focusField(name)}
                    className="link text-left type-small font-semibold"
                  >
                    {label}
                  </button>
                  <span className="type-small text-muted"> : {errors[name]}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {form.positions.length > 0 ? (
          <div data-field className="flex flex-col gap-2">
            <ChoiceGroup
              key={choiceKey}
              legend="Le poste qui t'intéresse"
              name="position"
              defaultValue={preselect}
              describedBy={errors.position ? positionErrorId : undefined}
              columns={form.positions.length > 1 ? 2 : 1}
              options={form.positions.map((p) => ({
                value: p.id,
                label: p.title,
                description: [
                  p.team,
                  plural(p.seats, "place"),
                  p.closesEarly,
                  p.id === alreadyApplied ? "déjà candidaté·e" : undefined,
                ]
                  .filter(Boolean)
                  .join(" · "),
              }))}
            />
            {errors.position && (
              <p id={positionErrorId} className="type-small font-semibold text-danger">
                {errors.position}
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-sm bg-sunken p-4 text-muted">Tous les postes de ce recrutement sont désormais clos.</p>
        )}

        {form.spec.secondChoice && form.positions.length > 1 && (
          <div data-field>
            <Field label="Ton second choix" optional hint="Si ton premier choix est déjà pris, le bureau regarde celui-ci.">
              {({ id, describedBy }) => (
                <Select id={id} name="second-choice" aria-describedby={describedBy} defaultValue="">
                  <option value="">Pas de second choix</option>
                  {form.positions
                    .filter((p) => p.id !== picked)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                </Select>
              )}
            </Field>
          </div>
        )}

        {questions.map(({ q, name, active }) => (
          <div key={name} data-field hidden={!active}>
            <QuestionField q={q} name={name} error={errors[name]} length={lengths[name] ?? 0} />
          </div>
        ))}

        {activeAttachments.length > 0 && (
          <div className="flex flex-col gap-5">
            {attachments.map(({ a, name, active }) => (
              <div key={name} data-field hidden={!active}>
                <AttachmentField
                  a={a}
                  name={name}
                  error={errors[name]}
                  file={files[name] ?? null}
                  onClear={() => clearFile(name)}
                />
              </div>
            ))}
            <p className="flex items-start gap-2 type-caption">
              <Icon name="info" size={14} className="mt-0.5 shrink-0" />
              Version de démonstration : le fichier reste sur ton appareil, rien n&apos;est téléversé.
            </p>
          </div>
        )}

        <div data-field className="flex flex-col gap-1.5 border-t border-line pt-6">
          <Checkbox
            name="consent"
            label={`J'accepte que le bureau de ${form.associationName} lise ma candidature et me recontacte à son sujet.`}
            description="Tes réponses ne servent qu'à ce recrutement."
            aria-invalid={Boolean(errors.consent)}
            aria-describedby={errors.consent ? consentErrorId : undefined}
          />
          {errors.consent && (
            <p id={consentErrorId} className="type-small font-semibold text-danger">
              {errors.consent}
            </p>
          )}
        </div>
      </div>

      {/* Full screen on phones: keep the submit button clear of the home indicator. */}
      <footer className="shrink-0 border-t-2 border-fg px-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] pt-3.5 sm:px-7 sm:pb-3.5">
        <div role="status" aria-live="polite">
          {noticeVisible && (
            <p className="mb-3.5 flex items-start gap-3 rounded-sm border-2 border-fg bg-raised p-3.5 type-small">
              <Icon name="info" size={18} className="mt-px shrink-0 text-info" />
              <span>
                <strong>Version de démonstration : rien n&apos;est envoyé pour l&apos;instant.</strong> Ton formulaire est
                complet ; dans la version finale, il partirait chez {form.associationName} et tu le suivrais dans ton
                espace. Ta saisie reste là tant que tu ne recharges pas la page.
              </span>
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onClose} className="max-sm:hidden">
            Fermer
          </Button>
          <Button type="submit" variant="assoc" icon="arrow-right" className="max-sm:flex-1">
            Envoyer ma candidature
          </Button>
        </div>
      </footer>
    </form>
  );
}

function QuestionField({
  q,
  name,
  error,
  length,
}: {
  q: ApplicationQuestion;
  name: string;
  error?: string;
  length: number;
}) {
  const counter = q.kind === "long" && q.maxLength;
  const hint =
    q.hint || counter ? (
      <span className="flex items-start justify-between gap-4">
        <span>{q.hint}</span>
        {counter && (
          <span className="shrink-0 type-meta tabular-nums">
            {length} / {q.maxLength}
          </span>
        )}
      </span>
    ) : undefined;

  return (
    <Field label={q.label} optional={q.optional} hint={hint} error={error}>
      {({ id, describedBy, invalid }) => {
        const common = { id, name, "aria-describedby": describedBy, "aria-invalid": invalid };
        switch (q.kind) {
          case "long":
            return <Textarea {...common} rows={5} maxLength={q.maxLength} />;
          case "tel":
            return <Input {...common} type="tel" inputMode="tel" autoComplete="tel" className="max-w-xs" />;
          case "choice":
            return (
              <Select {...common} defaultValue="">
                <option value="" disabled>
                  Choisis une option
                </option>
                {q.options?.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            );
          default:
            return <Input {...common} type="text" maxLength={q.maxLength} autoComplete="off" />;
        }
      }}
    </Field>
  );
}

function AttachmentField({
  a,
  name,
  error,
  file,
  onClear,
}: {
  a: ApplicationAttachmentSpec;
  name: string;
  error?: string;
  file: PickedFile | null;
  onClear: () => void;
}) {
  return (
    <Field label={a.label} optional={a.optional} hint={a.hint} error={error}>
      {({ id, describedBy, invalid }) => (
        <div
          className={cx(
            "focus-ring-within flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-sm border-2 border-dashed bg-raised px-3.5 py-3",
            invalid ? "border-danger" : "border-line-strong/50",
          )}
        >
          <input
            id={id}
            name={name}
            type="file"
            accept={a.accept}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            className="sr-only"
          />
          {/* Second label for the same input: the visible "button". Its text is
              hidden from the accessible name, which stays the field label. */}
          <label htmlFor={id} className={cx(buttonClass({ variant: "secondary", size: "sm" }), "cursor-pointer")}>
            <Icon name="upload" size={16} />
            <span aria-hidden>{file ? "Changer" : "Choisir un fichier"}</span>
          </label>
          <span className="min-w-0 flex-1 type-small break-all">
            {file ? (
              <>
                {file.name} <span className="type-meta text-subtle">· {formatSize(file.size)}</span>
              </>
            ) : (
              <span className="text-subtle">Aucun fichier choisi</span>
            )}
          </span>
          {file && (
            <button
              type="button"
              onClick={onClear}
              aria-label={`Retirer le fichier ${file.name}`}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-sm px-2 type-label text-muted hover:bg-fg/8 hover:text-fg"
            >
              <Icon name="close" size={14} />
              Retirer
            </button>
          )}
        </div>
      )}
    </Field>
  );
}
