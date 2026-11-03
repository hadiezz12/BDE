"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import type { SearchEntry, SearchKind } from "@/lib/types";
import { SEARCH_KIND_LABEL } from "@/lib/search/match";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Dialog } from "@/components/ui/Dialog";
import { Icon, type IconName } from "@/components/ui/Icon";
import { SEARCH_KIND_ICON as KIND_ICON } from "./kinds";
import { matchPages, SEARCH_SHORTCUTS } from "./pages";

/** Typing pauses this long before the database is asked. */
const DEBOUNCE_MS = 200;
/** Display order of the groups. */
const KIND_ORDER: SearchKind[] = ["association", "evenement", "recrutement", "poste", "article"];

/** The database's last answer, for the query it answered. */
type Answer = { q: string; results: SearchEntry[]; total: number; tooShort: boolean } | { q: string; error: true };

/**
 * Universal quick search (⌘K / Ctrl+K, or "/"). Once the typing pauses it
 * asks /api/search (the database's public search: associations, articles,
 * events, recruitment and positions, whatever a visitor may read right now)
 * and cancels the previous question, so answers never arrive out of order;
 * the site's own pages (carte, VSS / VDH…) are matched here. Nothing is
 * downloaded before the dialog is used. Keyboard-first combobox, full
 * screen on phones; the /search page is the no-JS equivalent.
 */
export function CommandSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const trimmed = query.replace(/\s+/g, " ").trim();

  useEffect(() => {
    if (!open || trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as { results: SearchEntry[]; total: number; tooShort: boolean };
        setAnswer({ q: trimmed, results: body.results ?? [], total: body.total ?? 0, tooShort: body.tooShort });
      } catch {
        if (controller.signal.aborted) return;
        setAnswer({ q: trimmed, error: true });
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, trimmed]);

  // While the next answer is on its way, the previous one stays (dimmed).
  const searching = open && trimmed.length >= 2;
  const loading = searching && answer?.q !== trimmed;
  const failed = searching && !loading && answer !== null && "error" in answer;
  const settled = searching && !loading && answer !== null && !("error" in answer);
  const total = answer && !("error" in answer) ? answer.total : 0;
  const results = useMemo(() => (searching && answer && !("error" in answer) ? answer.results : []), [searching, answer]);
  const pages = useMemo(() => matchPages(query), [query]);

  // Group results by kind, keeping each entry's flat index for keyboard navigation.
  const groups = useMemo(() => {
    const map = new Map<SearchKind, SearchEntry[]>();
    for (const entry of results) map.set(entry.kind, [...(map.get(entry.kind) ?? []), entry]);
    let i = 0;
    return KIND_ORDER.filter((k) => map.has(k)).map((kind) => ({
      kind,
      entries: map.get(kind)!.map((entry) => ({ entry, index: i++ })),
    }));
  }, [results]);
  const resultCount = groups.reduce((n, g) => n + g.entries.length, 0);

  // One flat list for the keyboard: data results first, then pages.
  const options = useMemo(
    () =>
      trimmed
        ? [
            ...groups.flatMap((g) => g.entries.map(({ entry }) => ({ id: `${entry.kind}-${entry.id}`, href: entry.href }))),
            ...pages.map((p) => ({ id: p.id, href: p.href })),
          ]
        : SEARCH_SHORTCUTS.map((s) => ({ id: s.id, href: s.href })),
    [trimmed, groups, pages],
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

  const allHref = `${routes.search}?q=${encodeURIComponent(trimmed)}`;

  function onInputKey(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && trimmed && !options.length) {
      // Nothing to pick yet: Enter opens the full search.
      e.preventDefault();
      go(allHref);
      return;
    }
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

  // What the live region says (the list itself is not announced).
  const announcement = !trimmed
    ? ""
    : trimmed.length < 2
      ? "Tape au moins deux caractères."
      : loading
        ? "Recherche en cours…"
        : failed
          ? "La recherche ne répond pas."
          : `${resultCount + pages.length} résultat${resultCount + pages.length > 1 ? "s" : ""}.`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-keyshortcuts="Control+K Meta+K /"
        className="group inline-flex size-11 items-center justify-center rounded-sm text-fg hover:bg-fg/8 xl:h-10 xl:w-auto xl:justify-start xl:gap-2.5 xl:border xl:border-line-strong/60 xl:px-3 xl:text-muted xl:hover:border-fg xl:hover:bg-transparent xl:hover:text-fg min-[90rem]:w-64"
      >
        <Icon name="search" size={20} className="xl:size-[18px]" />
        <span className="sr-only xl:not-sr-only xl:text-[0.9rem]">Rechercher</span>
        <kbd className="ml-auto hidden rounded-xs border border-line px-1.5 py-0.5 font-mono text-[0.7rem] text-subtle min-[90rem]:inline">
          Ctrl K
        </kbd>
      </button>

      <Dialog open={open} onClose={close} label="Recherche" variant="screen">
        <div className="flex items-center gap-3 border-b border-line px-4 sm:px-5">
          <Icon
            name="search"
            size={20}
            className={cx("shrink-0 text-accent-text transition-opacity", loading && "animate-pulse")}
          />
          <label htmlFor={`${listId}-input`} className="sr-only">
            Rechercher une association, un événement, un recrutement, un article…
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
            aria-busy={loading || undefined}
            autoComplete="off"
            spellCheck={false}
            maxLength={80}
            enterKeyHint="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            placeholder="Asso, événement, poste, article…"
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

        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>

        <div className="max-h-[min(60vh,32rem)] flex-1 overflow-y-auto overscroll-contain px-2 py-3 sm:max-h-[60vh]">
          <ul
            id={listId}
            role="listbox"
            aria-label={trimmed ? "Résultats" : "Raccourcis"}
            className={cx("flex flex-col transition-opacity", loading && results.length > 0 && "opacity-60")}
          >
            {!trimmed &&
              SEARCH_SHORTCUTS.map((s, i) => (
                <Option
                  key={s.id}
                  id={optionId(s.id)}
                  active={active === i}
                  onHover={() => setActive(i)}
                  onPick={() => go(s.href)}
                  icon={s.icon}
                  title={s.title}
                  context={s.context}
                  tone={s.tone}
                />
              ))}

            {trimmed &&
              groups.map(({ kind, entries }) => (
                <li key={kind} role="presentation" className="mt-2 first:mt-0">
                  <p className="px-3 pb-1.5 pt-2 type-label text-subtle" aria-hidden>
                    {SEARCH_KIND_LABEL[kind]}
                  </p>
                  <ul role="group" aria-label={SEARCH_KIND_LABEL[kind]}>
                    {entries.map(({ entry: r, index: i }) => (
                      <Option
                        key={`${r.kind}-${r.id}`}
                        id={optionId(`${r.kind}-${r.id}`)}
                        active={active === i}
                        onHover={() => setActive(i)}
                        onPick={() => go(r.href)}
                        icon={KIND_ICON[r.kind]}
                        title={r.title}
                        context={r.status ? `${r.status.label} · ${r.context}` : r.context}
                        accent={r.accent}
                      />
                    ))}
                  </ul>
                </li>
              ))}

            {trimmed && pages.length > 0 && (
              <li role="presentation" className="mt-2 first:mt-0">
                <p className="px-3 pb-1.5 pt-2 type-label text-subtle" aria-hidden>
                  Pages
                </p>
                <ul role="group" aria-label="Pages">
                  {pages.map((p, j) => {
                    const i = resultCount + j;
                    return (
                      <Option
                        key={p.id}
                        id={optionId(p.id)}
                        active={active === i}
                        onHover={() => setActive(i)}
                        onPick={() => go(p.href)}
                        icon={p.icon}
                        title={p.title}
                        context={p.context}
                        tone={p.tone}
                      />
                    );
                  })}
                </ul>
              </li>
            )}
          </ul>

          {trimmed.length === 1 && (
            <p className="px-3 py-8 text-muted">Encore une lettre : la recherche commence à deux caractères.</p>
          )}
          {failed && options.length === 0 && (
            <div className="px-3 py-8">
              <p className="type-card">La recherche ne répond pas.</p>
              <p className="mt-2 text-muted">Réessaie dans un instant, ou ouvre la page de recherche.</p>
            </div>
          )}
          {settled && options.length === 0 && (
            <div className="px-3 py-8">
              <p className="type-card break-words">Rien pour « {trimmed} ».</p>
              <p className="mt-2 text-muted">
                Essaie un mot plus court, le nom d&apos;une asso, « carte » ou « VSS ». Les accents et les majuscules ne
                comptent pas.
              </p>
            </div>
          )}
        </div>

        <div className="hidden items-center justify-between gap-4 border-t border-line px-5 py-3 type-meta text-subtle sm:flex">
          <span>↑ ↓ pour naviguer · Entrée pour ouvrir · Échap pour fermer</span>
          {trimmed.length >= 2 && (
            <a href={allHref} className="text-fg hover:text-accent-text">
              {settled && total > resultCount ? `Tous les résultats (${total})` : "Tous les résultats"}
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
      className={cx("flex cursor-pointer items-center gap-3.5 rounded-sm px-3 py-2.5", active ? "bg-fg/8" : "")}
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
