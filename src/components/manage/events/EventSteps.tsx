"use client";

import Link from "next/link";
import { createContext, startTransition, useActionState, useContext, useState, type ReactNode } from "react";
import { saveEventStep, type EventActionState } from "@/app/actions/events";
import type { EventLocationType, RegistrationMode } from "@/lib/types";
import type { FieldErrors } from "@/lib/events/input";
import { CANCELLATION_CUTOFFS, EVENT_LIMITS, cutoffLabel } from "@/lib/events/input";
import { mediaUrl } from "@/lib/associations/model";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ImageUploader } from "@/components/manage/page-editor/ImageUploader";

/**
 * The event wizard's four writing steps. Each step is one form saved by
 * saveEventStep (save_event in the database, which checks the right, the
 * version and every rule again): "Enregistrer" stays on the step,
 * "Enregistrer et continuer" moves on once saved. Submitted by hand so a
 * refusal keeps what was typed; the field errors come back under each field.
 * Fields that do not apply (a venue for an online event…) are hidden, not
 * removed, so switching back and forth loses nothing.
 */

const StepContext = createContext<{ errors: FieldErrors }>({ errors: {} });
const useErrors = () => useContext(StepContext).errors;

export interface StepBase {
  eventId: string;
  asso: string;
  version: number;
  isBde: boolean;
  /** Read-only for this person (no right, suspended association…). */
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
  step: "infos" | "lieu" | "visuels" | "inscriptions";
  next: string;
  nextLabel: string;
  children: ReactNode;
}) {
  const [state, dispatch, pending] = useActionState<EventActionState, FormData>(saveEventStep, { status: "idle" });
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
        <input type="hidden" name="event_id" value={base.eventId} />
        <input type="hidden" name="organization_slug" value={base.asso} />
        <input type="hidden" name="step" value={step} />
        <input type="hidden" name="version" value={version} />
        <input type="hidden" name="is_bde" value={base.isBde ? "1" : "0"} />
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

function StepOutcome({ state }: { state: EventActionState }) {
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

/** Date + time side by side, one error for the pair. */
function DateTimeField({
  name,
  label,
  hint,
  date,
  time,
  optional,
}: {
  name: string;
  label: string;
  hint?: string;
  date: string;
  time: string;
  optional?: boolean;
}) {
  const error = useErrors()[name];
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

/** A radio tile group whose value the step can follow (to show the fields that apply). */
function Choice<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
}: {
  legend: string;
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; description: string }[];
}) {
  const error = useErrors()[name];
  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="mb-1 text-[0.95rem] font-bold">{legend}</legend>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {options.map((o) => (
          <label
            key={o.value}
            className="focus-ring-within group relative flex cursor-pointer flex-col gap-1 rounded-sm border-2 border-line bg-raised px-4 py-3.5 transition-colors hover:border-line-strong has-[:checked]:border-accent has-[:checked]:bg-accent/8"
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span className="type-button text-[0.8rem] text-muted group-has-[:checked]:text-fg">{o.label}</span>
            <span className="type-small text-subtle">{o.description}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={`${name}-error`} role="alert" className="type-small font-semibold text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/* ---- 1. Infos ------------------------------------------------------------------------------ */

export function InfosStep({
  base,
  values,
  categories,
  organizations,
  series,
}: {
  base: StepBase;
  values: { title: string; summary: string; description: string; category_id: string; series_key: string; coorganizer_ids: string[] };
  categories: { id: string; label: string; archived: boolean }[];
  organizations: { id: string; name: string; short_name: string | null }[];
  /** The BDE's events of the year (BDE only). */
  series: { slug: string; name: string }[];
}) {
  const [coorganizers, setCoorganizers] = useState<string[]>(values.coorganizer_ids);
  return (
    <StepForm base={base} step="infos" next="lieu" nextLabel="Enregistrer et passer au lieu">
      <InfosFields
        values={values}
        categories={categories}
        organizations={organizations}
        series={series}
        isBde={base.isBde}
        coorganizers={coorganizers}
        setCoorganizers={setCoorganizers}
      />
    </StepForm>
  );
}

function InfosFields({
  values,
  categories,
  organizations,
  series,
  isBde,
  coorganizers,
  setCoorganizers,
}: {
  values: { title: string; summary: string; description: string; category_id: string; series_key: string };
  categories: { id: string; label: string; archived: boolean }[];
  organizations: { id: string; name: string; short_name: string | null }[];
  series: { slug: string; name: string }[];
  isBde: boolean;
  coorganizers: string[];
  setCoorganizers: (ids: string[]) => void;
}) {
  const errors = useErrors();
  const full = coorganizers.length >= EVENT_LIMITS.coorganizers;
  return (
    <>
      <Field label="Titre" error={errors.title} hint={`${EVENT_LIMITS.title} caractères au plus. Le nom que tout le monde dira.`}>
        {({ id, describedBy, invalid }) => (
          <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} name="title" defaultValue={values.title} maxLength={EVENT_LIMITS.title} autoComplete="off" />
        )}
      </Field>
      <Field
        label="En une phrase"
        error={errors.summary}
        hint="Ce qui s'y passe et pour qui : c'est la ligne montrée dans l'agenda et les partages. Nécessaire pour publier."
      >
        {({ id, describedBy, invalid }) => (
          <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} name="summary" defaultValue={values.summary} maxLength={EVENT_LIMITS.summary} rows={2} />
        )}
      </Field>
      <Field
        label="Présentation"
        optional
        error={errors.description}
        hint="Le programme, ce qu'il faut savoir, ce qu'il faut apporter. Texte simple : une ligne vide sépare deux paragraphes."
      >
        {({ id, describedBy, invalid }) => (
          <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} name="description" defaultValue={values.description} maxLength={EVENT_LIMITS.description} rows={9} />
        )}
      </Field>
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Catégorie" optional error={errors.category_id} hint="Pour les filtres de l'agenda.">
          {({ id, describedBy, invalid }) => (
            <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} name="category_id" defaultValue={values.category_id}>
              <option value="">Aucune</option>
              {categories
                .filter((c) => !c.archived || c.id === values.category_id)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                    {c.archived ? " (retirée)" : ""}
                  </option>
                ))}
            </Select>
          )}
        </Field>
        {isBde && (
          <Field label="Événement de l'année" optional error={errors.series_key} hint="Une édition d'un des grands rendez-vous du BDE : elle prend son emblème.">
            {({ id, describedBy, invalid }) => (
              <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} name="series_key" defaultValue={values.series_key}>
                <option value="">Aucun</option>
                {series.map((s) => (
                  <option key={s.slug} value={s.slug}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </div>
      {organizations.length > 0 && (
        <fieldset className="flex flex-col gap-2" aria-describedby="coorganisateurs-aide">
          <legend className="mb-1 text-[0.95rem] font-bold">
            Co-organisé avec <span className="font-normal text-subtle">(facultatif)</span>
          </legend>
          <p id="coorganisateurs-aide" className="type-small text-subtle">
            {EVENT_LIMITS.coorganizers} assos au plus, citées sur la page. C&apos;est un crédit : elles ne peuvent ni modifier
            l&apos;événement ni voir les inscrit·es.
          </p>
          <input type="hidden" name="coorganizers_present" value="1" />
          <ul className="grid max-h-64 gap-1 overflow-y-auto rounded-sm border border-line p-2 sm:grid-cols-2">
            {organizations.map((o) => {
              const checked = coorganizers.includes(o.id);
              return (
                <li key={o.id}>
                  <label className={cx("flex min-h-10 cursor-pointer items-center gap-2.5 rounded-xs px-2 hover:bg-fg/5", !checked && full && "opacity-50")}>
                    <input
                      type="checkbox"
                      name="coorganizer_ids"
                      value={o.id}
                      checked={checked}
                      disabled={!checked && full}
                      onChange={(e) => setCoorganizers(e.target.checked ? [...coorganizers, o.id] : coorganizers.filter((x) => x !== o.id))}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <span className="type-small">{o.short_name ?? o.name}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {errors.coorganizer_ids && (
            <p role="alert" className="type-small font-semibold text-danger">
              {errors.coorganizer_ids}
            </p>
          )}
        </fieldset>
      )}
    </>
  );
}

/* ---- 2. Date and place --------------------------------------------------------------------- */

export function LieuStep({
  base,
  values,
  notified,
}: {
  base: StepBase;
  values: {
    starts: { date: string; time: string };
    ends: { date: string; time: string };
    location_type: EventLocationType;
    venue_name: string;
    address_line: string;
    city: string;
    latitude: string;
    longitude: string;
    online_url: string;
  };
  /** How many people would be told about a change of date or place (published events). */
  notified: number;
}) {
  const [type, setType] = useState<EventLocationType>(values.location_type);
  return (
    <StepForm base={base} step="lieu" next="visuels" nextLabel="Enregistrer et passer au visuel">
      {notified > 0 && (
        <p className="flex items-start gap-2 rounded-sm border-2 border-info/40 bg-info/5 p-3 type-small">
          <Icon name="bell" size={16} className="mt-0.5 shrink-0 text-info" />
          <span>
            Si tu changes la date ou le lieu, {plural(notified, "personne inscrite ou en attente est prévenue", "personnes inscrites ou en attente sont prévenues")}{" "}
            automatiquement, et l&apos;historique le garde.
          </span>
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <DateTimeField name="starts" label="Début" date={values.starts.date} time={values.starts.time} />
        <DateTimeField
          name="ends"
          label="Fin"
          date={values.ends.date}
          time={values.ends.time}
          hint="Une soirée qui finit après minuit : mets le lendemain. 14 jours au plus."
        />
      </div>
      <PlaceFields type={type} setType={setType} values={values} />
    </StepForm>
  );
}

function PlaceFields({
  type,
  setType,
  values,
}: {
  type: EventLocationType;
  setType: (t: EventLocationType) => void;
  values: { venue_name: string; address_line: string; city: string; latitude: string; longitude: string; online_url: string };
}) {
  const errors = useErrors();
  return (
    <>
      <Choice<EventLocationType>
        legend="Où"
        name="location_type"
        value={type}
        onChange={setType}
        options={[
          { value: "campus", label: "Sur le campus", description: "Une salle, un amphi, le hall…" },
          { value: "external", label: "Ailleurs", description: "Un bar, un stade, une ville…" },
          { value: "online", label: "En ligne", description: "Une visio, un live." },
        ]}
      />
      <div hidden={type === "online"} className="grid gap-6 sm:grid-cols-2">
        <Field
          label={type === "campus" ? "Salle ou endroit du campus" : "Nom du lieu"}
          error={errors.venue_name}
          hint="Nécessaire pour publier. Tel qu'on le cherche sur place."
          className="sm:col-span-2"
        >
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} name="venue_name" defaultValue={values.venue_name} maxLength={EVENT_LIMITS.venue} autoComplete="off" />
          )}
        </Field>
        <Field label="Adresse" optional error={errors.address_line} hint="Avec elle, la page propose l'itinéraire.">
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} name="address_line" defaultValue={values.address_line} maxLength={EVENT_LIMITS.address} autoComplete="off" />
          )}
        </Field>
        <Field label="Ville" optional error={errors.city}>
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} name="city" defaultValue={values.city} maxLength={EVENT_LIMITS.city} autoComplete="off" />
          )}
        </Field>
        <details className="sm:col-span-2" open={Boolean(values.latitude || errors.latitude)}>
          <summary className="cursor-pointer type-small font-bold">Coordonnées exactes (facultatif)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="type-caption">Latitude</span>
              <Input name="latitude" inputMode="decimal" defaultValue={values.latitude} aria-invalid={Boolean(errors.latitude)} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="type-caption">Longitude</span>
              <Input name="longitude" inputMode="decimal" defaultValue={values.longitude} aria-invalid={Boolean(errors.latitude)} />
            </label>
            <p className="type-small text-subtle sm:col-span-2">
              Pour un point de rendez-vous précis (une entrée, un parking). Sinon l&apos;itinéraire part de l&apos;adresse.
            </p>
            {errors.latitude && (
              <p role="alert" className="type-small font-semibold text-danger sm:col-span-2">
                {errors.latitude}
              </p>
            )}
          </div>
        </details>
      </div>
      <div hidden={type !== "online"}>
        <Field
          label="Lien public pour suivre"
          optional
          error={errors.online_url}
          hint="Affiché à tout le monde (un live public). Un lien réservé aux inscrit·es se met dans les infos privées, à l'étape Inscriptions."
        >
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} name="online_url" type="url" inputMode="url" defaultValue={values.online_url} placeholder="Ex : https://…" maxLength={EVENT_LIMITS.url} />
          )}
        </Field>
      </div>
    </>
  );
}

/* ---- 3. Visual ----------------------------------------------------------------------------- */

export function VisuelsStep({
  base,
  coverId,
  media,
  emblem,
  canUpload,
}: {
  base: StepBase;
  coverId: string;
  media: { id: string; path: string; kind: "logo" | "cover" | "image"; width: number; height: number; alt: string | null }[];
  /** An edition of one of the BDE's events of the year shows its emblem instead. */
  emblem: boolean;
  canUpload: boolean;
}) {
  const [selected, setSelected] = useState(coverId);
  const images = media.filter((m) => m.kind !== "logo");
  return (
    <StepForm base={base} step="visuels" next="inscriptions" nextLabel="Enregistrer et passer aux inscriptions">
      <CoverFields selected={selected} setSelected={setSelected} images={images} emblem={emblem} />
      {canUpload && !base.disabled && (
        <ImageUploader
          asso={base.asso}
          kind="cover"
          label="Ajouter une image"
          onUploaded={(m) => setSelected(m.id)}
        />
      )}
    </StepForm>
  );
}

function CoverFields({
  selected,
  setSelected,
  images,
  emblem,
}: {
  selected: string;
  setSelected: (id: string) => void;
  images: { id: string; path: string; width: number; height: number; alt: string | null }[];
  emblem: boolean;
}) {
  const errors = useErrors();
  return (
    <fieldset className="flex flex-col gap-3" aria-describedby="visuel-aide">
      <legend className="mb-1 text-[0.95rem] font-bold">L&apos;image de l&apos;événement</legend>
      <p id="visuel-aide" className="max-w-2xl type-small text-subtle">
        {emblem
          ? "Cette édition porte l'emblème de son événement de l'année sur sa page ; l'image sert aux partages et aux listes."
          : "Format paysage, sans texte dessus : le titre et la date sont écrits par le site. Sans image, l'affiche est composée avec les couleurs de l'asso."}{" "}
        Une image reste privée tant que l&apos;événement n&apos;est pas publié.
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
    </fieldset>
  );
}

/* ---- 4. Registration ----------------------------------------------------------------------- */

export function InscriptionsStep({
  base,
  values,
  counts,
}: {
  base: StepBase;
  values: {
    registration_mode: RegistrationMode;
    external_url: string;
    capacity: string;
    waitlist_enabled: boolean;
    opens: { date: string; time: string };
    closes: { date: string; time: string };
    cancellation_cutoff_minutes: number;
    access_details: string;
  };
  counts: { confirmed: number; waitlist: number };
}) {
  const [mode, setMode] = useState<RegistrationMode>(values.registration_mode);
  const [limited, setLimited] = useState(values.capacity !== "");
  const locked = counts.confirmed + counts.waitlist > 0;
  return (
    <StepForm base={base} step="inscriptions" next="apercu" nextLabel="Enregistrer et voir l'aperçu">
      {locked && (
        <p className="flex items-start gap-2 rounded-sm border-2 border-info/40 bg-info/5 p-3 type-small">
          <Icon name="users" size={16} className="mt-0.5 shrink-0 text-info" />
          <span>
            {plural(counts.confirmed, "inscrit·e", "inscrit·es")}
            {counts.waitlist > 0 && `, ${plural(counts.waitlist, "personne", "personnes")} en attente`}. Le mode
            d&apos;inscription ne peut plus changer, et la jauge ne peut pas descendre sous le nombre d&apos;inscrit·es. Si tu
            l&apos;augmentes, la liste d&apos;attente avance toute seule, dans l&apos;ordre.
          </span>
        </p>
      )}
      <RegistrationFields mode={mode} setMode={setMode} limited={limited} setLimited={setLimited} values={values} />
    </StepForm>
  );
}

function RegistrationFields({
  mode,
  setMode,
  limited,
  setLimited,
  values,
}: {
  mode: RegistrationMode;
  setMode: (m: RegistrationMode) => void;
  limited: boolean;
  setLimited: (v: boolean) => void;
  values: {
    external_url: string;
    capacity: string;
    waitlist_enabled: boolean;
    opens: { date: string; time: string };
    closes: { date: string; time: string };
    cancellation_cutoff_minutes: number;
    access_details: string;
  };
}) {
  const errors = useErrors();
  return (
    <>
      <Choice<RegistrationMode>
        legend="Comment on vient"
        name="registration_mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: "none", label: "Entrée libre", description: "Pas d'inscription : on vient." },
          { value: "internal", label: "Inscription ici", description: "Avec le compte de l'école, jauge et liste d'attente possibles." },
          { value: "external", label: "Ailleurs", description: "Une billetterie ou un formulaire de l'asso." },
        ]}
      />

      <div hidden={mode !== "external"}>
        <Field label="Page d'inscription" error={errors.external_url} hint="Adresse sécurisée (https://…). Elle s'ouvre dans un nouvel onglet.">
          {({ id, describedBy, invalid }) => (
            <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} name="external_url" type="url" inputMode="url" defaultValue={values.external_url} placeholder="Ex : https://…" maxLength={EVENT_LIMITS.url} />
          )}
        </Field>
      </div>

      <div hidden={mode !== "internal"} className="flex flex-col gap-8">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-[0.95rem] font-bold">Places</legend>
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-6">
            <label className="flex min-h-10 items-center gap-2.5">
              <input type="radio" name="capacity_kind" value="unlimited" checked={!limited} onChange={() => setLimited(false)} className="size-4 accent-[var(--accent)]" />
              <span>Pas de limite</span>
            </label>
            <label className="flex min-h-10 items-center gap-2.5">
              <input type="radio" name="capacity_kind" value="limited" checked={limited} onChange={() => setLimited(true)} className="size-4 accent-[var(--accent)]" />
              <span>Un nombre de places</span>
            </label>
          </div>
          <div hidden={!limited} className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre de places" error={errors.capacity}>
              {({ id, describedBy, invalid }) => (
                <Input id={id} aria-describedby={describedBy} aria-invalid={invalid} name="capacity" type="number" inputMode="numeric" min={1} max={EVENT_LIMITS.capacity} defaultValue={values.capacity} />
              )}
            </Field>
            <label className="flex items-start gap-2.5 self-end pb-3">
              <input type="checkbox" name="waitlist_enabled" defaultChecked={values.waitlist_enabled} className="mt-1 size-4 accent-[var(--accent)]" />
              <span className="flex flex-col">
                <span className="font-bold">Liste d&apos;attente</span>
                <span className="type-small text-subtle">Une fois complet, on s&apos;y inscrit ; une place libérée revient au suivant, automatiquement.</span>
              </span>
            </label>
          </div>
        </fieldset>

        <div className="grid gap-6 lg:grid-cols-2">
          <DateTimeField
            name="opens"
            label="Ouverture des inscriptions"
            optional
            hint="Vide : dès la publication."
            date={values.opens.date}
            time={values.opens.time}
          />
          <DateTimeField
            name="closes"
            label="Clôture des inscriptions"
            optional
            hint="Vide : au début de l'événement."
            date={values.closes.date}
            time={values.closes.time}
          />
        </div>

        <Field
          label="Annulation par l'étudiant·e"
          error={errors.cancellation_cutoff_minutes}
          hint="Jusqu'à quand on peut annuler soi-même en ligne. Une place rendue revient à la liste d'attente."
        >
          {({ id, describedBy, invalid }) => (
            <Select id={id} aria-describedby={describedBy} aria-invalid={invalid} name="cancellation_cutoff_minutes" defaultValue={String(values.cancellation_cutoff_minutes)}>
              {CANCELLATION_CUTOFFS.map((m) => (
                <option key={m} value={m}>
                  {cutoffLabel(m)}
                  {m > 0 ? " le début" : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field
          label="Infos réservées aux inscrit·es"
          optional
          error={errors.access_details}
          hint="Un lien de visio, un code d'accès, un point de rendez-vous : montré seulement aux places confirmées, jamais sur la page publique ni dans l'agenda."
        >
          {({ id, describedBy, invalid }) => (
            <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} name="access_details" defaultValue={values.access_details} maxLength={EVENT_LIMITS.access} rows={4} />
          )}
        </Field>
      </div>
    </>
  );
}
