"use client";

import Link from "next/link";
import { createContext, startTransition, useActionState, useContext, useState, type ReactNode } from "react";
import { saveCampaignStep, type RecruitmentActionState } from "@/app/actions/recruitment";
import { CAMPAIGN_LIMITS, STUDY_YEARS, type CampaignStep, type FieldErrors } from "@/lib/recruitment/input";
import { mediaUrl } from "@/lib/associations/model";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ImageUploader } from "@/components/manage/page-editor/ImageUploader";

/**
 * The campaign wizard's writing steps. Each step is one form saved by
 * saveCampaignStep (save_recruitment_campaign in the database, which checks
 * the right, the version and every rule again): "Enregistrer" stays on the
 * step, "Enregistrer et continuer" moves on once saved. Submitted by hand so a
 * refusal keeps what was typed; field errors come back under each field.
 * Everything typed here is plain text: the site never renders it as HTML.
 */

const StepContext = createContext<{ errors: FieldErrors }>({ errors: {} });
const useErrors = () => useContext(StepContext).errors;

export interface StepBase {
  campaignId: string;
  asso: string;
  version: number;
  /** Read-only for this person (no right, suspended association, cancelled campaign…). */
  disabled: boolean;
}

function StepForm({
  base,
  step,
  next,
  nextLabel,
  children,
}: {
  base: StepBase;
  step: CampaignStep;
  next: string;
  nextLabel: string;
  children: ReactNode;
}) {
  const [state, dispatch, pending] = useActionState<RecruitmentActionState, FormData>(saveCampaignStep, { status: "idle" });
  const version = Math.max(state.version ?? 0, base.version);
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};

  return (
    <StepContext value={{ errors }}>
      <form
        action={dispatch}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const submitter = (event.nativeEvent as SubmitEvent).submitter;
          const data = new FormData(event.currentTarget, submitter instanceof HTMLButtonElement ? submitter : null);
          startTransition(() => dispatch(data));
        }}
        className="flex flex-col gap-8"
      >
        <input type="hidden" name="campaign_id" value={base.campaignId} />
        <input type="hidden" name="organization_slug" value={base.asso} />
        <input type="hidden" name="step" value={step} />
        <input type="hidden" name="version" value={version} />
        <fieldset disabled={base.disabled || pending} className="flex min-w-0 flex-col gap-8">
          {children}
        </fieldset>
        {!base.disabled && (
          <div className="sticky bottom-[calc(var(--tabbar-h,0px)+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur-sm sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
            <Button type="submit" name="next" value={next} icon="arrow-right" disabled={pending} aria-disabled={pending}>
              {pending ? "Un instant…" : nextLabel}
            </Button>
            <Button type="submit" variant="secondary" disabled={pending} aria-disabled={pending}>
              Enregistrer
            </Button>
          </div>
        )}
        <StepOutcome state={state} />
      </form>
    </StepContext>
  );
}

export function StepOutcome({ state }: { state: RecruitmentActionState }) {
  if (state.status === "idle" || !state.message) return <p aria-live="polite" className="sr-only" />;
  const done = state.status === "done";
  return (
    <div
      key={state.at}
      role={done ? "status" : "alert"}
      className={cx(
        "flex items-start gap-2 rounded-sm border-2 p-3 type-small font-semibold",
        done ? "border-ok/50 bg-ok/5 text-ok" : "border-danger/50 bg-danger/5 text-danger",
      )}
    >
      <Icon name={done ? "check" : "alert"} size={16} className="mt-0.5 shrink-0" />
      <span>
        {state.message}
        {state.code === "draft_conflict" && " Recharge la page pour voir la dernière version, puis refais ta modification."}
        {state.code === "mfa_required" && (
          <>
            {" "}
            <Link href={routes.accountSecurity} className="underline underline-offset-2">
              Ouvrir Sécurité
            </Link>
          </>
        )}
      </span>
    </div>
  );
}

function TextField({
  name,
  label,
  hint,
  value,
  max,
  optional,
  multiline,
  rows,
  type = "text",
  placeholder,
}: {
  name: string;
  label: string;
  hint?: string;
  value: string;
  max: number;
  optional?: boolean;
  multiline?: boolean;
  rows?: number;
  type?: string;
  placeholder?: string;
}) {
  const error = useErrors()[name];
  return (
    <Field label={label} hint={hint} error={error} optional={optional}>
      {({ id, describedBy, invalid }) =>
        multiline ? (
          <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} name={name} defaultValue={value} maxLength={max} rows={rows ?? 6} placeholder={placeholder} />
        ) : (
          <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} name={name} defaultValue={value} maxLength={max} type={type} placeholder={placeholder} autoComplete="off" />
        )
      }
    </Field>
  );
}

/** Date + time side by side (Paris), one error for the pair. */
export function DateTimeField({
  name,
  label,
  hint,
  date,
  time,
  optional,
  error: forced,
}: {
  name: string;
  label: string;
  hint?: string;
  date: string;
  time: string;
  optional?: boolean;
  error?: string;
}) {
  const fromStep = useErrors()[name];
  const error = forced ?? fromStep;
  return (
    <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-2 text-[0.95rem] font-bold leading-snug">
        {label}
        {optional && <span className="ml-1.5 font-normal text-subtle">(facultatif)</span>}
      </legend>
      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
        <label className="flex min-w-0 flex-col gap-1">
          <span className="type-caption">Jour</span>
          <Input type="date" name={`${name}_date`} defaultValue={date} aria-invalid={Boolean(error)} />
        </label>
        <label className="flex min-w-0 flex-col gap-1">
          <span className="type-caption">Heure (Paris)</span>
          <Input type="time" name={`${name}_time`} defaultValue={time} step={300} aria-invalid={Boolean(error)} />
        </label>
      </div>
      {hint && <p className="type-small text-subtle">{hint}</p>}
      {error && (
        <p id={`${name}-error`} role="alert" className="type-small font-semibold text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Study years: everyone, or the years ticked (self-declared in each student's profile). */
export function YearsField({
  name = "eligible_years",
  years,
  allLabel,
  allHint,
}: {
  name?: string;
  years: number[] | null;
  allLabel: string;
  allHint: string;
}) {
  const errors = useErrors();
  const [mode, setMode] = useState<"all" | "years">(years ? "years" : "all");
  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={errors[name] ? `${name}-error` : `${name}-aide`}>
      <legend className="mb-1 text-[0.95rem] font-bold">Années d&apos;études</legend>
      <p id={`${name}-aide`} className="max-w-2xl type-small text-subtle">
        D&apos;après l&apos;année que chaque étudiant·e indique dans son profil (le site ne peut pas la vérifier). Une
        personne sans année renseignée ne peut pas candidater à un poste réservé.
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {(
          [
            { value: "all", label: allLabel, description: allHint },
            { value: "years", label: "Certaines années", description: "Coche les années qui peuvent candidater." },
          ] as const
        ).map((o) => (
          <label
            key={o.value}
            className="focus-ring-within group relative flex cursor-pointer flex-col gap-1 rounded-sm border-2 border-line bg-raised px-4 py-3.5 transition-colors hover:border-line-strong has-[:checked]:border-accent has-[:checked]:bg-accent/8"
          >
            <input type="radio" name="eligibility" value={o.value} checked={mode === o.value} onChange={() => setMode(o.value)} className="sr-only" />
            <span className="type-button text-[0.8rem] text-muted group-has-[:checked]:text-fg">{o.label}</span>
            <span className="type-small text-subtle">{o.description}</span>
          </label>
        ))}
      </div>
      {mode === "years" && (
        <div className="flex flex-wrap gap-2">
          {STUDY_YEARS.map((y) => (
            <label key={y} className="focus-ring-within inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border-2 border-line bg-raised px-3.5 has-[:checked]:border-fg">
              <input type="checkbox" name={name} value={y} defaultChecked={years?.includes(y)} className="size-4 accent-accent" />
              <span className="font-semibold">{y === 1 ? "1re" : `${y}e`} année</span>
            </label>
          ))}
        </div>
      )}
      {errors[name] && (
        <p id={`${name}-error`} role="alert" className="type-small font-semibold text-danger">
          {errors[name]}
        </p>
      )}
    </fieldset>
  );
}

/* ---- 1. Présentation ------------------------------------------------------------------------------ */

export function InfosStep({
  base,
  values,
  media,
  canUpload,
}: {
  base: StepBase;
  values: { title: string; summary: string; description: string; academic_year: string; cover_media_id: string };
  media: { id: string; path: string; kind: string; width: number | null; height: number | null; alt: string | null }[];
  canUpload: boolean;
}) {
  const [selected, setSelected] = useState(values.cover_media_id);
  const errors = useErrors();
  const images = media.filter((m) => m.kind !== "logo");
  return (
    <StepForm base={base} step="infos" next="deroule" nextLabel="Enregistrer et passer au déroulé">
      <TextField name="title" label="Titre" value={values.title} max={CAMPAIGN_LIMITS.title} hint="Ex : « Recrutement 2027 », « Équipe soirées »." />
      <TextField
        name="summary"
        label="En une phrase"
        value={values.summary}
        max={CAMPAIGN_LIMITS.summary}
        hint="Ce que les étudiant·es lisent dans la liste des recrutements. 300 caractères au plus."
      />
      <TextField
        name="description"
        label="Présentation"
        value={values.description}
        max={CAMPAIGN_LIMITS.description}
        multiline
        rows={8}
        optional
        hint="Pourquoi l'asso recrute, l'ambiance, ce qu'on y apprend. Laisse une ligne vide entre deux paragraphes."
      />
      <TextField
        name="academic_year"
        label="Année scolaire"
        value={values.academic_year}
        max={9}
        optional
        placeholder="2026-2027"
        hint="Pour quelle année tu recrutes, écrite « 2026-2027 »."
      />
      <fieldset className="flex flex-col gap-3" aria-describedby="visuel-aide">
        <legend className="mb-1 text-[0.95rem] font-bold">Le visuel</legend>
        <p id="visuel-aide" className="max-w-2xl type-small text-subtle">
          Format paysage, sans texte dessus : le titre et la date limite sont écrits par le site. Sans image, la fiche est composée
          avec les couleurs de l&apos;asso. Une image reste privée tant que le recrutement n&apos;est pas publié.
        </p>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <li>
            <label className="focus-ring-within flex aspect-[3/2] cursor-pointer flex-col items-center justify-center gap-1 rounded-sm border-2 border-line bg-sunken p-2 text-center has-[:checked]:border-accent">
              <input type="radio" name="cover_media_id" value="" checked={selected === ""} onChange={() => setSelected("")} className="sr-only" />
              <Icon name="image" size={22} className="text-subtle" />
              <span className="type-small font-bold">Pas d&apos;image</span>
            </label>
          </li>
          {images.map((m) => (
            <li key={m.id}>
              <label className="focus-ring-within relative block aspect-[3/2] cursor-pointer overflow-hidden rounded-sm border-2 border-line has-[:checked]:border-accent has-[:checked]:ring-2 has-[:checked]:ring-accent">
                <input type="radio" name="cover_media_id" value={m.id} checked={selected === m.id} onChange={() => setSelected(m.id)} className="sr-only" />
                {/* eslint-disable-next-line @next/next/no-img-element -- private preview route, sized by the tile */}
                <img src={mediaUrl(m.path, true)} alt={m.alt ?? "Image sans description"} className="size-full object-cover" loading="lazy" />
                {selected === m.id && (
                  <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-accent text-bg">
                    <Icon name="check" size={14} strokeWidth={2.5} />
                  </span>
                )}
              </label>
            </li>
          ))}
        </ul>
        {errors.cover_media_id && (
          <p role="alert" className="type-small font-semibold text-danger">
            {errors.cover_media_id}
          </p>
        )}
        {canUpload && !base.disabled && (
          <ImageUploader asso={base.asso} kind="cover" label="Ajouter une image" onUploaded={(m) => setSelected(m.id)} />
        )}
      </fieldset>
    </StepForm>
  );
}

/* ---- 2. Déroulé, questions fréquentes, contact ---------------------------------------------------- */

export function DerouleStep({
  base,
  values,
}: {
  base: StepBase;
  values: {
    process: { label: string; detail?: string; date?: string }[];
    faq: { question: string; answer: string }[];
    contact_name: string;
    contact_role: string;
    contact_email: string;
  };
}) {
  const errors = useErrors();
  const [steps, setSteps] = useState(values.process.length > 0 ? values.process.map((s, i) => ({ key: i, ...s })) : []);
  const [faq, setFaq] = useState(values.faq.map((q, i) => ({ key: i, ...q })));
  const [nextKey, setNextKey] = useState(100);
  return (
    <StepForm base={base} step="deroule" next="postes" nextLabel="Enregistrer et passer aux postes">
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-[0.95rem] font-bold">
          Les étapes du recrutement <span className="ml-1.5 font-normal text-subtle">(facultatif)</span>
        </legend>
        <p className="max-w-2xl type-small text-subtle">
          Ce qui se passe après l&apos;envoi, dans l&apos;ordre (« Entretiens », « Réponse »…), avec un jour si tu le connais déjà. 6 étapes au
          plus. Le site affiche ces étapes telles quelles : il ne les organise pas.
        </p>
        {errors.process && <p role="alert" className="type-small font-semibold text-danger">{errors.process}</p>}
        <ol className="flex flex-col gap-4">
          {steps.map((s, i) => (
            <li key={s.key} className="grid gap-3 rounded-sm border border-line p-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <label className="flex min-w-0 flex-col gap-1">
                <span className="type-caption">Étape {i + 1}</span>
                <Input name="step_label" defaultValue={s.label} maxLength={CAMPAIGN_LIMITS.stepLabel} placeholder="Ex : Entretiens" />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="type-caption">Jour (facultatif)</span>
                <Input type="date" name="step_date" defaultValue={s.date ?? ""} />
              </label>
              <label className="flex min-w-0 flex-col gap-1 sm:col-span-2">
                <span className="type-caption">En deux mots (facultatif)</span>
                <Input name="step_detail" defaultValue={s.detail ?? ""} maxLength={CAMPAIGN_LIMITS.stepDetail} />
              </label>
              {errors[`step_${i}`] && <p role="alert" className="type-small font-semibold text-danger sm:col-span-2">{errors[`step_${i}`]}</p>}
              <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setSteps((l) => l.filter((x) => x.key !== s.key))}>
                Retirer l&apos;étape
              </Button>
            </li>
          ))}
        </ol>
        {steps.length < CAMPAIGN_LIMITS.steps && (
          <Button
            type="button"
            variant="secondary"
            icon="plus"
            iconPosition="start"
            className="self-start"
            onClick={() => {
              setSteps((l) => [...l, { key: nextKey, label: "" }]);
              setNextKey((k) => k + 1);
            }}
          >
            Ajouter une étape
          </Button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-[0.95rem] font-bold">
          Questions fréquentes <span className="ml-1.5 font-normal text-subtle">(facultatif)</span>
        </legend>
        {errors.faq && <p role="alert" className="type-small font-semibold text-danger">{errors.faq}</p>}
        <ol className="flex flex-col gap-4">
          {faq.map((q, i) => (
            <li key={q.key} className="flex flex-col gap-3 rounded-sm border border-line p-3">
              <label className="flex flex-col gap-1">
                <span className="type-caption">Question {i + 1}</span>
                <Input name="faq_question" defaultValue={q.question} maxLength={CAMPAIGN_LIMITS.question} placeholder="Ex : Faut-il de l'expérience ?" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="type-caption">Réponse</span>
                <Textarea name="faq_answer" defaultValue={q.answer} maxLength={CAMPAIGN_LIMITS.answer} rows={3} className="min-h-20" />
              </label>
              {errors[`faq_${i}`] && <p role="alert" className="type-small font-semibold text-danger">{errors[`faq_${i}`]}</p>}
              <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setFaq((l) => l.filter((x) => x.key !== q.key))}>
                Retirer la question
              </Button>
            </li>
          ))}
        </ol>
        {faq.length < CAMPAIGN_LIMITS.faq && (
          <Button
            type="button"
            variant="secondary"
            icon="plus"
            iconPosition="start"
            className="self-start"
            onClick={() => {
              setFaq((l) => [...l, { key: nextKey, question: "", answer: "" }]);
              setNextKey((k) => k + 1);
            }}
          >
            Ajouter une question
          </Button>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1 text-[0.95rem] font-bold">
          Qui contacter <span className="ml-1.5 font-normal text-subtle">(facultatif)</span>
        </legend>
        <p className="max-w-2xl type-small text-subtle">
          Affiché sur la fiche publique. Une adresse de l&apos;asso plutôt qu&apos;une adresse personnelle, si vous en avez une.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField name="contact_name" label="Nom" value={values.contact_name} max={CAMPAIGN_LIMITS.contactName} optional />
          <TextField name="contact_role" label="Rôle" value={values.contact_role} max={CAMPAIGN_LIMITS.contactRole} optional placeholder="Ex : Présidence" />
        </div>
        <TextField name="contact_email" label="E-mail" type="email" value={values.contact_email} max={CAMPAIGN_LIMITS.email} optional />
      </fieldset>
    </StepForm>
  );
}

/* ---- 5. Dates et règles ------------------------------------------------------------------------- */

export function ReglesStep({
  base,
  values,
  published,
  canChangeLive,
}: {
  base: StepBase;
  values: {
    opens: { date: string; time: string };
    closes: { date: string; time: string };
    closes_was: string;
    max_applications: number;
    eligible_years: number[] | null;
    eligibility_note: string;
  };
  /** Online once: changing dates, years or the limit then needs "Publier les recrutements". */
  published: boolean;
  canChangeLive: boolean;
}) {
  const errors = useErrors();
  return (
    <StepForm base={base} step="regles" next="apercu" nextLabel="Enregistrer et voir l'aperçu">
      <input type="hidden" name="closes_was" value={values.closes_was} />
      {published && !canChangeLive && (
        <p className="flex items-start gap-2 rounded-sm border border-line bg-sunken p-3 type-small">
          <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
          Ce recrutement est en ligne : changer ses dates, ses années ou sa limite demande le droit « Publier les recrutements ».
        </p>
      )}
      <div className="grid gap-6 sm:grid-cols-2">
        <DateTimeField name="opens" label="Ouverture des candidatures" date={values.opens.date} time={values.opens.time} hint="Avant, la fiche est lisible mais personne ne peut candidater." />
        <DateTimeField
          name="closes"
          label="Date limite"
          date={values.closes.date}
          time={values.closes.time || "23:59"}
          hint="Le site refuse tout envoi qui arrive après, même d'une minute."
        />
      </div>
      <Field
        label="Postes par personne"
        hint="Combien de postes de ce recrutement une même personne peut viser (brouillons compris). Entre 1 et 10."
        error={errors.max_applications}
      >
        {({ id, describedBy, invalid }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            name="max_applications"
            type="number"
            min={1}
            max={10}
            step={1}
            inputMode="numeric"
            defaultValue={values.max_applications}
            className="max-w-32"
          />
        )}
      </Field>
      <YearsField years={values.eligible_years} allLabel="Toutes les années" allHint="Tout le monde peut candidater, quelle que soit son année." />
      <TextField
        name="eligibility_note"
        label="À savoir avant de candidater"
        value={values.eligibility_note}
        max={CAMPAIGN_LIMITS.eligibilityNote}
        optional
        hint="Affiché tel quel sur la fiche (ex : « Être disponible les jeudis soir »). Le site ne le vérifie pas."
      />
    </StepForm>
  );
}
