import "server-only";
import { cache } from "react";
import type { CampaignItem, EventItem, SavedItem, SavedKeys, SavedKind } from "@/lib/types";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import { toSavedItem, type SavedItemPayload } from "@/lib/search/entries";
import { toEventItem, type EventCardPayload } from "@/lib/events/model";
import { toCampaignItem, type CampaignCardPayload } from "@/lib/recruitment/model";

/**
 * A student's own saved items and interests (Phase 12), through their own
 * session: the database returns their rows only (nobody else's, and no
 * association or BDE ever reads them). Visitors get nothing, never an error.
 */

const NO_KEYS: SavedKeys = { association: [], post: [], event: [], campaign: [], position: [] };

/** Which items I saved, per kind (one small read for every save button of a page). */
export const getMySavedKeys = cache(async (): Promise<SavedKeys> => {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return NO_KEYS;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_saved_keys");
  if (error) {
    logDataError("my_saved_keys", error);
    return NO_KEYS;
  }
  return { ...NO_KEYS, ...(data as unknown as Partial<SavedKeys>) };
});

export async function isSaved(kind: SavedKind, id: string): Promise<boolean> {
  return (await getMySavedKeys())[kind].includes(id);
}

/** My saved items, newest first, with their live public state; null when they cannot be read. */
export const getMySavedItems = cache(async (kind: SavedKind | null = null): Promise<SavedItem[] | null> => {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_saved_items", kind ? { p_kind: kind } : {});
  if (error) {
    logDataError("my_saved_items", error);
    return null;
  }
  const now = new Date();
  return ((data as unknown as SavedItemPayload[]) ?? []).map((p) => toSavedItem(p, now));
});

export interface CampusSuggestions {
  interests: { slug: string; label: string }[];
  /** Each with the interests it comes from. */
  events: { event: EventItem; because: string[] }[];
  campaigns: { campaign: CampaignItem; because: string[] }[];
}

/** What my chosen interests suggest (and only them: nothing inferred). */
export const getMyCampusSuggestions = cache(async (): Promise<CampusSuggestions | null> => {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_campus_suggestions");
  if (error) {
    logDataError("my_campus_suggestions", error);
    return null;
  }
  const p = data as unknown as {
    interests: { slug: string; label: string }[];
    events: (EventCardPayload & { because: string[] | null })[];
    campaigns: (CampaignCardPayload & { because: string[] | null })[];
  };
  return {
    interests: p.interests ?? [],
    events: (p.events ?? []).map((e) => ({ event: toEventItem(e), because: e.because ?? [] })),
    campaigns: (p.campaigns ?? []).map((c) => ({ campaign: toCampaignItem(c), because: c.because ?? [] })),
  };
});
