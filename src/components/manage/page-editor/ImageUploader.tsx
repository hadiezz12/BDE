"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cx } from "@/lib/cx";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export type UploadKind = "logo" | "cover" | "image";

export interface UploadedMedia {
  id: string;
  path: string;
  width: number;
  height: number;
  alt: string | null;
  kind: UploadKind;
}

/** Same limit as the server (src/lib/associations/images.ts): checked here only to answer faster. */
const MAX_BYTES = 12 * 1024 * 1024;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";

const KIND_HINT: Record<UploadKind, string> = {
  logo: "Carré de préférence, 1024 px suffisent. Fond transparent si possible.",
  cover: "Format paysage, 2400 × 1600 px au plus (recadrée sinon). Évite le texte sur l'image.",
  image: "Photos de vos activités. 2000 px de côté au plus (réduites sinon).",
};

type State =
  | { status: "idle" }
  | { status: "uploading"; progress: number; name: string }
  | { status: "done"; name: string }
  | { status: "error"; message: string };

/**
 * Sends one image to the association's library, with real progress
 * (XMLHttpRequest to /manage/<asso>/media/upload, which checks the right,
 * re-encodes the image to WebP without its metadata, stores it privately
 * and records it). Drop a file on the zone, or choose it. Nothing is
 * published by uploading: the image waits in the library until a draft uses
 * it and someone publishes.
 */
export function ImageUploader({
  asso,
  kind,
  label = "Ajouter une image",
  withAlt = true,
  onUploaded,
  className,
}: {
  asso: string;
  kind: UploadKind;
  label?: string;
  /** Ask for a description before sending (gallery photos). */
  withAlt?: boolean;
  onUploaded?: (media: UploadedMedia) => void;
  className?: string;
}) {
  const router = useRouter();
  const inputId = useId();
  const altId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const altRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [state, setState] = useState<State>({ status: "idle" });

  function send(file: File) {
    if (!file.type.startsWith("image/")) {
      setState({ status: "error", message: "Ce fichier n'est pas une image (JPEG, PNG, WebP, GIF ou AVIF)." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setState({ status: "error", message: "Image trop lourde : 12 Mo au plus. Exporte-la plus petite, puis réessaie." });
      return;
    }
    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    if (withAlt) body.set("alt", altRef.current?.value ?? "");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/manage/${encodeURIComponent(asso)}/media/upload`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setState({ status: "uploading", progress: Math.round((e.loaded / e.total) * 100), name: file.name });
      }
    };
    xhr.onload = () => {
      const res = (xhr.response ?? {}) as { media?: UploadedMedia; error?: string };
      if (xhr.status === 201 && res.media) {
        setState({ status: "done", name: file.name });
        if (altRef.current) altRef.current.value = "";
        onUploaded?.(res.media);
        router.refresh();
      } else {
        setState({ status: "error", message: res.error ?? "L'envoi n'a pas abouti. Réessaie." });
      }
    };
    xhr.onerror = () => setState({ status: "error", message: "Connexion perdue pendant l'envoi. Réessaie." });
    setState({ status: "uploading", progress: 0, name: file.name });
    xhr.send(body);
  }

  const busy = state.status === "uploading";

  return (
    <div className={cx("flex flex-col gap-3", className)}>
      {withAlt && (
        <div className="flex flex-col gap-2">
          <label htmlFor={altId} className="text-[0.95rem] font-bold leading-snug">
            Description de l&apos;image <span className="ml-1 font-normal text-subtle">(facultatif)</span>
          </label>
          <input
            ref={altRef}
            id={altId}
            maxLength={200}
            placeholder="Ex : l'équipe au tournoi de rentrée"
            className="min-h-12 w-full rounded-sm border border-line-strong/70 bg-raised px-3.5 py-2.5 text-fg placeholder:text-subtle focus-visible:border-fg focus-visible:outline-none"
          />
          <p className="type-small text-subtle">Lue par les lecteurs d&apos;écran à la place de l&apos;image.</p>
        </div>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files[0];
          if (file && !busy) send(file);
        }}
        className={cx(
          "flex flex-col items-start gap-3 rounded-md border-2 border-dashed px-4 py-5 transition-colors sm:flex-row sm:items-center sm:justify-between",
          over ? "border-fg bg-sunken" : "border-line-strong",
        )}
      >
        <div className="flex items-start gap-3">
          <Icon name="upload" size={22} className="mt-0.5 shrink-0 text-muted" />
          <p className="flex flex-col gap-0.5">
            <span className="font-semibold">Glisse une image ici, ou choisis-la</span>
            <span className="type-small text-subtle">{KIND_HINT[kind]} 12 Mo au plus.</span>
          </p>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          aria-describedby={statusId}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) send(file);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon="plus"
          iconPosition="start"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {label}
        </Button>
      </div>
      <div id={statusId} aria-live="polite" className="min-h-0">
        {state.status === "uploading" && (
          <div className="flex flex-col gap-1.5">
            <p className="type-small">
              Envoi de {state.name}… {state.progress < 100 ? `${state.progress} %` : "préparation de l'image"}
            </p>
            <progress
              max={100}
              value={state.progress}
              aria-label="Progression de l'envoi"
              className="h-2 w-full overflow-hidden rounded-full accent-current"
            />
          </div>
        )}
        {state.status === "done" && (
          <p role="status" className="flex items-start gap-2 type-small font-semibold text-ok">
            <Icon name="check" size={16} className="mt-0.5 shrink-0" />
            {state.name} est dans la médiathèque.
          </p>
        )}
        {state.status === "error" && (
          <p role="alert" className="flex items-start gap-2 type-small font-semibold text-danger">
            <Icon name="alert" size={16} className="mt-0.5 shrink-0" />
            {state.message}
          </p>
        )}
      </div>
    </div>
  );
}
