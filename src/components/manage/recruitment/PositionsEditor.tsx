"use client";

import { createContext, useActionState, useContext, useState } from "react";
import { addPosition, movePosition, removePosition, savePosition, type RecruitmentActionState } from "@/app/actions/recruitment";
import type { GovernanceActionState } from "@/app/actions/governance";
import type { PositionRow } from "@/lib/recruitment/editor";
import { CAMPAIGN_LIMITS, type FieldErrors } from "@/lib/recruitment/input";
import { instantToParisLocal } from "@/lib/posts/schedule";
import { cx } from "@/lib/cx";
import { plural } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { DateTimeField, StepOutcome, YearsField } from "./CampaignSteps";

/**
 * The positions of a campaign: one card each, its fiche (what the student
 * will do, the time it takes, the places), its own closing date and study
 * years if they differ from the campaign's. Reordered with the arrows
 * (keyboard friendly). A position that received applications is closed
 * (retired), never deleted: its applications stay. Counts only.
 */

const ErrorsContext = createContext<FieldErrors>({});

export function PositionsEditor({
  campaignId,
  asso,
  positions,
  campaign,
  templates,
  disabled,
  published,
  canPublish,
  openId,
}: {
  campaignId: string;
  asso: string;
  positions: PositionRow[];
  campaign: { opensAt: string | null; closesAt: string | null };
  templates: { key: string; label: string }[];
  disabled: boolean;
  published: boolean;
  canPublish: boolean;
  /** The position to open (just added). */
  openId?: string;
}) {
  const live = positions.filter((p) => !p.retired_at);
  const retired = positions.filter((p) => p.retired_at);
  return (
    <div className="flex flex-col gap-8">
      <p className="max-w-2xl type-small text-muted">
        Chaque poste a sa fiche publique et son bouton « Candidater ». Les questions propres à un poste se règlent dans
        l&apos;étape Formulaire.
      </p>
      {live.length === 0 && <p className="type-small font-semibold">Pas encore de poste : ajoute le premier ci-dessous.</p>}
      <ol className="flex flex-col gap-4">
        {live.map((p, i) => (
          <li key={p.id}>
            <PositionCard
              position={p}
              index={i}
              total={live.length}
              campaignId={campaignId}
              asso={asso}
              campaign={campaign}
              templates={templates}
              disabled={disabled}
              published={published}
              canPublish={canPublish}
              open={p.id === openId}
            />
          </li>
        ))}
      </ol>
      {!disabled && positions.length < 20 && <AddPosition campaignId={campaignId} asso={asso} />}
      {retired.length > 0 && (
        <section aria-labelledby="postes-fermes" className="flex flex-col gap-3">
          <h3 id="postes-fermes" className="type-label text-muted">
            Postes fermés
          </h3>
          <ul className="flex flex-col border-y border-line">
            {retired.map((p) => (
              <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
                <span className="font-semibold">{p.title}</span>
                <span className="type-meta text-muted">
                  Fermé · {plural(p.submitted, "candidature envoyée", "candidatures envoyées")} gardée{p.submitted > 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PositionCard({
  position: p,
  index,
  total,
  campaignId,
  asso,
  campaign,
  templates,
  disabled,
  published,
  canPublish,
  open,
}: {
  position: PositionRow;
  index: number;
  total: number;
  campaignId: string;
  asso: string;
  campaign: { opensAt: string | null; closesAt: string | null };
  templates: { key: string; label: string }[];
  disabled: boolean;
  published: boolean;
  canPublish: boolean;
  open: boolean;
}) {
  const [state, dispatch, pending] = useActionState<RecruitmentActionState, FormData>(savePosition, { status: "idle" });
  const errors = state.status === "error" ? (state.fieldErrors ?? {}) : {};
  const closes = p.closes_at ? instantToParisLocal(p.closes_at) : { date: "", time: "" };
  const lockedLive = published && !canPublish;

  return (
    <article aria-labelledby={`poste-${p.id}`} className="rounded-sm border-2 border-line bg-raised">
      <header className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="type-meta text-subtle">
            Poste {index + 1}/{total}
            {p.team ? ` · ${p.team}` : ""}
          </p>
          <h3 id={`poste-${p.id}`} className="type-card break-words">
            {p.title}
          </h3>
          <p className="flex flex-wrap gap-x-4 type-small text-muted">
            {p.openings ? <span>{plural(p.openings, "place")}</span> : <span>Places non précisées</span>}
            <span>{plural(p.submitted, "candidature envoyée", "candidatures envoyées")}</span>
          </p>
        </div>
        {!disabled && (
          <div className="flex items-center gap-1">
            <MoveButton positionId={p.id} direction="up" disabled={index === 0} label={`Monter « ${p.title} »`} />
            <MoveButton positionId={p.id} direction="down" disabled={index === total - 1} label={`Descendre « ${p.title} »`} />
          </div>
        )}
      </header>

      <details open={open || undefined} className="group border-t border-line">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 type-label [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            <Icon name="edit" size={15} />
            {disabled ? "Voir la fiche du poste" : "Modifier la fiche du poste"}
          </span>
          <Icon name="chevron-down" size={16} className="transition-transform group-open:rotate-180" />
        </summary>
        <ErrorsContext value={errors}>
          <form action={dispatch} noValidate className="flex flex-col gap-6 px-4 pb-5 pt-2">
            <input type="hidden" name="position_id" value={p.id} />
            <input type="hidden" name="campaign_opens_at" value={campaign.opensAt ?? ""} />
            <input type="hidden" name="campaign_closes_at" value={campaign.closesAt ?? ""} />
            <fieldset disabled={disabled || pending} className="flex min-w-0 flex-col gap-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <PField name="title" label="Intitulé" value={p.title} max={CAMPAIGN_LIMITS.positionTitle} />
                <PField name="team" label="Pôle ou équipe" value={p.team ?? ""} max={CAMPAIGN_LIMITS.team} optional placeholder="Ex : Pôle partenariats" />
              </div>
              <PField name="summary" label="En une phrase" value={p.summary ?? ""} max={CAMPAIGN_LIMITS.positionSummary} optional />
              <PField name="description" label="Présentation" value={p.description ?? ""} max={CAMPAIGN_LIMITS.positionDescription} optional multiline />
              <div className="grid gap-4 sm:grid-cols-2">
                <PField
                  name="missions"
                  label="Les missions"
                  value={p.missions ?? ""}
                  max={CAMPAIGN_LIMITS.lines}
                  optional
                  multiline
                  hint="Une mission par ligne."
                />
                <PField
                  name="expectations"
                  label="Ce qu'on attend"
                  value={p.expectations ?? ""}
                  max={CAMPAIGN_LIMITS.lines}
                  optional
                  multiline
                  hint="Une attente par ligne."
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <PField
                  name="commitment"
                  label="Le temps que ça prend"
                  value={p.commitment ?? ""}
                  max={CAMPAIGN_LIMITS.commitment}
                  optional
                  placeholder="Ex : 3 à 4 h par semaine"
                  hint="Écrit « N h par semaine », il s'additionne sur la fiche."
                />
                <PField
                  name="openings"
                  label="Places"
                  value={p.openings ? String(p.openings) : ""}
                  max={2}
                  optional
                  type="number"
                  hint="Laisse vide si tu ne sais pas encore : le site n'affichera pas de nombre."
                />
              </div>
              {templates.length > 0 && (
                <Field label="Le poste qu'il deviendra" optional hint="Pour information : candidater ne donne aucun droit dans l'espace de l'asso.">
                  {({ id, describedBy }) => (
                    <Select id={id} aria-describedby={describedBy} name="template_key" defaultValue={p.template_key ?? ""}>
                      <option value="">Sans précision</option>
                      {templates.map((t) => (
                        <option key={t.key} value={t.key}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
              <fieldset disabled={lockedLive} className="flex min-w-0 flex-col gap-6">
                {lockedLive && (
                  <p className="type-small text-muted">
                    Le recrutement est en ligne : la date de fermeture et les années de ce poste se changent avec le droit « Publier
                    les recrutements ».
                  </p>
                )}
                <DateTimeField
                  name="closes"
                  label="Ce poste ferme plus tôt"
                  optional
                  date={closes.date}
                  time={closes.time}
                  error={errors.closes}
                  hint="Laisse vide : il ferme avec le recrutement."
                />
                <PositionYears years={p.eligible_years} errors={errors} />
              </fieldset>
            </fieldset>
            {!disabled && (
              <Button type="submit" variant="secondary" className="self-start" disabled={pending}>
                {pending ? "Un instant…" : "Enregistrer le poste"}
              </Button>
            )}
            <StepOutcome state={state} />
          </form>
        </ErrorsContext>
        {!disabled && <RemovePosition position={p} campaignId={campaignId} asso={asso} />}
      </details>
    </article>
  );
}

function PositionYears({ years, errors }: { years: number[] | null; errors: FieldErrors }) {
  return (
    <div className="flex flex-col gap-2">
      <YearsField years={years} allLabel="Comme le recrutement" allHint="La règle des dates et règles du recrutement s'applique." />
      {errors.eligible_years && (
        <p role="alert" className="type-small font-semibold text-danger">
          {errors.eligible_years}
        </p>
      )}
    </div>
  );
}

function PField({
  name,
  label,
  value,
  max,
  optional,
  multiline,
  hint,
  type = "text",
  placeholder,
}: {
  name: string;
  label: string;
  value: string;
  max: number;
  optional?: boolean;
  multiline?: boolean;
  hint?: string;
  type?: string;
  placeholder?: string;
}) {
  const error = useContext(ErrorsContext)[name];
  return (
    <Field label={label} hint={hint} error={error} optional={optional}>
      {({ id, describedBy, invalid }) =>
        multiline ? (
          <Textarea id={id} aria-describedby={describedBy} aria-invalid={invalid} name={name} defaultValue={value} maxLength={max} rows={5} />
        ) : (
          <Input
            id={id}
            aria-describedby={describedBy}
            aria-invalid={invalid}
            name={name}
            defaultValue={value}
            maxLength={type === "number" ? undefined : max}
            type={type}
            min={type === "number" ? 1 : undefined}
            max={type === "number" ? 99 : undefined}
            placeholder={placeholder}
            autoComplete="off"
            className={type === "number" ? "max-w-32" : undefined}
          />
        )
      }
    </Field>
  );
}

function MoveButton({ positionId, direction, disabled, label }: { positionId: string; direction: "up" | "down"; disabled: boolean; label: string }) {
  const [, dispatch, pending] = useActionState<GovernanceActionState, FormData>(movePosition, { status: "idle" });
  return (
    <form action={dispatch}>
      <input type="hidden" name="position_id" value={positionId} />
      <input type="hidden" name="direction" value={direction} />
      <button
        type="submit"
        disabled={disabled || pending}
        aria-label={label}
        className="grid size-11 place-items-center rounded-sm border border-line text-fg transition-colors hover:border-fg disabled:opacity-30"
      >
        <Icon name="chevron-down" size={18} className={cx(direction === "up" && "rotate-180")} />
      </button>
    </form>
  );
}

function RemovePosition({ position: p, campaignId, asso }: { position: PositionRow; campaignId: string; asso: string }) {
  const [state, dispatch, pending] = useActionState<GovernanceActionState, FormData>(removePosition, { status: "idle" });
  const [confirming, setConfirming] = useState(false);
  return (
    <form action={dispatch} className="flex flex-col gap-2 border-t border-dashed border-line px-4 py-4">
      <input type="hidden" name="position_id" value={p.id} />
      <input type="hidden" name="campaign_id" value={campaignId} />
      <input type="hidden" name="organization_slug" value={asso} />
      {confirming ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="type-small">
            {p.has_applications
              ? "Ce poste a reçu des candidatures : il sera fermé (plus de nouvelle candidature, retiré de la fiche), pas supprimé."
              : "Le poste et ses questions dans le brouillon du formulaire seront supprimés."}
          </p>
          <Button type="submit" variant="danger" size="sm" disabled={pending}>
            {p.has_applications ? "Fermer le poste" : "Supprimer le poste"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Garder
          </Button>
        </div>
      ) : (
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={() => setConfirming(true)}>
          {p.has_applications ? "Fermer ce poste" : "Supprimer ce poste"}
        </Button>
      )}
      {state.status === "error" && state.message && (
        <p role="alert" className="type-small font-semibold text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}

function AddPosition({ campaignId, asso }: { campaignId: string; asso: string }) {
  const [state, dispatch, pending] = useActionState<GovernanceActionState, FormData>(addPosition, { status: "idle" });
  return (
    <form action={dispatch} className="flex flex-col gap-3 rounded-sm border-2 border-dashed border-line-strong p-4">
      <input type="hidden" name="campaign_id" value={campaignId} />
      <input type="hidden" name="organization_slug" value={asso} />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Nouveau poste" className="min-w-0 flex-1" hint="Ex : « Trésorerie », « Communication ». La fiche se complète ensuite.">
          {({ id, describedBy }) => (
            <Input id={id} aria-describedby={describedBy} name="title" maxLength={CAMPAIGN_LIMITS.positionTitle} required autoComplete="off" />
          )}
        </Field>
        <Button type="submit" icon="plus" iconPosition="start" disabled={pending} className="sm:mb-[1.85rem]">
          {pending ? "Un instant…" : "Ajouter"}
        </Button>
      </div>
      {state.status === "error" && state.message && (
        <p role="alert" className="type-small font-semibold text-danger">
          {state.message}
        </p>
      )}
    </form>
  );
}

