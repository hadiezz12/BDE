import type { IconName } from "@/components/ui/Icon";
import { routes } from "@/lib/routes";

export interface NavItem {
  href: string;
  label: string;
  /** Tab-bar label (≤ 8 characters). */
  short: string;
  icon: IconName;
}

/** The four public sections. Home is the logo; search and account are utilities. */
export const PRIMARY_NAV: NavItem[] = [
  { href: routes.events, label: "Agenda", short: "Agenda", icon: "calendar" },
  { href: routes.associations, label: "Associations", short: "Assos", icon: "users" },
  { href: routes.recruitment, label: "Recrutement", short: "Recrute", icon: "megaphone" },
  { href: routes.campus, label: "Campus", short: "Campus", icon: "file" },
];

export const ACCOUNT_NAV: NavItem[] = [
  { href: routes.account, label: "Mon espace", short: "Espace", icon: "home" },
  { href: routes.accountEvents, label: "Mes événements", short: "Billets", icon: "ticket" },
  { href: routes.accountApplications, label: "Mes candidatures", short: "Candid.", icon: "file" },
  { href: routes.accountNotifications, label: "Notifications", short: "Notifs", icon: "bell" },
  { href: routes.accountProfile, label: "Profil", short: "Profil", icon: "user" },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
