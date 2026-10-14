"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * Modal built on the native <dialog>: focus is trapped and Escape closes it
 * for free, the rest of the page becomes inert. Three presentations:
 *  - panel  : centred card (desktop search, confirmations)
 *  - sheet  : slides up from the bottom (mobile menus)
 *  - screen : full screen on phones, panel from sm: up (search on mobile)
 */
export function Dialog({
  open,
  onClose,
  label,
  variant = "panel",
  surface = "night",
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Accessible name when there is no visible heading id to point to. */
  label: string;
  variant?: "panel" | "sheet" | "screen";
  surface?: "night" | "paper" | "studio";
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      el.showModal();
      document.documentElement.style.overflow = "hidden";
    } else if (!open && el.open) {
      el.close();
    }
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      data-surface={surface}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cx(
        "m-0 max-h-none max-w-none overflow-visible bg-transparent p-0 text-fg backdrop:bg-[#08070a]/75 backdrop:backdrop-blur-[2px]",
        "open:animate-[fade-in_160ms_ease-out]",
        variant === "panel" && "fixed left-1/2 top-[10vh] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2",
        variant === "sheet" && "fixed inset-x-0 bottom-0 top-auto w-full",
        variant === "screen" && "fixed inset-0 h-dvh w-full sm:inset-auto sm:left-1/2 sm:top-[10vh] sm:h-auto sm:w-[min(40rem,calc(100vw-2rem))] sm:-translate-x-1/2",
      )}
    >
      <div
        className={cx(
          "bg-bg text-fg",
          variant === "panel" && "rounded-md border border-line-strong shadow-[0_30px_80px_-20px_rgb(0_0_0/0.7)]",
          variant === "sheet" &&
            "max-h-[88dvh] overflow-y-auto rounded-t-lg border-t border-line-strong pb-[env(safe-area-inset-bottom)] animate-[sheet-in_260ms_var(--ease-out)]",
          variant === "screen" && "flex h-full flex-col sm:h-auto sm:rounded-md sm:border sm:border-line-strong",
          className,
        )}
      >
        {children}
      </div>
    </dialog>
  );
}
