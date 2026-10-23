"use client";

import Image from "next/image";
import { useId, useRef, useState, type FormEvent } from "react";
import type { LibraryImage } from "@/lib/posts/editor";
import { mediaUrl } from "@/lib/associations/model";
import { cx } from "@/lib/cx";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { ImageUploader, type UploadedMedia } from "@/components/manage/page-editor/ImageUploader";
import { DialogHeader, useInitialFocus } from "./DialogHeader";
import type { ImageAttrs } from "./media-context";

export type PickerRequest =
  | { mode: "inline"; key: number }
  | { mode: "cover"; key: number; current: string | null }
  /** An image already in the text: its description and caption only. */
  | { mode: "details"; key: number; attrs: ImageAttrs; apply: (next: ImageAttrs) => void };

const ALT_HINT = "Ce que montre l'image, en une phrase, pour les personnes qui ne la voient pas.";

/**
 * Images of the article, from the association's library: pick one (or send
 * a new one, for those who may), then say what it shows. Inline images ask
 * for their description and an optional caption before going into the
 * text; a cover is chosen in one tap (its description is the library's).
 * Logos are left out: they are the association's identity, not illustrations.
 */
export function ImagePicker({
  request,
  media,
  asso,
  canUpload,
  onClose,
  onInsert,
  onChooseCover,
  onUploaded,
}: {
  request: PickerRequest | null;
  media: LibraryImage[];
  asso: string;
  canUpload: boolean;
  onClose: () => void;
  onInsert: (attrs: ImageAttrs) => void;
  onChooseCover: (mediaId: string) => void;
  onUploaded: (media: UploadedMedia) => void;
}) {
  const label =
    request?.mode === "cover"
      ? "Image de couverture"
      : request?.mode === "details"
        ? "Description et légende"
        : "Ajouter une image";
  return (
    <Dialog open={request !== null} onClose={onClose} label={label} variant="screen" surface="studio">
      {request && (
        <PickerBody
          key={request.key}
          request={request}
          title={label}
          media={media}
          asso={asso}
          canUpload={canUpload}
          onClose={onClose}
          onInsert={onInsert}
          onChooseCover={onChooseCover}
          onUploaded={onUploaded}
        />
      )}
    </Dialog>
  );
}

function PickerBody({
  request,
  title,
  media,
  asso,
  canUpload,
  onClose,
  onInsert,
  onChooseCover,
  onUploaded,
}: {
  request: PickerRequest;
  title: string;
  media: LibraryImage[];
  asso: string;
  canUpload: boolean;
  onClose: () => void;
  onInsert: (attrs: ImageAttrs) => void;
  onChooseCover: (mediaId: string) => void;
  onUploaded: (media: UploadedMedia) => void;
}) {
  const id = useId();
  const byId = new Map(media.map((m) => [m.id, m]));
  const [chosen, setChosen] = useState<LibraryImage | null>(null);
  const images = media.filter((m) => m.kind !== "logo");

  if (request.mode === "details") {
    return (
      <>
        <DialogHeader title={title} onClose={onClose} />
        <ImageDetailsForm
          image={byId.get(request.attrs.mediaId) ?? null}
          initial={request.attrs}
          submitLabel="Enregistrer"
          onSubmit={(next) => request.apply(next)}
          onCancel={onClose}
        />
      </>
    );
  }

  if (request.mode === "inline" && chosen) {
    return (
      <>
        <DialogHeader title={title} onClose={onClose} />
        <ImageDetailsForm
          image={chosen}
          initial={{ mediaId: chosen.id, alt: chosen.alt, caption: null }}
          submitLabel="Insérer l'image"
          onSubmit={onInsert}
          onCancel={() => setChosen(null)}
          cancelLabel="Choisir une autre image"
        />
      </>
    );
  }

  const cover = request.mode === "cover" ? request.current : null;
  const pick = (m: LibraryImage) => (request.mode === "cover" ? onChooseCover(m.id) : setChosen(m));

  return (
    <>
      <DialogHeader title={title} onClose={onClose} />
      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-5 py-5 sm:max-h-[min(40rem,78dvh)] sm:px-6">
        {request.mode === "cover" && (
          <p className="type-small text-muted">
            Elle ouvre l&apos;article et l&apos;annonce dans le fil. Format paysage de préférence, sans texte dessus.
          </p>
        )}
        {images.length > 0 ? (
          <section aria-labelledby={`${id}-mediatheque`} className="flex flex-col gap-3">
            <h3 id={`${id}-mediatheque`} className="type-label text-muted">
              Médiathèque de l&apos;asso
            </h3>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => pick(m)}
                    aria-current={m.id === cover ? "true" : undefined}
                    className={cx(
                      "group flex w-full flex-col overflow-hidden rounded-sm border-2 bg-raised text-left transition-colors hover:border-fg",
                      m.id === cover ? "border-fg" : "border-line",
                    )}
                  >
                    <span className="relative block aspect-[4/3] bg-sunken">
                      <Image src={mediaUrl(m.path, true)} alt="" fill unoptimized sizes="200px" className="object-cover" />
                      {m.id === cover && (
                        <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-xs bg-fg px-1.5 py-0.5 type-label text-[0.62rem] text-bg">
                          <Icon name="check" size={12} />
                          Couverture
                        </span>
                      )}
                    </span>
                    <span className="flex min-h-11 items-center px-2 py-1.5 type-small">
                      <span className={cx("line-clamp-2", !m.alt && "italic text-subtle")}>
                        <span className="sr-only">{request.mode === "cover" ? "Choisir : " : "Insérer : "}</span>
                        {m.alt ?? "Sans description"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="rounded-md border border-dashed border-line-strong px-4 py-5 type-small text-muted">
            La médiathèque de l&apos;asso est vide.{" "}
            {canUpload
              ? "Envoie une première image ci-dessous : elle y restera pour tes prochains articles."
              : "Les postes qui gèrent les médias ou écrivent les articles y ajoutent les images."}
          </p>
        )}

        {canUpload && (
          <section aria-labelledby={`${id}-envoi`} className="flex flex-col gap-3 border-t border-line pt-5">
            <h3 id={`${id}-envoi`} className="type-label text-muted">
              Envoyer une nouvelle image
            </h3>
            <p className="flex items-start gap-2 type-small text-muted">
              <Icon name="shield" size={16} className="mt-0.5 shrink-0" />
              <span>
                Seulement des photos que l&apos;asso a le droit d&apos;utiliser, et où les personnes reconnaissables
                sont d&apos;accord pour paraître. Rien n&apos;est public avant la publication de l&apos;article.
              </span>
            </p>
            <ImageUploader
              asso={asso}
              kind={request.mode === "cover" ? "cover" : "image"}
              label="Choisir un fichier"
              onUploaded={(m) => {
                onUploaded(m);
                const image: LibraryImage = { ...m };
                if (request.mode === "cover") onChooseCover(image.id);
                else setChosen(image);
              }}
            />
          </section>
        )}
      </div>
    </>
  );
}

/** Description (alt) and caption of one image, before it goes into the text or when it is changed. */
function ImageDetailsForm({
  image,
  initial,
  submitLabel,
  cancelLabel = "Annuler",
  onSubmit,
  onCancel,
}: {
  image: LibraryImage | null;
  initial: ImageAttrs;
  submitLabel: string;
  cancelLabel?: string;
  onSubmit: (attrs: ImageAttrs) => void;
  onCancel: () => void;
}) {
  const [alt, setAlt] = useState(initial.alt ?? "");
  const [caption, setCaption] = useState(initial.caption ?? "");
  const altRef = useRef<HTMLInputElement>(null);
  useInitialFocus(altRef);
  const clean = (v: string) => v.replace(/\s+/g, " ").trim() || null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ mediaId: initial.mediaId, alt: clean(alt), caption: clean(caption) });
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 sm:max-h-[min(40rem,78dvh)] sm:px-6">
      {image ? (
        <Image
          src={mediaUrl(image.path, true)}
          alt=""
          width={image.width}
          height={image.height}
          unoptimized
          className="mx-auto h-auto max-h-56 w-auto max-w-full border-2 border-fg object-contain"
        />
      ) : (
        <p className="type-small font-semibold text-danger">Cette image n&apos;est plus dans la médiathèque.</p>
      )}
      <Field label="Description de l'image" hint={`${ALT_HINT} Laisse vide seulement si elle est purement décorative.`}>
        {({ id, describedBy }) => (
          <Input
            ref={altRef}
            id={id}
            aria-describedby={describedBy}
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            maxLength={200}
            autoComplete="off"
            placeholder="Ex : l'équipe sur la ligne de départ"
          />
        )}
      </Field>
      <Field label="Légende" optional hint="Affichée sous l'image : lieu, date, crédit photo…">
        {({ id, describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            maxLength={200}
            autoComplete="off"
          />
        )}
      </Field>
      <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button type="submit" icon="check" iconPosition="start" disabled={!image}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </form>
  );
}
