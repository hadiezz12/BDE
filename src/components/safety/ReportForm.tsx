"use client";

import { Fragment, useId, useState, type FormEvent } from "react";
import type { SafetyAlertKind } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import { ChoiceGroup, Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";

/**
 * The confidential alert form, field for field as the BDE wrote it: lieu,
 * date and nature of the alert (required), first and last name (optional),
 * then phone and GEM e-mail — at least one of the two, so the bureau can
 * answer. No account, no name required.
 *
 * PHASE 1 DEMO: nothing is sent, nothing is stored. The demo notice sits
 * above the first field, so it is read before anyone types; on a valid
 * submit the same fact is repeated next to the button and every answer
 * stays on screen. Autofill is off: a stray saved identity must never end up
 * in an alert by accident.
 */
export interface Helpline {
  number: string;
  href: string;
}

type FieldName = "lieu" | "date" | "nature" | "contact";
type Errors = Partial<Record<FieldName, string>>;

const ORDER: FieldName[] = ["lieu", "date", "nature", "contact"];

function Required() {
  return (
    <span aria-hidden className="ml-1 text-warn">
      *
    </span>
  );
}

export function ReportForm({ helplines, kinds }: { helplines: Helpline[]; kinds: SafetyAlertKind[] }) {
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const natureErrorId = useId();
  const contactErrorId = useId();
  const contactHintId = useId();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? "").trim();

    const next: Errors = {};
    if (!text("lieu")) next.lieu = "Indique le lieu de l'événement.";
    if (!text("date")) next.date = "Indique la date de l'événement.";
    if (!text("nature")) next.nature = "Choisis la nature de l'alerte.";
    if (!text("telephone") && !text("mail")) next.contact = "Laisse au moins un moyen de te joindre : téléphone ou mail GEM.";

    setErrors(next);
    const first = ORDER.find((k) => next[k]);
    if (first) {
      setSubmitted(false);
      const target =
        first === "nature"
          ? form.querySelector<HTMLInputElement>('input[name="nature"]')
          : first === "contact"
            ? form.querySelector<HTMLInputElement>('input[name="telephone"]')
            : form.querySelector<HTMLInputElement>(`input[name="${first}"]`);
      target?.focus();
      return;
    }
    setSubmitted(true);
  }

  const numbers = helplines.map((h, i) => (
    <Fragment key={h.number}>
      {i > 0 && (i === helplines.length - 1 ? " ou " : ", ")}
      <a href={h.href} className="link font-bold text-fg">
        {h.number}
      </a>
    </Fragment>
  ));

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      <div className="flex gap-3 rounded-sm border-2 border-dashed border-line-strong bg-sunken p-4 sm:p-5">
        <Icon name="info" size={20} className="mt-0.5 shrink-0 text-info" />
        <div className="flex flex-col gap-1.5">
          <p className="font-bold leading-snug">Version de démonstration : ce formulaire n&apos;envoie rien pour l&apos;instant.</p>
          <p className="type-small text-muted">
            Tu peux le parcourir, mais ton alerte n&apos;arrivera à personne. Si tu as besoin d&apos;aide maintenant :{" "}
            {numbers}.
          </p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field
          label={
            <>
              Lieu de l&apos;événement
              <Required />
            </>
          }
          error={errors.lieu}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="lieu"
              aria-describedby={describedBy}
              aria-required
              aria-invalid={invalid || undefined}
              autoComplete="off"
              placeholder="Ex : Boo Party, campus, en ligne…"
            />
          )}
        </Field>
        <Field
          label={
            <>
              Date de l&apos;événement
              <Required />
            </>
          }
          error={errors.date}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              name="date"
              type="date"
              aria-describedby={describedBy}
              aria-required
              aria-invalid={invalid || undefined}
              autoComplete="off"
            />
          )}
        </Field>
      </div>

      <div className="flex flex-col gap-2">
        <ChoiceGroup
          legend={
            <>
              Nature de l&apos;alerte
              <Required />
            </>
          }
          name="nature"
          options={kinds}
          describedBy={errors.nature ? natureErrorId : undefined}
        />
        {errors.nature && (
          <p id={natureErrorId} className="type-small font-semibold text-danger">
            {errors.nature}
          </p>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Prénom" optional>
          {({ id, describedBy }) => (
            <Input id={id} name="prenom" aria-describedby={describedBy} autoComplete="off" spellCheck={false} />
          )}
        </Field>
        <Field label="Nom" optional>
          {({ id, describedBy }) => (
            <Input id={id} name="nom" aria-describedby={describedBy} autoComplete="off" spellCheck={false} />
          )}
        </Field>
      </div>

      <fieldset
        aria-describedby={[contactHintId, errors.contact ? contactErrorId : null].filter(Boolean).join(" ")}
        className="flex flex-col gap-4"
      >
        <legend className="mb-1 text-[0.95rem] font-bold">Un moyen de te joindre</legend>
        <p id={contactHintId} className="-mt-2 type-small text-subtle">
          Téléphone ou mail GEM : au moins l&apos;un des deux, pour qu&apos;on puisse te répondre.
        </p>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Téléphone">
            {({ id }) => (
              <Input
                id={id}
                name="telephone"
                type="tel"
                inputMode="tel"
                aria-invalid={errors.contact ? true : undefined}
                autoComplete="off"
              />
            )}
          </Field>
          <Field label="Mail GEM">
            {({ id }) => (
              <Input
                id={id}
                name="mail"
                type="email"
                inputMode="email"
                aria-invalid={errors.contact ? true : undefined}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </Field>
        </div>
        {errors.contact && (
          <p id={contactErrorId} className="type-small font-semibold text-danger">
            {errors.contact}
          </p>
        )}
      </fieldset>

      <p className="type-small text-muted">
        <span aria-hidden className="text-warn">
          *
        </span>{" "}
        Champs obligatoires. Il faut au moins un moyen de te joindre : téléphone ou mail GEM. Ton nom reste
        facultatif.
      </p>

      <div className="flex flex-col gap-4 border-t border-line pt-6">
        <Button type="submit" size="lg" icon="arrow-right" className="self-start max-sm:w-full">
          Déposer l&apos;alerte
        </Button>
        <div role="status" aria-live="polite">
          {submitted && (
            <p className="flex gap-3 rounded-sm border-2 border-info/60 bg-info/10 p-4 font-semibold leading-snug">
              <Icon name="info" size={20} className="mt-0.5 shrink-0 text-info" />
              <span>
                Version de démonstration : rien n&apos;est envoyé pour l&apos;instant. Tes réponses restent affichées
                ici et n&apos;ont pas quitté ton appareil.
              </span>
            </p>
          )}
        </div>
        <p className="flex gap-3 text-muted">
          <Icon name="alert" size={18} className="mt-0.5 shrink-0 text-warn" />
          <span>
            En cas de danger immédiat, appelle le{" "}
            <a href="tel:112" className="link font-bold text-fg">
              112
            </a>
            . Ce dépôt ne remplace pas un dépôt de plainte, mais nous t&apos;accompagnons si tu le souhaites.
          </span>
        </p>
      </div>
    </form>
  );
}
