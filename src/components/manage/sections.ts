import type { IconName } from "@/components/ui/Icon";
import { routes } from "@/lib/routes";

/**
 * The eight sections of an association workspace, in nav order. The
 * association slug is part of every URL (see lib/routes.ts).
 */
export type ManageSectionKey =
  | "home"
  | "content"
  | "events"
  | "team"
  | "recruitment"
  | "media"
  | "analytics"
  | "settings";

export interface ManageSection {
  key: ManageSectionKey;
  label: string;
  icon: IconName;
  href: (asso: string) => string;
}

export const MANAGE_SECTIONS: ManageSection[] = [
  { key: "home", label: "Accueil", icon: "home", href: routes.manageHome },
  { key: "content", label: "Contenus", icon: "file", href: routes.manageContent },
  { key: "events", label: "Événements", icon: "calendar", href: routes.manageEvents },
  { key: "team", label: "Équipe", icon: "users", href: routes.manageTeam },
  { key: "recruitment", label: "Recrutement", icon: "megaphone", href: routes.manageRecruitment },
  { key: "media", label: "Médias", icon: "image", href: routes.manageMedia },
  { key: "analytics", label: "Statistiques", icon: "chart", href: routes.manageAnalytics },
  { key: "settings", label: "Réglages", icon: "sliders", href: routes.manageSettings },
];

/** Which section a pathname belongs to ("home" only on the exact workspace URL). */
export function activeSection(pathname: string, asso: string): ManageSectionKey | null {
  const home = routes.manageHome(asso);
  if (pathname === home || pathname === `${home}/`) return "home";
  const match = MANAGE_SECTIONS.find(
    (s) => s.key !== "home" && (pathname === s.href(asso) || pathname.startsWith(`${s.href(asso)}/`)),
  );
  return match?.key ?? null;
}
