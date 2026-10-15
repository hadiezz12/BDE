"use client";

import type { UserProfile } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { DemoActionButton, DemoForm } from "@/components/manage/DemoActions";
import { accountName } from "./identity";

/**
 * "Tes infos": name, programme, year, the school email (read-only: it is the
 * login), and a photo placeholder. Programme and year are free text with an
 * example, not a list we would have to invent. PHASE 1: saving keeps what
 * was typed and says that nothing is stored. On a demo account the fields
 * start empty (it is nobody) and a note says so.
 */
export function ProfileForm({
  user,
  className,
}: {
  user: Pick<UserProfile, "firstName" | "lastName" | "demoLabel" | "email" | "programme" | "year" | "avatar">;
  className?: string;
}) {
  const demo = Boolean(user.demoLabel);
  return (
    <DemoForm
      aria-label="Tes infos"
      className={className}
      notice="rien n'est enregistré pour l'instant. Tes modifications restent affichées tant que tu ne recharges pas la page."
    >
      <div className="flex flex-col gap-8">
        {demo && (
          <p className="flex gap-3 rounded-sm border-2 border-info/60 bg-info/10 p-4 leading-snug">
            <Icon name="info" size={20} className="mt-0.5 shrink-0 text-info" />
            <span>
              <strong>{user.demoLabel}.</strong> Ce compte ne correspond à personne : les champs sont vides. Avec les
              vrais comptes, ils se rempliront avec tes infos.
            </span>
          </p>
        )}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <Avatar name={accountName(user)} photo={user.avatar} accent="rose" size={88} className="border-2 border-fg" />
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
              <Input
                id={id}
                name="firstName"
                autoComplete="given-name"
                defaultValue={demo ? "" : user.firstName}
                placeholder="Ton prénom"
                aria-describedby={describedBy}
              />
            )}
          </Field>
          <Field label="Nom">
            {({ id, describedBy }) => (
              <Input
                id={id}
                name="lastName"
                autoComplete="family-name"
                defaultValue={demo ? "" : user.lastName}
                placeholder="Ton nom"
                aria-describedby={describedBy}
              />
            )}
          </Field>
          <Field label="Programme">
            {({ id, describedBy }) => (
              <Input
                id={id}
                name="programme"
                defaultValue={user.programme}
                placeholder="Ex : Bachelor"
                aria-describedby={describedBy}
              />
            )}
          </Field>
          <Field label="Année" hint="Sert aux bureaux qui recrutent, et aux événements réservés à une promo.">
            {({ id, describedBy }) => (
              <Input id={id} name="year" defaultValue={user.year} placeholder="Ex : 2A" aria-describedby={describedBy} />
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
                placeholder={user.email ? undefined : "Ton adresse mail GEM, avec les vrais comptes"}
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
