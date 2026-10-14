"use client";

import type { UserProfile } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { DemoActionButton, DemoForm } from "@/components/manage/DemoActions";

const PROGRAMMES = ["Programme Grande École", "Bachelor", "MSc", "Mastère spécialisé", "Échange"];
const YEARS = ["1A", "2A", "3A", "4A", "Césure"];

/** Keeps the student's current value selectable even when it's not in our short list. */
const withCurrent = (options: string[], current: string) => (options.includes(current) ? options : [current, ...options]);

/**
 * "Tes infos": name, programme, year, the school email (read-only: it is the
 * login), and a photo placeholder. PHASE 1: saving keeps what was typed and
 * says that nothing is stored.
 */
export function ProfileForm({
  user,
  className,
}: {
  user: Pick<UserProfile, "firstName" | "lastName" | "email" | "programme" | "year" | "avatar">;
  className?: string;
}) {
  const fullName = `${user.firstName} ${user.lastName}`;
  return (
    <DemoForm
      aria-label="Tes infos"
      className={className}
      notice="rien n'est enregistré pour l'instant. Tes modifications restent affichées tant que tu ne recharges pas la page."
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <Avatar name={fullName} photo={user.avatar} accent="rose" size={88} className="border-2 border-fg" />
          <div className="flex flex-col gap-2.5">
            <p className="type-small text-muted">
              {user.avatar
                ? "Ta photo apparaît dans le menu et sur tes candidatures."
                : "Pas encore de photo : tes initiales s'affichent à la place, dans le menu et sur tes candidatures."}
            </p>
            <DemoActionButton
              variant="secondary"
              size="sm"
              icon="upload"
              iconPosition="start"
              notice="l'envoi de photo arrive avec les vrais comptes. Rien n'est téléversé."
            >
              {user.avatar ? "Changer la photo" : "Ajouter une photo"}
            </DemoActionButton>
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Prénom">
            {({ id, describedBy }) => (
              <Input id={id} name="firstName" autoComplete="given-name" defaultValue={user.firstName} aria-describedby={describedBy} />
            )}
          </Field>
          <Field label="Nom">
            {({ id, describedBy }) => (
              <Input id={id} name="lastName" autoComplete="family-name" defaultValue={user.lastName} aria-describedby={describedBy} />
            )}
          </Field>
          <Field label="Programme">
            {({ id, describedBy }) => (
              <Select id={id} name="programme" defaultValue={user.programme} aria-describedby={describedBy}>
                {withCurrent(PROGRAMMES, user.programme).map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Année" hint="Sert aux bureaux qui recrutent, et aux événements réservés à une promo.">
            {({ id, describedBy }) => (
              <Select id={id} name="year" defaultValue={user.year} aria-describedby={describedBy}>
                {withCurrent(YEARS, user.year).map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field
            label="Adresse mail"
            className="sm:col-span-2"
            hint={
              <span className="inline-flex items-start gap-1.5">
                <Icon name="lock" size={14} className="mt-0.5 shrink-0" />
                C&apos;est ton adresse de l&apos;école : elle sert à te connecter, elle ne se change pas ici.
              </span>
            }
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                name="email"
                type="email"
                readOnly
                value={user.email}
                aria-describedby={describedBy}
                className="bg-sunken font-mono text-[0.9375rem] text-muted"
              />
            )}
          </Field>
        </div>

        <div>
          <Button type="submit" icon="check" iconPosition="start">
            Enregistrer mes infos
          </Button>
        </div>
      </div>
    </DemoForm>
  );
}
