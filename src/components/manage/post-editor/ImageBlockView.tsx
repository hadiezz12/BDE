"use client";

import Image from "next/image";
import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { mediaUrl } from "@/lib/associations/model";
import { cx } from "@/lib/cx";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { usePostMedia, type ImageAttrs } from "./media-context";

/**
 * An image inside the text, as the article will show it: the library image
 * (through the private preview route, drafts are never public), its caption
 * underneath, and, while editing, its description and the way to change or
 * remove it. An image no longer in the library is shown as such: the
 * server refuses to save a text that still uses it.
 */
export function ImageBlockView({ node, selected, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const { media, editable, editImage } = usePostMedia();
  const attrs = node.attrs as ImageAttrs;
  const image = media.get(attrs.mediaId);

  return (
    <NodeViewWrapper
      as="figure"
      data-drag-handle=""
      className={cx(
        "my-2 flex flex-col gap-2 rounded-xs outline-offset-4",
        selected && editable && "outline-2 outline-[var(--focus)] outline-solid",
      )}
    >
      {image ? (
        <Image
          src={mediaUrl(image.path, true)}
          alt={attrs.alt ?? image.alt ?? ""}
          width={image.width}
          height={image.height}
          unoptimized
          draggable={false}
          sizes="(min-width: 1024px) 40rem, 100vw"
          className="h-auto w-full border-2 border-fg"
        />
      ) : (
        <div className="flex flex-col items-start gap-1.5 border-2 border-dashed border-danger px-4 py-6 text-danger">
          <span className="flex items-center gap-2 font-bold">
            <Icon name="alert" size={18} />
            Image introuvable
          </span>
          <span className="type-small">
            Elle a été retirée de la médiathèque de l&apos;asso. Retire ce bloc (ou remplace-le) : l&apos;article ne
            s&apos;enregistre pas tant qu&apos;il l&apos;utilise.
          </span>
        </div>
      )}
      {attrs.caption && <figcaption className="type-caption">{attrs.caption}</figcaption>}
      {editable && (
        <div contentEditable={false} className="flex flex-col gap-2 border-l-2 border-line pl-3">
          <p className={cx("type-small", attrs.alt ? "text-muted" : "font-semibold text-warn")}>
            {attrs.alt ? (
              <>
                <span className="sr-only">Description : </span>
                {attrs.alt}
              </>
            ) : (
              "Pas de description : ajoute-la pour les personnes qui ne voient pas l'image."
            )}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              icon="edit"
              iconPosition="start"
              onClick={() => editImage(attrs, (next) => updateAttributes(next))}
            >
              Description et légende
            </Button>
            <Button type="button" size="sm" variant="ghost" icon="close" iconPosition="start" onClick={() => deleteNode()}>
              Retirer l&apos;image
            </Button>
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}
