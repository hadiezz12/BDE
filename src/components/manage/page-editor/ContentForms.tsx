"use client";

import { useState, type ReactNode } from "react";
import { SOCIAL_PLATFORMS, type DraftValues } from "@/lib/associations/validation";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/Field";
import { Icon, type IconName } from "@/components/ui/Icon";
import { CharCount, DraftForm } from "./DraftForm";

/**
 * The three text sections of the page editor. Field names and limits match
 * src/lib/associations/validation.ts (which the server action runs) and the
 * database checks behind it. Examples in placeholders are marked "Ex :" and
 * never prefilled: an empty field stays empty on the public page.
 */

interface CommonProps {
  organizationId: string;
  draft: DraftValues;
  readOnly?: boolean;
  next?: string;
  submitLabel?: string;
}

function pick<K extends keyof DraftValues>(draft: DraftValues, keys: K[]): Pick<DraftValues, K> {
  return Object.fromEntries(keys.map((k) => [k, draft[k]])) as Pick<DraftValues, K>;
}

// ---- Identity and categories ------------------------------------------------------------

export function IdentityForm({
  organizationId,
  draft,
  categories,
  isBde,
  readOnly,
  next,
  submitLabel,
}: CommonProps & {
  categories: { id: string; label: string; archived: boolean }[];
  isBde: boolean;
}) {
  const [tagline, setTagline] = useState(draft.tagline ?? "");
  const [chosen, setChosen] = useState<string[]>(draft.category_ids);
  const base = pick(draft, ["name", "short_name", "kind_label", "tagline", "category_ids"]);

  return (
    <DraftForm
      organizationId={organizationId}
      section="identity"
      base={isBde ? pick(draft, ["name", "short_name", "kind_label", "tagline"]) : base}
      known={categories.map((c) => c.id)}
      label="Identité"
      readOnly={readOnly}
      next={next}
      submitLabel={submitLabel}
    >
      {(errors) => (
        <>
          <div className="grid gap-5 md:grid-cols-2">
            <Field label="Nom" error={errors.name} hint="Le nom affiché partout : annuaire, page, événements.">
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  name="name"
                  defaultValue={draft.name}
                  required
                  minLength={2}
                  maxLength={80}
                />
              )}
            </Field>
            <Field
              label="Nom court"
              optional
              error={errors.short_name}
              hint="Pour les espaces serrés, des initiales par exemple. 20 caractères au plus."
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  name="short_name"
                  defaultValue={draft.short_name ?? ""}
                  maxLength={20}
                />
              )}
            </Field>
            <Field
              label="Type d'association"
              optional
              error={errors.kind_label}
              hint={isBde ? "Ex : Bureau des étudiants." : "Ta ligne officielle. Ex : Association sportive, Junior-Entreprise."}
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  name="kind_label"
                  defaultValue={draft.kind_label ?? ""}
                  maxLength={60}
                />
              )}
            </Field>
            <Field
              label="Accroche"
              error={errors.tagline}
              hint={
                <span className="flex flex-wrap justify-between gap-2">
                  <span>Une ligne, comme vous parlez. Obligatoire pour publier.</span>
                  <CharCount value={tagline} max={140} />
                </span>
              }
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  name="tagline"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  maxLength={140}
                />
              )}
            </Field>
          </div>

          {!isBde && (
            <fieldset className="flex flex-col gap-3" aria-describedby="categories-hint">
              <legend className="mb-1 text-[0.95rem] font-bold">Catégories</legend>
              <input type="hidden" name="categories_present" value="1" />
              <p id="categories-hint" className="type-small text-subtle">
                Une à trois, pour les filtres de la page Associations. Il en faut une pour publier. La liste est tenue
                par le BDE.
              </p>
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                {categories.map((c) => {
                  const checked = chosen.includes(c.id);
                  return (
                    <Checkbox
                      key={c.id}
                      name="category_ids"
                      value={c.id}
                      checked={checked}
                      disabled={!checked && chosen.length >= 3}
                      onChange={(e) =>
                        setChosen((list) =>
                          e.target.checked ? [...list, c.id] : list.filter((id) => id !== c.id),
                        )
                      }
                      label={c.label}
                      description={c.archived ? "Archivée par le BDE : retire-la quand tu peux." : undefined}
                    />
                  );
                })}
              </div>
              {errors.category_ids && (
                <p role="alert" className="type-small font-semibold text-danger">
                  {errors.category_ids}
                </p>
              )}
            </fieldset>
          )}
        </>
      )}
    </DraftForm>
  );
}

// ---- Presentation and key points ----------------------------------------------------------

export function PresentationForm({ organizationId, draft, readOnly, next, submitLabel }: CommonProps) {
  const [description, setDescription] = useState(draft.description ?? "");
  const pillars = Array.from({ length: 3 }, (_, i) => draft.pillars[i] ?? { title: "", detail: "" });
  const year = new Date().getFullYear();

  return (
    <DraftForm
      organizationId={organizationId}
      section="presentation"
      base={pick(draft, ["description", "meeting_info", "founded_year", "pillars"])}
      label="Présentation"
      readOnly={readOnly}
      next={next}
      submitLabel={submitLabel}
    >
      {(errors) => (
        <>
          <Field
            label="Présentation"
            error={errors.description}
            hint={
              <span className="flex flex-wrap justify-between gap-2">
                <span>
                  Qui vous êtes, ce que vous faites, comment vous rejoindre. Laisse une ligne vide entre deux
                  paragraphes. Obligatoire pour publier.
                </span>
                <CharCount value={description} max={4000} />
              </span>
            }
          >
            {({ id, describedBy, invalid }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                name="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={10}
                maxLength={4000}
              />
            )}
          </Field>
          <div className="grid gap-5 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <Field
              label="Où et quand vous trouver"
              optional
              error={errors.meeting_info}
              hint="Permanence, local, horaires. Ex : le mardi à 12 h 30, au local de l'asso."
            >
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  name="meeting_info"
                  defaultValue={draft.meeting_info ?? ""}
                  maxLength={300}
                />
              )}
            </Field>
            <Field label="Année de création" optional error={errors.founded_year}>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid}
                  name="founded_year"
                  type="number"
                  inputMode="numeric"
                  min={1850}
                  max={year}
                  defaultValue={draft.founded_year ?? ""}
                />
              )}
            </Field>
          </div>

          <fieldset className="flex flex-col gap-4">
            <legend className="mb-1 text-[0.95rem] font-bold">Points forts (facultatif)</legend>
            <p className="-mt-2 type-small text-subtle">
              Jusqu&apos;à trois choses à savoir d&apos;abord : un titre court, et une phrase pour l&apos;expliquer.
            </p>
            <ol className="flex flex-col gap-5">
              {pillars.map((pillar, i) => (
                <li
                  key={i}
                  className="grid gap-4 border-t border-line pt-4 md:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1.6fr)] md:items-start"
                >
                  <span aria-hidden className="type-numeral text-[1.75rem] text-subtle md:pt-7">
                    {i + 1}
                  </span>
                  <Field label={`Point ${i + 1} : titre`} optional error={errors[`pillar_${i + 1}_title`]}>
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        aria-describedby={describedBy}
                        aria-invalid={invalid}
                        name={`pillar_${i + 1}_title`}
                        defaultValue={pillar.title}
                        maxLength={60}
                      />
                    )}
                  </Field>
                  <Field label={`Point ${i + 1} : explication`} optional error={errors[`pillar_${i + 1}_detail`]}>
                    {({ id, describedBy, invalid }) => (
                      <Textarea
                        id={id}
                        aria-describedby={describedBy}
                        aria-invalid={invalid}
                        name={`pillar_${i + 1}_detail`}
                        defaultValue={pillar.detail}
                        rows={3}
                        maxLength={280}
                        className="min-h-24"
                      />
                    )}
                  </Field>
                </li>
              ))}
            </ol>
          </fieldset>
        </>
      )}
    </DraftForm>
  );
}

// ---- Contact and social links ---------------------------------------------------------------

const PLATFORM_ICON: Record<string, IconName> = {
  instagram: "instagram",
  tiktok: "tiktok",
  linkedin: "linkedin",
  youtube: "youtube",
  facebook: "facebook",
  x: "x",
  website: "globe",
};

function IconLabel({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Icon name={icon} size={16} className="text-muted" />
      {children}
    </span>
  );
}

export function ContactForm({ organizationId, draft, readOnly, next, submitLabel }: CommonProps) {
  const link = (platform: string) => draft.social_links.find((l) => l.platform === platform)?.url ?? "";
  return (
    <DraftForm
      organizationId={organizationId}
      section="contact"
      base={pick(draft, ["contact_email", "social_links"])}
      label="Contact et réseaux"
      readOnly={readOnly}
      next={next}
      submitLabel={submitLabel}
    >
      {(errors) => (
        <>
          <Field
            label={<IconLabel icon="mail">Mail de contact</IconLabel>}
            optional
            error={errors.contact_email}
            hint="Une adresse de l'asso plutôt qu'une perso : elle reste quand le bureau change. Elle sera publique."
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                type="email"
                name="contact_email"
                defaultValue={draft.contact_email ?? ""}
                placeholder="Ex : contact@ton-asso.fr"
                autoComplete="off"
                spellCheck={false}
                className="md:max-w-xl"
              />
            )}
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            {SOCIAL_PLATFORMS.map((p) => (
              <Field
                key={p.platform}
                label={<IconLabel icon={PLATFORM_ICON[p.platform]}>{p.label}</IconLabel>}
                optional
                error={errors[`social_${p.platform}`]}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    aria-invalid={invalid}
                    name={`social_${p.platform}`}
                    defaultValue={link(p.platform)}
                    placeholder={p.example}
                    inputMode="url"
                    autoComplete="off"
                    spellCheck={false}
                  />
                )}
              </Field>
            ))}
          </div>
          <p className="type-small text-subtle">
            Seuls les liens https vers la plateforme indiquée sont acceptés ; « @compte » suffit pour Instagram,
            TikTok, YouTube et X.
          </p>
        </>
      )}
    </DraftForm>
  );
}
