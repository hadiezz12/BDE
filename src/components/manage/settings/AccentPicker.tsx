"use client";

import type { AccentKey, AssociationRef } from "@/lib/types";
import { ACCENTS, ACCENT_KEYS } from "@/lib/accents";
import { cx } from "@/lib/cx";
import { buttonClass } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Sticker } from "@/components/ui/Sticker";
import { AssociationLogo } from "@/components/associations/AssociationLogo";

/**
 * The association colour, picked from the closed palette of the BDE's neon
 * emblems (lib/accents.ts) — never a free colour code. Real radio inputs
 * (keyboard: arrows move between colours), each swatch drawn by its own
 * data-accent, so no hex value lives here. The preview repeats the choice on
 * the two surfaces students see: the night site and paper pages.
 */
export function AccentPicker({
  name,
  value,
  saved,
  onChange,
  describedBy,
}: {
  name: string;
  value: AccentKey;
  /** The colour currently online, marked "actuelle". */
  saved: AccentKey;
  onChange: (accent: AccentKey) => void;
  describedBy?: string;
}) {
  return (
    <fieldset aria-describedby={describedBy} className="flex flex-col gap-3">
      <legend className="mb-1 text-[0.95rem] font-bold">Couleur de l&apos;association</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {ACCENT_KEYS.map((key) => (
          <label
            key={key}
            data-accent={key}
            className={cx(
              "focus-ring-within group flex min-h-14 min-w-0 cursor-pointer items-center gap-2.5 rounded-sm border-2 bg-raised px-2.5 py-2 transition-colors sm:gap-3 sm:px-3",
              "border-line hover:border-line-strong has-[:checked]:border-fg",
            )}
          >
            <input
              type="radio"
              name={name}
              value={key}
              checked={value === key}
              onChange={() => onChange(key)}
              className="sr-only"
            />
            <span
              aria-hidden
              className="grid size-7 shrink-0 place-items-center rounded-xs bg-assoc text-assoc-fg ring-1 ring-fg/15 sm:size-8"
            >
              <Icon name="check" size={16} strokeWidth={3} className="hidden group-has-[:checked]:block" />
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              {/* "Vert désintégration" in a 360 px half-column: hyphenate (lang="fr") rather than overflow. */}
              <span className="text-[0.88rem] font-semibold break-words hyphens-auto">{ACCENTS[key].label}</span>
              {key === saved && <span className="type-meta text-[0.7rem] text-subtle">actuelle</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * What the colour does on the public site: logo disc, a primary button and a
 * sticker, on night and on paper. Decorative (the radios carry the choice).
 */
export function AccentPreview({
  association,
  tagline,
}: {
  association: Pick<AssociationRef, "name" | "shortName" | "kind" | "accent" | "logo">;
  tagline: string;
}) {
  const surfaces = [
    { surface: "night", caption: "Sur le site, de nuit" },
    { surface: "paper", caption: "Sur papier : recrutement, espace étudiant" },
  ] as const;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {surfaces.map(({ surface, caption }) => (
        <figure key={surface} className="flex min-w-0 flex-col gap-2">
          <figcaption className="type-label text-[0.68rem] text-subtle">{caption}</figcaption>
          <div
            aria-hidden
            data-surface={surface}
            data-accent={association.accent}
            className={cx(
              "flex min-w-0 flex-col gap-4 rounded-md px-4 py-5 sm:px-5",
              surface === "paper" && "border border-line",
            )}
          >
            <div className="flex min-w-0 items-center gap-3">
              <AssociationLogo association={association} size={44} />
              <div className="flex min-w-0 flex-col">
                <span className="type-card break-words">{association.name || "Nom de l'association"}</span>
                <span className="type-small text-muted">{association.kind}</span>
              </div>
            </div>
            {tagline && <p className="type-small font-semibold text-assoc-text">{tagline}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <span className={buttonClass({ variant: "assoc", size: "sm" })}>Candidater</span>
              <Sticker tone="assoc" size="sm" tilt={-2}>
                Aperçu
              </Sticker>
            </div>
          </div>
        </figure>
      ))}
    </div>
  );
}
