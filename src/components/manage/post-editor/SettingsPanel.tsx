"use client";

import Image from "next/image";
import { useId } from "react";
import type { PostKind } from "@/lib/types";
import type { LibraryImage, PostEditor } from "@/lib/posts/editor";
import type { QualityNote } from "@/lib/posts/document";
import { POST_KINDS } from "@/lib/posts/model";
import { mediaUrl } from "@/lib/associations/model";
import { cx } from "@/lib/cx";
import { Button } from "@/components/ui/Button";
import { Field, Select } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { POST_KIND_HINT, POST_KIND_LABEL } from "@/components/campus/labels";
import { TagInput } from "./TagInput";

/**
 * What frames the text: its type, its rubrique in the campus feed, its
 * keywords and its cover. Every change is saved with the text (autosave).
 */
export function SettingsPanel({
  kind,
  onKind,
  categoryId,
  onCategory,
  categories,
  tags,
  onTags,
  cover,
  coverId,
  onPickCover,
  onRemoveCover,
  disabled,
}: {
  kind: PostKind;
  onKind: (kind: PostKind) => void;
  categoryId: string | null;
  onCategory: (id: string | null) => void;
  categories: PostEditor["categories"];
  tags: string[];
  onTags: (tags: string[]) => void;
  /** The cover's library image (null: none, or no longer in the library). */
  cover: LibraryImage | null;
  coverId: string | null;
  onPickCover: () => void;
  onRemoveCover: () => void;
  disabled: boolean;
}) {
  const hintId = useId();
  return (
    <fieldset disabled={disabled} className="flex min-w-0 flex-col gap-6">
      <legend className="sr-only">Réglages de l&apos;article</legend>

      <fieldset aria-describedby={hintId} className="flex flex-col gap-2.5">
        <legend className="mb-1 text-[0.95rem] font-bold">Type</legend>
        <div className="grid grid-cols-2 gap-2">
          {POST_KINDS.map((k) => (
            <label
              key={k}
              className="focus-ring-within flex min-h-11 cursor-pointer items-center justify-center rounded-sm border-2 border-line bg-raised px-3 text-center type-button text-[0.75rem] text-muted transition-colors hover:border-line-strong has-[:checked]:border-accent has-[:checked]:bg-accent/8 has-[:checked]:text-fg has-[:disabled]:cursor-not-allowed"
            >
              <input
                type="radio"
                name="post-kind"
                value={k}
                checked={kind === k}
                onChange={() => onKind(k)}
                className="sr-only"
              />
              {POST_KIND_LABEL[k]}
            </label>
          ))}
        </div>
        <p id={hintId} className="type-small text-subtle">
          {POST_KIND_HINT[kind]}
        </p>
      </fieldset>

      <Field label="Rubrique" optional hint="Le classement de l'article dans le fil Campus.">
        {({ id, describedBy }) => (
          <Select
            id={id}
            aria-describedby={describedBy}
            value={categoryId ?? ""}
            onChange={(e) => onCategory(e.target.value || null)}
          >
            <option value="">Aucune rubrique</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.archived ? `${c.label} (retirée)` : c.label}
              </option>
            ))}
          </Select>
        )}
      </Field>

      <TagInput tags={tags} onChange={onTags} disabled={disabled} />

      <div className="flex flex-col gap-2.5">
        <p className="text-[0.95rem] font-bold leading-snug" id={`${hintId}-cover`}>
          Image de couverture
        </p>
        {kind === "breve" ? (
          <p className="type-small text-subtle">
            Une brève n&apos;a pas d&apos;image&nbsp;: le fil la range dans «&nbsp;En bref&nbsp;», en texte seul.
          </p>
        ) : coverId ? (
          <div className="flex flex-col gap-2.5">
            {cover ? (
              <figure className="flex flex-col gap-1.5">
                <span className="relative block aspect-[3/2] overflow-hidden rounded-sm border-2 border-fg bg-sunken">
                  <Image
                    src={mediaUrl(cover.path, true)}
                    alt={cover.alt ?? ""}
                    fill
                    unoptimized
                    sizes="(min-width: 1024px) 22rem, 100vw"
                    className="object-cover"
                  />
                </span>
                <figcaption className={cx("type-caption", !cover.alt && "italic")}>
                  {cover.alt ?? "Sans description dans la médiathèque."}
                </figcaption>
              </figure>
            ) : (
              <p className="flex items-start gap-2 type-small font-semibold text-danger">
                <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
                Cette image n&apos;est plus dans la médiathèque&nbsp;: choisis-en une autre ou retire-la.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon="image"
                iconPosition="start"
                onClick={onPickCover}
                aria-describedby={`${hintId}-cover`}
              >
                Changer
              </Button>
              <Button type="button" variant="ghost" size="sm" icon="close" iconPosition="start" onClick={onRemoveCover}>
                Retirer la couverture
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2.5 rounded-sm border-2 border-dashed border-line-strong px-4 py-4">
            <p className="type-small text-muted">
              Sans image, le fil affiche une affiche à la couleur de l&apos;asso.
            </p>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon="image"
              iconPosition="start"
              onClick={onPickCover}
              aria-describedby={`${hintId}-cover`}
            >
              Choisir une image
            </Button>
          </div>
        )}
      </div>
    </fieldset>
  );
}

/** The small editorial reminders (never a score, never blocking). */
export function QualityNotes({ notes }: { notes: QualityNote[] }) {
  if (notes.length === 0) {
    return (
      <p className="flex items-start gap-2 type-small text-muted">
        <Icon name="check" size={16} className="mt-0.5 shrink-0 text-ok" />
        Rien à signaler&nbsp;: titre, introduction, images et intertitres sont en place.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {notes.map((n) => (
        <li key={n.key} className="flex items-start gap-2 type-small">
          <Icon name="info" size={16} className="mt-0.5 shrink-0 text-info" />
          {n.message}
        </li>
      ))}
    </ul>
  );
}
