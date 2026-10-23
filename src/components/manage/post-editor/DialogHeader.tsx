"use client";

import { useEffect, type RefObject } from "react";
import { Icon } from "@/components/ui/Icon";

/** The editor dialogs' title row: what the dialog does, and a way out. */
export function DialogHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
      <h2 className="type-card text-[1.25rem]">{title}</h2>
      <button
        type="button"
        onClick={onClose}
        className="-mr-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-sm hover:bg-fg/8"
      >
        <Icon name="close" size={20} />
        <span className="sr-only">Fermer</span>
      </button>
    </div>
  );
}

/**
 * Puts the focus on a dialog's first field once the dialog is open (the
 * native dialog focuses its first button otherwise: the close cross).
 */
export function useInitialFocus(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const frame = requestAnimationFrame(() => ref.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [ref]);
}
