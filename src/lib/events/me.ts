import "server-only";
import { cache } from "react";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import type { MyEventStatusPayload, MyEventsPayload } from "./model";

/**
 * A student's own side of events: their registration for one event (with
 * the waiting place and, once confirmed, the private joining details), all
 * their registrations and saved events (their messages: lib/notifications).
 * Each read goes
 * through the student's own session: the database returns their rows only.
 * Visitors get nothing (null / empty), never an error.
 */

export const getMyEventStatus = cache(async (eventId: string): Promise<MyEventStatusPayload | null> => {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_event_status", { p_event_id: eventId });
  if (error) {
    logDataError("my_event_status", error);
    return null;
  }
  return data as unknown as MyEventStatusPayload;
});

export const getMyEvents = cache(async (): Promise<MyEventsPayload> => {
  const empty: MyEventsPayload = { registrations: [], bookmarks: [] };
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return empty;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_events");
  if (error) {
    logDataError("my_events", error);
    return empty;
  }
  return (data as unknown as MyEventsPayload) ?? empty;
});
