"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { SearchEntry, SearchKind } from "@/lib/types";
import { searchEntries, SEARCH_KIND_LABEL } from "@/lib/search";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Dialog } from "@/components/ui/Dialog";
import { Icon, type IconName } from "@/components/ui/Icon";
import { SEARCH_KIND_ICON as KIND_ICON } from "./kinds";

/**
 * Universal quick search (⌘K / Ctrl+K, or "/"). Searches the local index of
 * associations, events, recruitments and posts; keyboard-first combobox,
 * full screen on phones. The /search page is the no-JS equivalent.
 */

interface Shortcut {
  id: string;
  title: string;
  context: string;
  href: string;
  icon: IconName;
}

const SHORTCUTS: Shortcut[] = [
  { id: "s-tonight", title: "Ce soir sur le campus", context: "Agenda filtré sur aujourd'hui", href: `${routes.events}?quand=aujourdhui`, icon: "calendar" },
  { id: "s-recruit", title: "Recrutements ouverts", context: "Postes à pourvoir dans les assos", href: routes.recruitment, icon: "megaphone" },
  { id: "s-assos", title: "Toutes les associations", context: "Sport, arts, pro, solidaire…", href: routes.associations, icon: "users" },
  { id: "s-vss", title: "Signaler une situation (VSS / VDH)", context: "Confidentiel, sans compte", href: routes.safety, icon: "shield" },
];

export function CommandSearch({ index }: { index: SearchEntry[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const results = useMemo(() => searchEntries(index, query), [index, query]);
  const options = useMemo(
    () =>
      query.trim()
        ? results.map((r) => ({ id: r.id, href: r.href, kind: r.kind as SearchKind | null }))
        : SHORTCUTS.map((s) => ({ id: s.id, href: s.href, kind: null })),
    [query, results],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable=true]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  function onInputKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (!options.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[Math.min(active, options.length - 1)];
      if (opt) go(opt.href);
    }
  }

  const optionId = (id: string) => `${listId}-${id}`;
  const activeId = options[active] ? optionId(options[active].id) : undefined;

  // Group results by kind, keeping each entry's flat index for keyboard navigation.
  const groups = useMemo(() => {
    const map = new Map<SearchKind, { entry: SearchEntry; index: number }[]>();
    results.forEach((entry, index) => map.set(entry.kind, [...(map.get(entry.kind) ?? []), { entry, index }]));
    return [...map.entries()];
  }, [results]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K /"
        className="group inline-flex size-11 items-center justify-center rounded-sm text-fg hover:bg-fg/8 lg:h-10 lg:w-56 lg:justify-start lg:gap-2.5 lg:border lg:border-line-strong/60 lg:px-3 lg:text-muted lg:hover:border-fg lg:hover:bg-transparent lg:hover:text-fg xl:w-64"
      >
        <Icon name="search" size={20} className="lg:size-[18px]" />
        <span className="sr-only lg:not-sr-only lg:text-[0.9rem]">Rechercher</span>
        <kbd className="ml-auto hidden rounded-xs border border-line px-1.5 py-0.5 font-mono text-[0.7rem] text-subtle lg:inline">
          Ctrl K
        </kbd>
      </button>

      <Dialog open={open} onClose={close} label="Recherche" variant="screen">
        <div className="flex items-center gap-3 border-b border-line px-4 sm:px-5">
          <Icon name="search" size={20} className="shrink-0 text-accent-text" />
          <label htmlFor={`${listId}-input`} className="sr-only">
            Rechercher une association, un événement, un poste…
          </label>
          <input
            ref={inputRef}
            id={`${listId}-input`}
            type="search"
            role="combobox"
            aria-expanded={options.length > 0}
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            placeholder="Asso, soirée, poste…"
            className="h-16 min-w-0 flex-1 bg-transparent text-[1.15rem] font-semibold text-fg placeholder:font-normal placeholder:text-subtle focus:outline-none"
          />
          <button
            type="button"
            onClick={close}
            className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-fg/8 hover:text-fg"
          >
            <Icon name="close" size={20} label="Fermer la recherche" />
          </button>
        </div>

        <div className="max-h-[min(60vh,32rem)] flex-1 overflow-y-auto overscroll-contain px-2 py-3 sm:max-h-[60vh]">
          <ul id={listId} role="listbox" aria-label={query ? "Résultats" : "Raccourcis"} className="flex flex-col">
            {!query.trim() &&
              SHORTCUTS.map((s, i) => (
                <Option
                  key={s.id}
                  id={optionId(s.id)}
                  active={active === i}
                  onHover={() => setActive(i)}
                  onPick={() => go(s.href)}
                  icon={s.icon}
                  title={s.title}
                  context={s.context}
                  tone={s.icon === "shield" ? "warn" : undefined}
                />
              ))}

            {query.trim() &&
              groups.map(([kind, entries]) => (
                <li key={kind} role="presentation" className="mt-2 first:mt-0">
                  <p className="px-3 pb-1.5 pt-2 type-label text-subtle" aria-hidden>
                    {SEARCH_KIND_LABEL[kind]}
                  </p>
                  <ul role="group" aria-label={SEARCH_KIND_LABEL[kind]}>
                    {entries.map(({ entry: r, index: i }) => (
                      <Option
                        key={r.id}
                        id={optionId(r.id)}
                        active={active === i}
                        onHover={() => setActive(i)}
                        onPick={() => go(r.href)}
                        icon={KIND_ICON[r.kind]}
                        title={r.title}
                        context={r.context}
                        accent={r.accent}
                      />
                    ))}
                  </ul>
                </li>
              ))}
          </ul>

          {query.trim() && results.length === 0 && (
            <div className="px-3 py-8">
              <p className="type-card">Rien pour « {query.trim()} ».</p>
              <p className="mt-2 text-muted">
                Essaie un nom d&apos;asso (« Altitude »), un type de soirée (« Halloween ») ou un poste (« trésorier »).
              </p>
            </div>
          )}
        </div>

        <div className="hidden items-center justify-between gap-4 border-t border-line px-5 py-3 type-meta text-subtle sm:flex">
          <span>↑ ↓ pour naviguer · Entrée pour ouvrir · Échap pour fermer</span>
          {query.trim() && (
            <a href={`${routes.search}?q=${encodeURIComponent(query.trim())}`} className="text-fg hover:text-accent-text">
              Tous les résultats
            </a>
          )}
        </div>
      </Dialog>
    </>
  );
}

function Option({
  id,
  active,
  onHover,
  onPick,
  icon,
  title,
  context,
  accent,
  tone,
}: {
  id: string;
  active: boolean;
  onHover: () => void;
  onPick: () => void;
  icon: IconName;
  title: string;
  context: string;
  accent?: string;
  tone?: "warn";
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      data-accent={accent}
      onMouseMove={onHover}
      onClick={onPick}
      className={cx(
        "flex cursor-pointer items-center gap-3.5 rounded-sm px-3 py-2.5",
        active ? "bg-fg/8" : "",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "grid size-9 shrink-0 place-items-center rounded-full border",
          tone === "warn" ? "border-warn/60 text-warn" : "border-assoc/50 text-assoc-text",
        )}
      >
        <Icon name={icon} size={17} />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-bold">{title}</span>
        <span className="truncate type-meta text-subtle">{context}</span>
      </span>
      <Icon
        name="arrow-right"
        size={16}
        className={cx("ml-auto shrink-0 transition-opacity", active ? "opacity-100" : "opacity-0")}
      />
    </li>
  );
}
