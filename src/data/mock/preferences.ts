import type { NotificationPreferences } from "@/lib/types";

/**
 * Notification settings (student space › Profil). Accounts without an entry
 * get DEFAULT_NOTIFICATION_PREFERENCES; the demo accounts start with none.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  evenement: { espace: true, mail: true },
  candidature: { espace: true, mail: true },
  association: { espace: true, mail: false },
  bde: { espace: true, mail: false },
};

export const notificationPreferences: Record<string, NotificationPreferences> = {};
