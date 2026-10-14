import "server-only";
import { DEFAULT_NOTIFICATION_PREFERENCES, notificationPreferences } from "@/data/mock/preferences";
import type { NotificationPreferences } from "@/lib/types";

/** A student's notification settings, or the defaults when they never changed them. */
export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  return notificationPreferences[userId] ?? DEFAULT_NOTIFICATION_PREFERENCES;
}
