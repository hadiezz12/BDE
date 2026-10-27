import "server-only";
import { cache } from "react";
import type { NotificationCategory } from "@notify/catalog.ts";
import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import { toNotificationView, toSummary, type NotificationRow, type NotificationSummary, type NotificationView } from "./view";

/**
 * The notification centre's reads (Phase 10), each through the person's own
 * session and a database function that returns their rows only. A visitor
 * gets nothing (null / empty), never an error. Monitoring and broadcasts are
 * read through functions that check the BDE's or the association's key.
 */

export type NotificationListView = "all" | "unread" | "archived";

export interface NotificationPage {
  items: NotificationView[];
  next: { before: string; beforeId: number } | null;
}

/** The bell and the unread badges: the unread count (capped at 100) and the latest five. */
export const getMyNotificationSummary = cache(async (): Promise<NotificationSummary | null> => {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_notification_summary");
  if (error) {
    logDataError("my_notification_summary", error);
    return null;
  }
  return toSummary(data);
});

export async function getMyNotificationPage(options: {
  view: NotificationListView;
  category: NotificationCategory | null;
  before?: string | null;
  beforeId?: number | null;
  limit?: number;
}): Promise<NotificationPage | null> {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_notifications", {
    p_view: options.view,
    ...(options.category ? { p_category: options.category } : {}),
    ...(options.before ? { p_before: options.before, p_before_id: options.beforeId ?? undefined } : {}),
    p_limit: options.limit ?? 30,
  });
  if (error) {
    logDataError("my_notifications", error);
    return null;
  }
  const d = data as unknown as { items: NotificationRow[]; next: { before: string; before_id: number } | null };
  return {
    items: (d.items ?? []).map(toNotificationView),
    next: d.next ? { before: d.next.before, beforeId: d.next.before_id } : null,
  };
}

export type TopicClass = "essential" | "operational" | "optional";

export interface NotificationTopicChoice {
  key: string;
  class: TopicClass;
  category: NotificationCategory;
  label: string;
  description: string;
  in_app: boolean;
  email: boolean;
  customized: boolean;
}

export interface NotificationPreferencesPayload {
  topics: NotificationTopicChoice[];
  settings: { quiet_hours: boolean; quiet_start: string; quiet_end: string; timezone: string };
  follows: Array<{ id: string; slug: string; name: string; short_name: string | null; accent: string | null; since: string }>;
  suppression: { reason: "hard_bounce" | "invalid_address" | "blocked" | "complaint" | string; since: string } | null;
  changes: Array<{ topic: string | null; organization: string | null; change: string; source: string; at: string }>;
}

export async function getMyNotificationPreferences(): Promise<NotificationPreferencesPayload | null> {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_notification_preferences");
  if (error) {
    logDataError("my_notification_preferences", error);
    return null;
  }
  return data as unknown as NotificationPreferencesPayload;
}

export async function amIFollowing(organizationId: string): Promise<boolean | null> {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("am_i_following", { p_organization_id: organizationId });
  if (error) {
    logDataError("am_i_following", error);
    return null;
  }
  return Boolean(data);
}

/* ---- Unsubscribe links (no session: the token is the proof) ---------------------------------- */

export type UnsubscribeStatus = "valid" | "used" | "expired" | "invalid";

export async function peekUnsubscribeToken(token: string): Promise<{ status: UnsubscribeStatus; label: string | null }> {
  if (!/^[0-9a-f]{64}$/.test(token)) return { status: "invalid", label: null };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("peek_unsubscribe_token", { p_token: token });
  if (error) {
    logDataError("peek_unsubscribe_token", error);
    return { status: "invalid", label: null };
  }
  const d = data as unknown as { status: UnsubscribeStatus; label?: string | null };
  return { status: d.status, label: d.label ?? null };
}

/* ---- Monitoring (BDE: platform.communications.monitor) ---------------------------------------- */

export type DeliveryMode = "off" | "capture" | "live";

export interface NotificationHealth {
  mode: DeliveryMode;
  configured: { email_from: boolean; site_url: boolean; worker: boolean; webhook: boolean };
  queue: { due: number; oldest_due_at: string | null; waiting: number; retrying: number; processing: number };
  last_24h: { accepted: number; delivered: number; failed: number; suppressed: number; cancelled: number };
  last_run: {
    started_at: string;
    finished_at: string | null;
    mode: DeliveryMode;
    claimed: number;
    accepted: number;
    failed: number;
    skipped: number;
    error: string | null;
  } | null;
  runs_last_hour: number;
  suppressions: number;
  alerts: string[];
}

export interface FailedDelivery {
  id: number;
  kind: string;
  topic: string;
  essential: boolean;
  status: "failed_permanent" | "suppressed";
  attempts: number;
  error: string | null;
  created_at: string;
  updated_at: string;
  organization: string | null;
  retryable: boolean;
}

export async function getNotificationHealth(): Promise<NotificationHealth | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("notification_health");
  if (error) {
    if (error.code !== "P0001") logDataError("notification_health", error);
    return null;
  }
  return data as unknown as NotificationHealth;
}

export async function getFailedDeliveries(limit = 50): Promise<FailedDelivery[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("notification_failed_deliveries", { p_limit: limit });
  if (error) {
    if (error.code !== "P0001") logDataError("notification_failed_deliveries", error);
    return [];
  }
  return (data as unknown as FailedDelivery[]) ?? [];
}

/** The catalog of kinds, for the template preview (public words). */
export async function getNotificationCatalog(): Promise<
  Array<{ key: string; topic: string; importance: string; confidential: boolean; description: string; class: TopicClass; category: NotificationCategory }>
> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("notification_types")
    .select("key, topic, importance, confidential, description, notification_topics!inner(class, category)")
    .order("key");
  if (error) {
    logDataError("notification_types", error);
    return [];
  }
  return (data ?? []).map((t) => {
    const topic = t.notification_topics as unknown as { class: TopicClass; category: NotificationCategory };
    return { key: t.key, topic: t.topic, importance: t.importance, confidential: t.confidential, description: t.description, ...topic };
  });
}

/* ---- Broadcasts ------------------------------------------------------------------------------- */

export type BroadcastAudience = "all_students" | "members" | "followers";
export type BroadcastStatus = "draft" | "pending_approval" | "queued" | "dispatching" | "dispatched" | "cancelled";

export interface BroadcastOptions {
  options: Array<{ audience: BroadcastAudience; recipients: number; email: number }>;
  sent_last_24h: number;
  limit_per_day: number;
}

export interface Broadcast {
  id: string;
  audience: BroadcastAudience;
  kind: string;
  title: string;
  body: string;
  link_path: string | null;
  email: boolean;
  importance: "normal" | "important";
  status: BroadcastStatus;
  needs_approval: boolean;
  mine: boolean;
  can_approve: boolean;
  created_by_name: string | null;
  approved_by_name: string | null;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
  scheduled_at: string | null;
  dispatched_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  recipients: number | null;
  stats: { notified: number; read: number; email_queued: number; email_accepted: number; email_failed: number };
}

/** What the person may send for this organization (null: nothing, they hold no key). */
export async function getBroadcastOptions(organizationId: string): Promise<BroadcastOptions | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("notification_broadcast_options", { p_organization_id: organizationId });
  if (error) {
    if (error.code !== "P0001") logDataError("notification_broadcast_options", error);
    return null;
  }
  return data as unknown as BroadcastOptions;
}

export async function getOrganizationBroadcasts(organizationId: string): Promise<Broadcast[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("organization_broadcasts", { p_organization_id: organizationId });
  if (error) {
    if (error.code !== "P0001") logDataError("organization_broadcasts", error);
    return [];
  }
  return (data as unknown as Broadcast[]) ?? [];
}
