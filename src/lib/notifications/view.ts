import { CATEGORY_LABEL, notificationAction, notificationPath, notificationText, type NotificationCategory, type Payload } from "@notify/catalog.ts";
import type { IconName } from "@/components/ui/Icon";

/**
 * A notification as the site shows it, built from the row the database
 * returns (private.notification_item): the words come from the shared
 * catalog (the same as the e-mails), the destination is a path rebuilt from
 * validated ids. Safe on the server and in the browser (the bell).
 */

export type NotificationImportance = "normal" | "important" | "critical";

/** A row of my_notifications / my_notification_summary. */
export interface NotificationRow {
  id: number;
  kind: string;
  category: NotificationCategory;
  importance: NotificationImportance | null;
  payload: Payload | null;
  organization: { id: string; slug: string; name: string; short_name: string | null; accent: string | null; kind: string } | null;
  resource_type: string | null;
  resource_id: string | null;
  event_id: string | null;
  application_id: string | null;
  created_at: string;
  read_at: string | null;
  archived_at: string | null;
}

export interface NotificationView {
  id: number;
  kind: string;
  category: NotificationCategory;
  categoryLabel: string;
  importance: NotificationImportance;
  title: string;
  body: string;
  /** Where the notification leads (checked again by that page). */
  destination: string;
  /** The open link: marks it read, then goes to the destination. */
  href: string;
  action: string;
  organization: string | null;
  createdAt: string;
  read: boolean;
  archived: boolean;
}

export const CATEGORY_ICON: Record<NotificationCategory, IconName> = {
  recruitment: "file",
  events: "ticket",
  governance: "users",
  content: "edit",
  campus: "megaphone",
  account: "shield",
};

export function toNotificationView(row: NotificationRow): NotificationView {
  const payload = (row.payload ?? {}) as Payload;
  const text = notificationText(row.kind, payload);
  return {
    id: row.id,
    kind: row.kind,
    category: row.category,
    categoryLabel: CATEGORY_LABEL[row.category] ?? "Notification",
    importance: row.importance ?? "normal",
    title: text.title,
    body: text.body,
    destination: notificationPath({
      kind: row.kind,
      payload,
      event_id: row.event_id,
      application_id: row.application_id,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      organization: row.organization,
    }),
    href: `/account/notifications/${row.id}`,
    action: notificationAction(row.kind),
    organization: row.organization ? (row.organization.short_name ?? row.organization.name) : null,
    createdAt: row.created_at,
    read: row.read_at !== null,
    archived: row.archived_at !== null,
  };
}

export interface NotificationSummary {
  unread: number;
  latest: NotificationView[];
}

export function toSummary(data: unknown): NotificationSummary | null {
  const d = data as { unread?: number; latest?: NotificationRow[] } | null;
  if (!d) return null;
  return { unread: Number(d.unread ?? 0), latest: (d.latest ?? []).map(toNotificationView) };
}

/** "99+" from 100 on (the database stops counting there). */
export function unreadBadge(count: number): string {
  return count >= 100 ? "99+" : String(count);
}
