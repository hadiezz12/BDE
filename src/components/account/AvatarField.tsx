"use client";

import { startTransition, useActionState, useId, useRef, useState } from "react";
import { AVATAR_MAX_BYTES, AVATAR_TYPES } from "@/lib/auth/profile-input";
import { removeAvatar, uploadAvatar, type AvatarState } from "@/app/actions/account";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

const EDGE = 512;

/**
 * Profile picture: optional. The browser shrinks the picture to 512 px WebP
 * before sending it (lighter, and strips camera metadata such as location);
 * the server checks the real type and size again and picks where it is
 * stored. Only the student can see it for now.
 */
export function AvatarField({ name, url }: { name: string; url: string | null }) {
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [uploaded, upload, uploading] = useActionState<AvatarState, FormData>(uploadAvatar, { status: "idle" });
  const [removed, remove, removing] = useActionState<AvatarState, void>(removeAvatar, { status: "idle" });
  const busy = preparing || uploading || removing;
  const message = localError ?? (uploaded.status === "error" ? uploaded.message : removed.status === "error" ? removed.message : null);

  async function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setLocalError(null);
    if (!file) return;
    if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) {
      setLocalError("Formats acceptés : JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > 10 * AVATAR_MAX_BYTES) {
      setLocalError("Cette image est trop lourde. Choisis-en une de moins de 20 Mo.");
      return;
    }
    setPreparing(true);
    try {
      const blob = await shrink(file);
      if (blob.size > AVATAR_MAX_BYTES) {
        setLocalError("L'image fait plus de 2 Mo, même réduite. Choisis-en une autre.");
        return;
      }
      const form = new FormData();
      form.set("avatar", new File([blob], "avatar", { type: blob.type }));
      startTransition(() => upload(form));
    } catch {
      setLocalError("Cette image n'a pas pu être lue. Essaie avec une autre.");
    } finally {
      setPreparing(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-5">
      <Avatar name={name || "?"} src={url ?? undefined} accent="rose" size={88} />
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <input
            ref={input}
            id={inputId}
            type="file"
            accept={AVATAR_TYPES.join(",")}
            className="sr-only"
            onChange={onPick}
            disabled={busy}
          />
          <Button type="button" variant="secondary" icon="upload" disabled={busy} onClick={() => input.current?.click()}>
            {preparing || uploading ? "Envoi…" : url ? "Changer la photo" : "Ajouter une photo"}
          </Button>
          {url && (
            <Button type="button" variant="ghost" disabled={busy} onClick={() => startTransition(() => remove())}>
              {removing ? "Suppression…" : "Retirer"}
            </Button>
          )}
        </div>
        <p className="type-small text-subtle">
          <label htmlFor={inputId}>JPEG, PNG ou WebP, 2 Mo maximum.</label> Facultatif : pour l&apos;instant, toi seul·e la vois.
        </p>
        <p role="status" className="type-small">
          {message ? (
            <span className="font-semibold text-danger">{message}</span>
          ) : uploaded.status === "saved" && !busy ? (
            <span className="inline-flex items-center gap-1.5 font-bold text-ok">
              <Icon name="check" size={16} /> Photo enregistrée.
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

/** Square-ish downscale to at most 512 px, re-encoded (WebP when the browser can, PNG otherwise). */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no canvas");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const webp = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  if (webp && webp.type === "image/webp") return webp;
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!png) throw new Error("encode failed");
  return png;
}
