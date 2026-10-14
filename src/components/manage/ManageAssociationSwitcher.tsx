"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { AssociationRef } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";
import { AssociationLogo } from "@/components/associations/AssociationLogo";
import { activeSection, MANAGE_SECTIONS } from "./sections";

/**
 * The association being managed, in its own accent. When the officer runs
 * several associations (Yanis: Very Pink Club + Ourcq FM) it becomes a
 * disclosure that jumps to the same section of the other association.
 */
export function ManageAssociationSwitcher({
  current,
  options,
  className,
}: {
  current: AssociationRef;
  /** Every association the user manages, current one included. */
  options: AssociationRef[];
  className?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [seenPath, setSeenPath] = useState(pathname);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const others = options.filter((o) => o.id !== current.id);

  // Close after navigating (adjusting state during render, not in an effect).
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const identity = (
    <>
      <AssociationLogo association={current} size={36} />
      <span className="flex min-w-0 flex-col text-left">
        <span className="truncate font-bold leading-tight">{current.name}</span>
        <span className="truncate type-meta text-subtle">{current.kind}</span>
      </span>
    </>
  );

  if (others.length === 0) {
    return (
      <div data-accent={current.accent} className={cx("flex min-w-0 items-center gap-3", className)}>
        {identity}
      </div>
    );
  }

  const section = activeSection(pathname, current.slug);
  const hrefFor = (slug: string) =>
    MANAGE_SECTIONS.find((s) => s.key === section)?.href(slug) ?? routes.manageHome(slug);

  return (
    <div ref={rootRef} data-accent={current.accent} className={cx("relative min-w-0", className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full min-w-0 items-center gap-3 rounded-sm border border-line py-1.5 pl-1.5 pr-2.5 transition-colors hover:border-line-strong hover:bg-fg/[0.03]"
      >
        <span className="sr-only">Changer d&apos;association. Association actuelle :</span>
        {identity}
        <Icon
          name="chevron-down"
          size={16}
          className={cx("ml-auto shrink-0 text-muted transition-transform", open && "rotate-180")}
        />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute inset-x-0 top-[calc(100%+0.375rem)] z-50 min-w-64 rounded-md border border-line-strong bg-raised p-1.5 shadow-lg"
      >
        <p className="px-2 pb-1.5 pt-1 type-label text-subtle">Tes associations</p>
        <ul className="flex flex-col">
          {options.map((a) => {
            const isCurrent = a.id === current.id;
            const row = (
              <>
                <AssociationLogo association={a} size={28} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold leading-tight">{a.name}</span>
                  <span className="truncate type-meta text-subtle">{a.kind}</span>
                </span>
                {isCurrent && <Icon name="check" size={18} className="ml-auto shrink-0 text-assoc-text" />}
              </>
            );
            return (
              <li key={a.id} data-accent={a.accent}>
                {isCurrent ? (
                  <span aria-current="true" className="flex min-h-12 items-center gap-3 rounded-sm bg-assoc-soft px-2">
                    {row}
                  </span>
                ) : (
                  <Link href={hrefFor(a.slug)} className="flex min-h-12 items-center gap-3 rounded-sm px-2 hover:bg-fg/5">
                    {row}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
