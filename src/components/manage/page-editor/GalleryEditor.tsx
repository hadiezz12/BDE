"use client";

import Image from "next/image";
import { startTransition, useActionState, useState } from "react";
import { saveGallery, type PageActionState } from "@/app/actions/association-page";
import { mediaUrl, type MediaPayload } from "@/lib/associations/model";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ActionOutcome } from "@/components/manage/governance/ActionForm";
import { ImageUploader } from "./ImageUploader";

type LibraryImage = MediaPayload & { kind: "logo" | "cover" | "image" };
type Item = { media_id: string; caption: string | null };

/** At most 24 photos (public.set_association_gallery). */
const MAX_ITEMS = 24;

/**
 * The page's photos, in order, each with an optional caption. Pick images
 * from the library (or send new ones), move them, caption them, then save:
 * the gallery is saved as a whole into the draft, refused if someone else
 * changed it meanwhile.
 */
export function GalleryEditor({
  asso,
  organizationId,
  items: saved,
  media,
  canUpload,
  readOnly,
  next,
}: {
  asso: string;
  organizationId: string;
  items: Item[];
  media: LibraryImage[];
  canUpload: boolean;
  readOnly?: boolean;
  next?: string;
}) {
  const [items, setItems] = useState<Item[]>(saved);
  const [state, dispatch, pending] = useActionState<PageActionState, FormData>(saveGallery, { status: "idle" });
  const byId = new Map(media.map((m) => [m.id, m]));
  const available = media.filter((m) => m.kind !== "logo" && !items.some((i) => i.media_id === m.id));
  const changed = JSON.stringify(items) !== JSON.stringify(saved);

  const move = (from: number, to: number) =>
    setItems((list) => {
      if (to < 0 || to >= list.length) return list;
      const copy = [...list];
      const [x] = copy.splice(from, 1);
      copy.splice(to, 0, x);
      return copy;
    });

  return (
    <div className="flex flex-col gap-8">
      <form
        aria-label="Galerie"
        action={dispatch}
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => dispatch(data));
        }}
        className="flex flex-col gap-5"
      >
        <input type="hidden" name="organization_id" value={organizationId} />
        <input type="hidden" name="base" value={JSON.stringify(saved)} />
        <input
          type="hidden"
          name="items"
          value={JSON.stringify(items.map((i) => ({ media_id: i.media_id, caption: i.caption?.trim() || null })))}
        />
        {next && <input type="hidden" name="next" value={next} />}

        {items.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-strong px-4 py-6 text-center type-small text-muted">
            Pas encore de photo. La section « En images » n&apos;apparaît sur la page qu&apos;à partir d&apos;une photo.
          </p>
        ) : (
          <ol className="flex flex-col divide-y divide-line border-y border-line">
            {items.map((item, i) => {
              const m = byId.get(item.media_id);
              return (
                <li key={item.media_id} className="grid gap-3 py-4 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center">
                  <span className="relative block aspect-[4/3] overflow-hidden rounded-sm border border-line bg-sunken">
                    {m && (
                      <Image
                        src={mediaUrl(m.path, true)}
                        alt={m.alt ?? `Photo ${i + 1}`}
                        fill
                        unoptimized
                        sizes="128px"
                        className="object-cover"
                      />
                    )}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor={`caption-${item.media_id}`} className="type-small font-bold">
                      Photo {i + 1} · légende <span className="font-normal text-subtle">(facultatif)</span>
                    </label>
                    <input
                      id={`caption-${item.media_id}`}
                      value={item.caption ?? ""}
                      disabled={readOnly}
                      maxLength={140}
                      onChange={(e) =>
                        setItems((list) => list.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)))
                      }
                      placeholder="Ex : la finale du tournoi"
                      className="min-h-11 w-full rounded-sm border border-line-strong/70 bg-raised px-3 py-2 text-fg placeholder:text-subtle focus-visible:border-fg focus-visible:outline-none"
                    />
                  </div>
                  {!readOnly && (
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Monter la photo ${i + 1}`}
                        disabled={i === 0}
                        onClick={() => move(i, i - 1)}
                      >
                        <Icon name="chevron-down" size={18} className="rotate-180" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Descendre la photo ${i + 1}`}
                        disabled={i === items.length - 1}
                        onClick={() => move(i, i + 1)}
                      >
                        <Icon name="chevron-down" size={18} />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Retirer la photo ${i + 1} de la galerie`}
                        onClick={() => setItems((list) => list.filter((_, j) => j !== i))}
                      >
                        <Icon name="close" size={18} />
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}

        {!readOnly && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" icon="check" iconPosition="start" disabled={pending || !changed} aria-disabled={pending || !changed}>
                {pending ? "Enregistrement…" : "Enregistrer la galerie"}
              </Button>
              {changed && !pending && (
                <span className="type-meta text-subtle">Modifications pas encore enregistrées</span>
              )}
              {!changed && <span className="type-meta text-subtle">{items.length} / {MAX_ITEMS} photos</span>}
            </div>
            <ActionOutcome state={state} />
          </div>
        )}
      </form>

      {!readOnly && (
        <section aria-labelledby="ajouter-photos" className="flex flex-col gap-4 border-t border-line pt-6">
          <h3 id="ajouter-photos" className="type-card">
            Ajouter depuis la médiathèque
          </h3>
          {available.length === 0 ? (
            <p className="type-small text-subtle">Toutes les images de la médiathèque sont déjà dans la galerie.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {available.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    disabled={items.length >= MAX_ITEMS}
                    onClick={() => setItems((list) => [...list, { media_id: m.id, caption: null }])}
                    className="group relative block w-full overflow-hidden rounded-sm border-2 border-line bg-sunken hover:border-fg disabled:opacity-50"
                  >
                    <span className="relative block aspect-[4/3]">
                      <Image
                        src={mediaUrl(m.path, true)}
                        alt=""
                        fill
                        unoptimized
                        sizes="160px"
                        className="object-cover"
                      />
                    </span>
                    <span className="flex items-center gap-1.5 px-2 py-1.5 type-small font-semibold">
                      <Icon name="plus" size={14} />
                      Ajouter
                      <span className="sr-only"> : {m.alt ?? "image sans description"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {canUpload && (
            <ImageUploader
              asso={asso}
              kind="image"
              label="Envoyer une photo"
              onUploaded={(m) =>
                setItems((list) => (list.length < MAX_ITEMS ? [...list, { media_id: m.id, caption: null }] : list))
              }
            />
          )}
        </section>
      )}
    </div>
  );
}
