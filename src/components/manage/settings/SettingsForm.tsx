"use client";

import { useId, useState, type ReactNode } from "react";
import type { AccentKey, Association, SocialLink } from "@/lib/types";
import { MEDIA_SLOTS } from "@/lib/media-slots";
import { Button } from "@/components/ui/Button";
import { Field, Input, Textarea } from "@/components/ui/Field";
import { Icon, type IconName } from "@/components/ui/Icon";
import { MediaFrame } from "@/components/media/MediaFrame";
import { AssociationLogo } from "@/components/associations/AssociationLogo";
import { ManageSection } from "@/components/manage/ManagePageHeader";
import { DemoForm } from "@/components/manage/DemoActions";
import { MediaUpload } from "@/components/manage/media/MediaUpload";
import { AccentPicker, AccentPreview } from "./AccentPicker";

/**
 * PHASE 1 — the association's public profile, as a form. Everything typed
 * stays in the fields; "Enregistrer" only says that nothing is saved yet
 * (DemoForm). The colour picker previews live on night and paper; the name,
 * type and tagline feed the preview as they are typed.
 */
export type SettingsAssociation = Pick<
  Association,
  | "slug"
  | "name"
  | "shortName"
  | "kind"
  | "tagline"
  | "description"
  | "contactEmail"
  | "meetingInfo"
  | "highlights"
  | "pillars"
  | "socials"
  | "accent"
  | "logo"
  | "cover"
>;

const SOCIALS: { kind: SocialLink["kind"]; label: string; icon: IconName; placeholder: string }[] = [
  { kind: "instagram", label: "Instagram", icon: "instagram", placeholder: "Ex : https://www.instagram.com/ton-asso/" },
  { kind: "tiktok", label: "TikTok", icon: "tiktok", placeholder: "Ex : https://www.tiktok.com/@ton-asso" },
  { kind: "linkedin", label: "LinkedIn", icon: "linkedin", placeholder: "Ex : https://www.linkedin.com/company/ton-asso/" },
  { kind: "site", label: "Site web", icon: "globe", placeholder: "Ex : https://ton-asso.fr" },
];

const COVER = MEDIA_SLOTS["association-cover"];

/** The public page shows up to three key points ("<asso> en 3 points"). */
const PILLAR_SLOTS = 3;

function IconLabel({ icon, children }: { icon: IconName; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Icon name={icon} size={16} className="text-muted" />
      {children}
    </span>
  );
}

export function SettingsForm({ association, publicPath }: { association: SettingsAssociation; publicPath: string }) {
  const accentHintId = useId();
  const [accent, setAccent] = useState<AccentKey>(association.accent);
  const [preview, setPreview] = useState({
    name: association.name,
    shortName: association.shortName ?? "",
    kind: association.kind,
    tagline: association.tagline,
  });
  const live = (key: keyof typeof preview) => (e: { target: { value: string } }) =>
    setPreview((p) => ({ ...p, [key]: e.target.value }));

  const social = (kind: SocialLink["kind"]) => association.socials.find((s) => s.kind === kind)?.href ?? "";

  // The written pillars, or the bare highlights when no explanation exists yet; empty slots after.
  const written = association.pillars?.length
    ? association.pillars
    : (association.highlights ?? []).map((title) => ({ title, detail: "" }));
  const pillars = Array.from({ length: PILLAR_SLOTS }, (_, i) => written[i] ?? { title: "", detail: "" });

  return (
    <DemoForm
      aria-label={`Réglages de ${association.name}`}
      notice="rien n'est enregistré pour l'instant. Tes modifications restent dans le formulaire tant que tu ne quittes pas la page."
      onReset={() => {
        setAccent(association.accent);
        setPreview({
          name: association.name,
          shortName: association.shortName ?? "",
          kind: association.kind,
          tagline: association.tagline,
        });
      }}
      className="flex flex-col gap-12"
    >
      <ManageSection
        title="Identité"
        description="Ce qui s'affiche en tête de la page publique, dans l'annuaire des assos et sur chaque événement."
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            label="Nom"
            hint={
              <>
                L&apos;adresse de la page ne change pas&nbsp;: <span className="type-meta">{publicPath}</span>
              </>
            }
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                name="name"
                defaultValue={association.name}
                onChange={live("name")}
                maxLength={60}
                required
              />
            )}
          </Field>
          <Field label="Nom court" optional hint="Pour les espaces serrés, des initiales par exemple. 12 caractères au plus.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                name="shortName"
                defaultValue={association.shortName ?? ""}
                onChange={live("shortName")}
                maxLength={12}
              />
            )}
          </Field>
          <Field label="Type d'association" hint="Ta ligne officielle, par exemple « Bureau des étudiants ».">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                name="kind"
                defaultValue={association.kind}
                onChange={live("kind")}
                maxLength={60}
                required
              />
            )}
          </Field>
          <Field label="Accroche" hint="Une ligne, comme vous parlez. 90 caractères au plus.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                name="tagline"
                defaultValue={association.tagline}
                onChange={live("tagline")}
                maxLength={90}
                required
              />
            )}
          </Field>
        </div>
      </ManageSection>

      <ManageSection title="Présentation" description="Le texte de la page publique, sous la couverture.">
        <div className="grid gap-5">
          <Field
            label="Description"
            hint="Laisse une ligne vide entre deux paragraphes. Trois paragraphes courts se lisent mieux qu'un long."
          >
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                name="description"
                defaultValue={association.description.join("\n\n")}
                rows={10}
                required
              />
            )}
          </Field>
          <Field
            label="Où et quand vous trouver"
            optional
            hint="Permanence, local, horaires : où et quand on peut passer vous voir."
          >
            {({ id, describedBy }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                name="meetingInfo"
                defaultValue={association.meetingInfo ?? ""}
                rows={3}
                className="min-h-24"
              />
            )}
          </Field>
        </div>
      </ManageSection>

      <ManageSection
        title="En trois points"
        description="Ce que les étudiant·es lisent d'abord sur ta page : un titre court par point, et une phrase pour l'expliquer. Laisse vide ce que vous n'avez pas."
      >
        <ol className="flex flex-col gap-6">
          {pillars.map((pillar, i) => (
            <li
              key={i}
              className="grid gap-4 border-t border-line pt-5 first:border-t-0 first:pt-0 md:grid-cols-[3rem_minmax(0,1fr)_minmax(0,1.6fr)] md:items-start"
            >
              <span aria-hidden className="type-numeral text-[2rem] text-subtle md:pt-6">
                {String(i + 1).padStart(2, "0")}
              </span>
              <Field label={`Point ${i + 1} : titre`} optional>
                {({ id, describedBy }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    name={`pillar-${i + 1}-title`}
                    defaultValue={pillar.title}
                    maxLength={60}
                  />
                )}
              </Field>
              <Field label={`Point ${i + 1} : explication`} optional>
                {({ id, describedBy }) => (
                  <Textarea
                    id={id}
                    aria-describedby={describedBy}
                    name={`pillar-${i + 1}-detail`}
                    defaultValue={pillar.detail}
                    rows={3}
                    className="min-h-24"
                  />
                )}
              </Field>
            </li>
          ))}
        </ol>
      </ManageSection>

      <ManageSection title="Contact et réseaux" description="Affichés en bas de la page publique. Laisse vide ce que vous n'avez pas.">
        <div className="grid gap-5 md:grid-cols-2">
          <Field
            label={<IconLabel icon="mail">Mail de contact</IconLabel>}
            optional
            hint="Une adresse de l'asso plutôt qu'une perso : elle reste quand le bureau change."
            className="md:col-span-2"
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                type="email"
                name="contactEmail"
                defaultValue={association.contactEmail ?? ""}
                placeholder="Ex : contact@ton-asso.fr"
                autoComplete="off"
                spellCheck={false}
                className="md:max-w-xl"
              />
            )}
          </Field>
          {SOCIALS.map((s) => (
            <Field key={s.kind} label={<IconLabel icon={s.icon}>{s.label}</IconLabel>} optional>
              {({ id, describedBy }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  type="url"
                  inputMode="url"
                  name={`social-${s.kind}`}
                  defaultValue={social(s.kind)}
                  placeholder={s.placeholder}
                  autoComplete="off"
                  spellCheck={false}
                />
              )}
            </Field>
          ))}
        </div>
      </ManageSection>

      <ManageSection title="Couleur">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:items-start">
          <div className="flex flex-col gap-3">
            <AccentPicker name="accent" value={accent} saved={association.accent} onChange={setAccent} describedBy={accentHintId} />
            <p id={accentHintId} className="type-small text-subtle">
              Huit couleurs, celles des emblèmes néon du BDE. Chacune reste lisible sur le site de nuit, sur papier et
              dans cet espace&nbsp;: pas de code couleur libre.
            </p>
          </div>
          <AccentPreview
            association={{
              name: preview.name,
              shortName: preview.shortName || undefined,
              kind: preview.kind,
              accent,
              logo: association.logo,
            }}
            tagline={preview.tagline}
          />
        </div>
      </ManageSection>

      <ManageSection
        title="Logo et couverture"
        description="Les nouveaux fichiers remplacent les anciens partout sur le site. Les anciens restent dans les médias."
      >
        <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-3">
            <h3 className="type-label text-subtle">Logo</h3>
            <div data-accent={accent} className="flex items-center gap-4">
              <AssociationLogo
                association={{ name: preview.name, shortName: preview.shortName || undefined, accent, logo: association.logo }}
                size={72}
              />
              <p className="type-small text-muted">
                {association.logo ? "Affiché dans un rond, sur fond noir." : "Pas de logo : on affiche tes initiales dans ta couleur."}
              </p>
            </div>
            <MediaUpload
              label="Changer le logo"
              multiple={false}
              accept="image/png,image/svg+xml,image/webp"
              variant="secondary"
              hint="PNG ou SVG carré, fond transparent si possible."
            />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <h3 className="type-label text-subtle">Couverture</h3>
            <MediaFrame
              photo={association.cover}
              ratio="21/9"
              slot="association-cover"
              sizes="(min-width: 1024px) 50vw, 100vw"
              fallback={{ title: preview.name || association.name, accent, kicker: preview.kind }}
              className="rounded-sm"
            />
            <MediaUpload
              label="Changer la couverture"
              multiple={false}
              variant="secondary"
              hint={`Format ${COVER.ratio}, ${COVER.minSize} au moins. ${COVER.brief}`}
            />
          </div>
        </div>
      </ManageSection>

      <div className="flex flex-col gap-3 border-t-2 border-fg pt-6 sm:flex-row sm:items-center">
        <Button type="submit" icon="check" iconPosition="start">
          Enregistrer
        </Button>
        <Button type="reset" variant="ghost">
          Annuler les modifications
        </Button>
      </div>
    </DemoForm>
  );
}
