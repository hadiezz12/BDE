"use client";

import Image from "next/image";
import { useState } from "react";
import type { AccentKey } from "@/lib/types";
import type { DraftValues } from "@/lib/associations/validation";
import { mediaUrl, toPhoto, type MediaPayload } from "@/lib/associations/model";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";
import { AccentPicker, AccentPreview } from "@/components/manage/settings/AccentPicker";
import { DraftForm } from "./DraftForm";
import { ImageUploader } from "./ImageUploader";

type LibraryImage = MediaPayload & { kind: "logo" | "cover" | "image" };

function parseFocal(value: string | null): { x: number; y: number } {
  const m = value?.match(/^(\d{1,3})% (\d{1,3})%$/);
  return m ? { x: Number(m[1]), y: Number(m[2]) } : { x: 50, y: 50 };
}

/**
 * Colour, logo and cover of the draft. The colour comes from the closed
 * palette (never a free code), so every page stays readable in both themes;
 * the logo and cover are picked from the association's library, or sent
 * right here. The cover's focal point keeps faces in frame however the
 * cover is cropped (phone portrait, desktop panorama).
 */
export function AppearanceForm({
  asso,
  organizationId,
  draft,
  media,
  kindLabel,
  canUpload,
  readOnly,
  next,
  submitLabel,
}: {
  asso: string;
  organizationId: string;
  draft: DraftValues;
  media: LibraryImage[];
  kindLabel: string;
  canUpload: boolean;
  readOnly?: boolean;
  next?: string;
  submitLabel?: string;
}) {
  const [accent, setAccent] = useState<AccentKey>(draft.accent as AccentKey);
  const [logo, setLogo] = useState<string | null>(draft.logo_media_id);
  const [cover, setCover] = useState<string | null>(draft.cover_media_id);
  const [focal, setFocal] = useState(parseFocal(draft.cover_focal));
  const byId = (id: string | null) => media.find((m) => m.id === id) ?? null;
  const logoMedia = byId(logo);
  const coverMedia = byId(cover);

  return (
    <DraftForm
      organizationId={organizationId}
      section="appearance"
      base={{
        accent: draft.accent,
        logo_media_id: draft.logo_media_id,
        cover_media_id: draft.cover_media_id,
        cover_focal: draft.cover_focal,
      }}
      known={media.map((m) => m.id)}
      label="Apparence"
      readOnly={readOnly}
      next={next}
      submitLabel={submitLabel}
    >
      {(errors) => (
        <>
          <section aria-labelledby="couleur" className="flex flex-col gap-4">
            <h3 id="couleur" className="type-card">
              Couleur
            </h3>
            <div className="grid gap-6">
              <div className="flex flex-col gap-3">
                <AccentPicker name="accent" value={accent} saved={draft.accent as AccentKey} onChange={setAccent} />
                <p className="type-small text-subtle">
                  Huit couleurs, celles des emblèmes néon du BDE. Chacune reste lisible de jour comme de nuit : pas de
                  code couleur libre.
                </p>
                {errors.accent && (
                  <p role="alert" className="type-small font-semibold text-danger">
                    {errors.accent}
                  </p>
                )}
              </div>
              <AccentPreview
                association={{
                  name: draft.name,
                  shortName: draft.short_name ?? undefined,
                  kind: kindLabel,
                  accent,
                  logo: toPhoto(logoMedia, `Logo de ${draft.name}`, null, true),
                }}
                tagline={draft.tagline ?? ""}
              />
            </div>
          </section>

          <section aria-labelledby="logo" className="flex flex-col gap-4 border-t border-line pt-6">
            <h3 id="logo" className="type-card">
              Logo
            </h3>
            <ImagePicker
              name="logo_media_id"
              legend="Choisir le logo"
              images={media.filter((m) => m.kind === "logo" || m.id === logo)}
              value={logo}
              onChange={setLogo}
              noneLabel="Pas de logo (tes initiales dans ta couleur)"
              square
            />
            {errors.logo_media_id && (
              <p role="alert" className="type-small font-semibold text-danger">
                {errors.logo_media_id}
              </p>
            )}
            {canUpload && !readOnly && (
              <ImageUploader
                asso={asso}
                kind="logo"
                label="Envoyer un logo"
                withAlt={false}
                onUploaded={(m) => setLogo(m.id)}
              />
            )}
          </section>

          <section aria-labelledby="couverture" className="flex flex-col gap-4 border-t border-line pt-6">
            <h3 id="couverture" className="type-card">
              Couverture
            </h3>
            <ImagePicker
              name="cover_media_id"
              legend="Choisir la couverture"
              images={media.filter((m) => m.kind === "cover" || m.id === cover)}
              value={cover}
              onChange={setCover}
              noneLabel="Pas de couverture (une affiche à ton nom, dans ta couleur)"
            />
            {errors.cover_media_id && (
              <p role="alert" className="type-small font-semibold text-danger">
                {errors.cover_media_id}
              </p>
            )}
            {coverMedia && (
              <FocalPicker media={coverMedia} focal={focal} onChange={setFocal} disabled={readOnly} />
            )}
            <input type="hidden" name="focal_x" value={coverMedia ? focal.x : ""} />
            <input type="hidden" name="focal_y" value={coverMedia ? focal.y : ""} />
            {canUpload && !readOnly && (
              <ImageUploader
                asso={asso}
                kind="cover"
                label="Envoyer une couverture"
                withAlt
                onUploaded={(m) => {
                  setCover(m.id);
                  setFocal({ x: 50, y: 50 });
                }}
              />
            )}
          </section>
        </>
      )}
    </DraftForm>
  );
}

/** Library images as real radio buttons (keyboard and screen readers work natively). */
function ImagePicker({
  name,
  legend,
  images,
  value,
  onChange,
  noneLabel,
  square = false,
}: {
  name: string;
  legend: string;
  images: LibraryImage[];
  value: string | null;
  onChange: (id: string | null) => void;
  noneLabel: string;
  square?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="sr-only">{legend}</legend>
      <div className={cx("grid gap-3", square ? "grid-cols-3 sm:grid-cols-5 lg:grid-cols-6" : "grid-cols-2 sm:grid-cols-3")}>
        <label className="focus-ring-within flex cursor-pointer flex-col justify-center gap-2 rounded-sm border-2 border-line bg-raised p-3 text-center type-small has-[:checked]:border-fg">
          <input type="radio" name={name} value="" checked={value === null} onChange={() => onChange(null)} className="sr-only" />
          <Icon name="close" size={18} className="mx-auto text-muted" />
          {noneLabel}
        </label>
        {images.map((m) => (
          <label
            key={m.id}
            className="focus-ring-within relative cursor-pointer overflow-hidden rounded-sm border-2 border-line bg-sunken has-[:checked]:border-fg"
          >
            <input
              type="radio"
              name={name}
              value={m.id}
              checked={value === m.id}
              onChange={() => onChange(m.id)}
              className="sr-only"
            />
            <span className={cx("relative block", square ? "aspect-square" : "aspect-[16/9]")}>
              <Image
                src={mediaUrl(m.path, true)}
                alt={m.alt ?? "Image sans description"}
                fill
                unoptimized
                sizes="200px"
                className={square ? "object-contain p-2" : "object-cover"}
              />
            </span>
            {value === m.id && (
              <span className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-fg text-bg">
                <Icon name="check" size={14} strokeWidth={3} />
              </span>
            )}
          </label>
        ))}
      </div>
      {images.length === 0 && (
        <p className="type-small text-subtle">Aucune image de ce type dans la médiathèque pour l&apos;instant.</p>
      )}
    </fieldset>
  );
}

/**
 * Click (or use the arrow keys) on the cover to choose the point that stays
 * in frame. The two previews show the phone and desktop crops.
 */
function FocalPicker({
  media,
  focal,
  onChange,
  disabled,
}: {
  media: LibraryImage;
  focal: { x: number; y: number };
  onChange: (f: { x: number; y: number }) => void;
  disabled?: boolean;
}) {
  const src = mediaUrl(media.path, true);
  const position = `${focal.x}% ${focal.y}%`;
  const clamp = (n: number) => Math.min(100, Math.max(0, Math.round(n)));
  return (
    <div className="flex flex-col gap-3">
      <p className="type-small text-muted">
        Point gardé au cadrage : clique sur l&apos;image (ou utilise les flèches du clavier) pour garder un visage ou un
        sujet dans le cadre.
      </p>
      <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <button
          type="button"
          disabled={disabled}
          aria-label={`Point de cadrage : ${focal.x} % depuis la gauche, ${focal.y} % depuis le haut`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            onChange({ x: clamp(((e.clientX - r.left) / r.width) * 100), y: clamp(((e.clientY - r.top) / r.height) * 100) });
          }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 10 : 2;
            const moves: Record<string, [number, number]> = {
              ArrowLeft: [-step, 0],
              ArrowRight: [step, 0],
              ArrowUp: [0, -step],
              ArrowDown: [0, step],
            };
            const move = moves[e.key];
            if (!move) return;
            e.preventDefault();
            onChange({ x: clamp(focal.x + move[0]), y: clamp(focal.y + move[1]) });
          }}
          className="relative w-full cursor-crosshair overflow-hidden rounded-sm border-2 border-fg"
          style={{ aspectRatio: `${media.width} / ${media.height}` }}
        >
          <Image src={src} alt="" fill unoptimized sizes="600px" className="object-contain" />
          <span
            aria-hidden
            className="absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-[0_0_0_2px_black]"
            style={{ left: `${focal.x}%`, top: `${focal.y}%` }}
          />
        </button>
        <div className="flex gap-3 md:flex-col">
          <figure className="flex w-1/3 flex-col gap-1 md:w-1/2">
            <span className="relative block aspect-[4/5] overflow-hidden rounded-sm border border-line">
              <Image src={src} alt="" fill unoptimized sizes="160px" className="object-cover" style={{ objectPosition: position }} />
            </span>
            <figcaption className="type-meta text-subtle">Téléphone</figcaption>
          </figure>
          <figure className="flex w-2/3 flex-col gap-1 md:w-full">
            <span className="relative block aspect-[21/9] overflow-hidden rounded-sm border border-line">
              <Image src={src} alt="" fill unoptimized sizes="320px" className="object-cover" style={{ objectPosition: position }} />
            </span>
            <figcaption className="type-meta text-subtle">Ordinateur</figcaption>
          </figure>
        </div>
      </div>
    </div>
  );
}
