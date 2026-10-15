"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { cx } from "@/lib/cx";
import { buttonClass, type ButtonVariant } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { DemoNotice } from "@/components/manage/DemoNotice";

/**
 * PHASE 1 — "Ajouter des images". A real file picker (button-styled label
 * around the input, so keyboard and screen readers get the native control),
 * but nothing leaves the device: the chosen files are listed by name and
 * size, and the demo notice says plainly that nothing was uploaded.
 */

const MAX_LISTED = 3;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("fr-FR")} Ko`;
  return `${(bytes / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

export function MediaUpload({
  label = "Ajouter des images",
  multiple = true,
  accept = "image/jpeg,image/png,image/webp",
  hint,
  variant = "primary",
  className,
}: {
  label?: string;
  multiple?: boolean;
  accept?: string;
  /** One line under the button before anything is chosen (formats, sizes). */
  hint?: string;
  variant?: ButtonVariant;
  className?: string;
}) {
  const hintId = useId();
  const [picked, setPicked] = useState<{ key: number; files: { name: string; size: number }[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Inside a form (settings), "Annuler les modifications" empties the native
  // picker: forget the listed files with it.
  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const clear = () => setPicked(null);
    form.addEventListener("reset", clear);
    return () => form.removeEventListener("reset", clear);
  }, []);

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).map((f) => ({ name: f.name, size: f.size }));
    setPicked((p) => (files.length ? { key: (p?.key ?? 0) + 1, files } : null));
  };

  const files = picked?.files ?? [];
  const listed = files.slice(0, MAX_LISTED);
  const more = files.length - listed.length;

  return (
    <div className={cx("flex max-w-full flex-col items-start gap-2", className)}>
      <label className={buttonClass({ variant, className: "focus-ring-within cursor-pointer" })}>
        <Icon name="upload" size={18} />
        {label}
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          onChange={onChange}
          aria-describedby={hint ? hintId : undefined}
          className="sr-only"
        />
      </label>
      {hint && !picked && (
        <p id={hintId} className="max-w-sm type-small text-subtle">
          {hint}
        </p>
      )}
      <div role="status" className={cx("max-w-sm", !picked && "sr-only")}>
        {picked && (
          <DemoNotice key={picked.key}>
            {files.length > 1
              ? `${files.length} fichiers choisis, mais rien n'est envoyé : ils restent sur ton appareil.`
              : "1 fichier choisi, mais rien n'est envoyé : il reste sur ton appareil."}
            <span className="mt-2 flex flex-col gap-0.5">
              {listed.map((f, i) => (
                <span key={`${f.name}-${i}`} className="flex min-w-0 justify-between gap-3 type-meta text-[0.75rem]">
                  <span className="min-w-0 truncate">{f.name}</span>
                  <span className="shrink-0 text-subtle">{formatFileSize(f.size)}</span>
                </span>
              ))}
              {more > 0 && <span className="type-meta text-[0.75rem] text-subtle">et {more} de plus</span>}
            </span>
          </DemoNotice>
        )}
      </div>
    </div>
  );
}
