"use client";

import { Fragment, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { ChoiceGroup, Field, Input, Textarea } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";

/**
 * Anonymous alert form — PHASE 1 DEMO: nothing is sent, nothing is stored.
 * The demo notice sits above the first field, so it is read before anyone
 * types; on submit the same fact is repeated next to the button and every
 * answer stays on screen. Autofill is off: a stray saved e-mail must never
 * end up in an anonymous report.
 */
export interface Helpline {
  number: string;
  href: string;
}

const WHO = [
  { value: "concerne", label: "Directement concerné·e" },
  { value: "temoin", label: "Témoin" },
  { value: "non-precise", label: "Je préfère ne pas dire" },
];

const NATURE = [
  { value: "violence-sexuelle", label: "Violence sexuelle", description: "Agression, geste ou contact non consenti." },
  { value: "harcelement", label: "Harcèlement", description: "Répété, en vrai ou en ligne." },
  { value: "sexisme", label: "Propos ou comportement sexiste", description: "Remarques, humiliations, pression." },
  { value: "discrimination", label: "Discrimination", description: "Racisme, LGBTphobie, validisme…" },
  { value: "autre", label: "Autre, ou je ne sais pas", description: "Décris-le avec tes mots." },
];

export function ReportForm({ helplines }: { helplines: Helpline[] }) {
  const [attempted, setAttempted] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAttempted(true);
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
    <form onSubmit={onSubmit} className="flex flex-col gap-8">
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

      <ChoiceGroup legend="Tu es…" name="qui" options={WHO} />
      <ChoiceGroup legend="Nature de l'alerte" name="nature" options={NATURE} />

      <Field label="Où et quand ?" optional hint="Une soirée, un cours, un groupe de messages… Une heure approximative suffit.">
        {({ id, describedBy }) => (
          <Input
            id={id}
            name="lieu"
            aria-describedby={describedBy}
            autoComplete="off"
            placeholder="Ex. : Boo Party, près du vestiaire, vers 2h"
          />
        )}
      </Field>

      <Field
        label="Ce qui s'est passé"
        hint="Avec tes mots, autant ou aussi peu que tu veux. Tu n'as pas besoin de citer de nom."
      >
        {({ id, describedBy }) => (
          <Textarea id={id} name="recit" aria-describedby={describedBy} required rows={6} />
        )}
      </Field>

      <Field
        label="Un moyen de te répondre"
        optional
        hint="Laisse vide pour rester anonyme. Si tu l'écris, seule la cellule le verra."
      >
        {({ id, describedBy }) => (
          <Input
            id={id}
            name="contact"
            type="email"
            inputMode="email"
            aria-describedby={describedBy}
            autoComplete="off"
            spellCheck={false}
            placeholder="prenom.nom@gem.exemple.fr"
          />
        )}
      </Field>

      <div className="flex flex-col gap-4 border-t border-line pt-6">
        <Button type="submit" size="lg" icon="arrow-right" className="self-start max-sm:w-full">
          Envoyer l&apos;alerte
        </Button>
        <div role="status" aria-live="polite">
          {attempted && (
            <p className="flex gap-3 rounded-sm border-2 border-info/60 bg-info/10 p-4 font-semibold leading-snug">
              <Icon name="info" size={20} className="mt-0.5 shrink-0 text-info" />
              <span>
                Version de démonstration : rien n&apos;est envoyé pour l&apos;instant. Tes réponses restent affichées
                ici et n&apos;ont pas quitté ton appareil.
              </span>
            </p>
          )}
        </div>
      </div>
    </form>
  );
}
