import "server-only";
import { cache } from "react";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import type { Notification } from "@/lib/types";
import { routes } from "@/lib/routes";
import type { MyEventStatusPayload, MyEventsPayload } from "./model";
import { eventMessage, type EventMessageKind, type EventMessagePayload } from "./messages";
import { applicationMessage, isApplicationMessage, type ApplicationMessageKind, type ApplicationMessagePayload } from "@/lib/recruitment/messages";

/**
 * A student's own side of events: their registration for one event (with
 * the waiting place and, once confirmed, the private joining details), all
 * their registrations and saved events, and their messages. Each read goes
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

export interface MyNotification {
  id: number;
  kind: EventMessageKind | ApplicationMessageKind;
  event_id: string | null;
  application_id: string | null;
  payload: EventMessagePayload & ApplicationMessagePayload;
  created_at: string;
  read_at: string | null;
}

/** The student's messages, newest first (their own rows: row level security). */
export const getMyNotifications = cache(async (limit = 50): Promise<MyNotification[]> => {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("notification_outbox")
    .select("id, kind, event_id, application_id, payload, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logDataError("notification_outbox", error);
    return [];
  }
  return data as unknown as MyNotification[];
});

/** The student's messages (events and applications) as the account pages list them (same words as the e-mails). */
export async function getMyEventNotifications(limit = 50): Promise<Notification[]> {
  return (await getMyNotifications(limit)).map((n) => {
    if (isApplicationMessage(n.kind)) {
      const message = applicationMessage(n.kind, n.payload);
      return {
        id: String(n.id),
        userId: "",
        kind: "candidature",
        title: message.title,
        body: message.body,
        createdAt: n.created_at,
        read: n.read_at !== null,
        href: n.application_id ? routes.accountApplication(n.application_id) : routes.accountApplications,
      };
    }
    const kind = n.kind as EventMessageKind;
    const message = eventMessage(kind, n.payload);
    return {
      id: String(n.id),
      userId: "",
      kind: "evenement",
      title: message.title,
      body: message.body,
      createdAt: n.created_at,
      read: n.read_at !== null,
      href: n.payload.slug && kind !== "event_registration_removed" ? routes.event(n.payload.slug) : routes.accountEvents,
    };
  });
}
