import type { NotificationPreferences } from "@/lib/types";

/**
 * Notification settings of the demo accounts (student space › Profil).
 * Accounts without an entry get DEFAULT_NOTIFICATION_PREFERENCES.
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  evenement: { espace: true, mail: true },
  candidature: { espace: true, mail: true },
  association: { espace: true, mail: false },
  bde: { espace: true, mail: false },
};

export const notificationPreferences: Record<string, NotificationPreferences> = {
  // Inès turned the BDE mails off after the third "billetterie ouverte" of September.
  "u-ines": {
    evenement: { espace: true, mail: true },
    candidature: { espace: true, mail: true },
    association: { espace: true, mail: true },
    bde: { espace: true, mail: false },
  },
  "u-yanis": {
    evenement: { espace: true, mail: false },
    candidature: { espace: true, mail: true },
    association: { espace: true, mail: false },
    bde: { espace: true, mail: false },
  },
};
