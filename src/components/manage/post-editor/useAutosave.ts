"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { savePost, type SaveResult } from "@/app/actions/posts";
import type { PostContent } from "@/lib/posts/content";
import type { GovernanceErrorCode } from "@/lib/governance/messages";

/** The saved working version the editor writes onto (what the database calls revision + version). */
export interface SavedRevision {
  revisionId: string;
  version: number;
  number: number;
}

export type SaveState =
  | { phase: "saved"; at: number | null }
  | { phase: "dirty" }
  | { phase: "saving" }
  | { phase: "error"; code: GovernanceErrorCode | "content"; message: string; retry: boolean }
  | { phase: "conflict" };

/** What the editor would save now, or why it cannot be saved as it is (in words). */
export type Collected = { ok: true; content: PostContent } | { ok: false; message: string };

type Saved = Extract<SaveResult, { ok: true }>;

/** Quiet time after the last keystroke before saving. */
const DEBOUNCE_MS = 1500;
/** Someone typing without a pause still gets a save this often. */
const MAX_WAIT_MS = 10_000;
/** Refusals another attempt would not fix: autosave stops, the text stays on screen. */
const FINAL = new Set<string>(["insufficient_permission", "post_not_found", "organization_suspended"]);

/**
 * Autosave of the post editor. Changes are saved ~1.5 s after typing stops
 * (or every 10 s of continuous typing), one request at a time: what is typed
 * while a save runs is sent right after it, never in parallel. The state
 * says "saved" only once the server has confirmed. A save carries the
 * revision and version it started from: if someone else saved meanwhile, the
 * database refuses (draft_conflict) and autosave stops, keeping the text.
 *
 * `collect` returns the content as it would be saved now, in the same
 * canonical form as `loaded` (the version as the server sent it), so an
 * edit undone before the save sends nothing, and a frozen version unlocked
 * but left unchanged never becomes a new version.
 */
export function useAutosave({
  postId,
  initial,
  loaded,
  collect,
  onSaved,
}: {
  postId: string;
  initial: SavedRevision;
  /** The loaded content, normalized (null: unknown, the first change is saved). */
  loaded: PostContent | null;
  collect: () => Collected | null;
  onSaved?: (result: Saved) => void;
}) {
  const [state, setState] = useState<SaveState>({ phase: "saved", at: null });
  const [saved, setSaved] = useState<SavedRevision>(initial);
  const [loadedJson] = useState(() => (loaded ? JSON.stringify(loaded) : null));
  /** When the server last confirmed a save in this visit (stays put while typing). */
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const savedRef = useRef(initial);
  const baseline = useRef<string | null>(loadedJson);
  const lastAt = useRef<number | null>(null);
  const dirty = useRef(false);
  const stopped = useRef(false);
  const released = useRef(false);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collectRef = useRef(collect);
  const onSavedRef = useRef(onSaved);

  useEffect(() => {
    collectRef.current = collect;
    onSavedRef.current = onSaved;
  });

  const clearTimers = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (maxTimer.current) clearTimeout(maxTimer.current);
    timer.current = null;
    maxTimer.current = null;
  }, []);

  /** Saves now (or joins the save running). Resolves true once everything typed is on the server. */
  const save = useCallback((): Promise<boolean> => {
    clearTimers();
    if (inFlight.current) return inFlight.current;
    if (stopped.current) return Promise.resolve(false);
    if (!dirty.current) return Promise.resolve(true);

    const run = (async () => {
      let ok = true;
      while (dirty.current && !stopped.current) {
        dirty.current = false;
        const collected = collectRef.current();
        if (!collected) {
          // The editor is not ready yet: try again on the next change.
          dirty.current = true;
          ok = false;
          break;
        }
        if (!collected.ok) {
          // Nothing a new attempt fixes until the text changes (each change saves again).
          dirty.current = true;
          ok = false;
          setState({ phase: "error", code: "content", message: collected.message, retry: false });
          break;
        }
        const json = JSON.stringify(collected.content);
        if (json === baseline.current) continue;
        setState({ phase: "saving" });
        const base = savedRef.current;
        let result: SaveResult;
        try {
          result = await savePost({ postId, revisionId: base.revisionId, version: base.version, content: collected.content });
        } catch {
          result = {
            ok: false,
            code: "unavailable",
            message: "Connexion perdue : ton texte est toujours là, mais il n'est pas enregistré.",
          };
        }
        if (!result.ok) {
          dirty.current = true;
          ok = false;
          if (result.code === "draft_conflict") {
            stopped.current = true;
            setState({ phase: "conflict" });
          } else {
            stopped.current = FINAL.has(result.code);
            setState({ phase: "error", code: result.code, message: result.message, retry: !stopped.current });
          }
          break;
        }
        baseline.current = json;
        lastAt.current = result.savedAt;
        setSavedAt(result.savedAt);
        savedRef.current = { revisionId: result.revisionId, version: result.version, number: result.number };
        setSaved(savedRef.current);
        onSavedRef.current?.(result);
      }
      inFlight.current = null;
      if (ok) setState({ phase: "saved", at: lastAt.current });
      return ok;
    })();
    inFlight.current = run;
    return run;
  }, [postId, clearTimers]);

  /** Something changed: save after a pause. */
  const touch = useCallback(() => {
    dirty.current = true;
    if (stopped.current) return;
    if (!inFlight.current) setState((s) => (s.phase === "dirty" ? s : { phase: "dirty" }));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), DEBOUNCE_MS);
    if (!maxTimer.current) maxTimer.current = setTimeout(() => void save(), MAX_WAIT_MS);
  }, [save]);

  /** "Réessayer" after a failure that another attempt may fix. */
  const retry = useCallback(() => {
    if (stopped.current) return;
    dirty.current = true;
    void save();
  }, [save]);

  /** Leaving on purpose (reload after a conflict): no "unsaved changes" prompt. */
  const release = useCallback(() => {
    released.current = true;
  }, []);

  const unsaved = state.phase !== "saved";

  // Closing the tab or the browser with something unsaved asks first.
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!released.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  // Phones: switching apps may be the last chance to save.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && dirty.current) void save();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [save]);

  // Leaving the editor inside the site (a link, the back button): send what is pending.
  useEffect(
    () => () => {
      clearTimers();
      if (dirty.current && !stopped.current && !inFlight.current) void save();
    },
    [save, clearTimers],
  );

  return { state, saved, savedAt, unsaved, touch, save, retry, release };
}
