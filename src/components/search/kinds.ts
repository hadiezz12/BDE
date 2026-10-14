import type { SearchKind } from "@/lib/types";
import type { IconName } from "@/components/ui/Icon";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";

/** One glyph per kind of result — shared by the ⌘K dialog and the /search page. */
export const SEARCH_KIND_ICON: Record<SearchKind, IconName> = {
  association: "users",
  evenement: "calendar",
  recrutement: "megaphone",
  article: "file",
};

/** Where each kind lives on the site, in navigation order (Agenda, Assos, Recrutement, Campus). */
export const SEARCH_SECTIONS: {
  kind: SearchKind;
  href: string;
  title: string;
  /** Link under a result group, e.g. "Tout l'agenda". */
  more: string;
  /** Describes how many entries the index holds, e.g. "18 événements à venir". */
  describe: (n: number) => string;
}[] = [
  {
    kind: "evenement",
    href: routes.events,
    title: "L'agenda",
    more: "Tout l'agenda",
    describe: (n) => `${plural(n, "événement")} à venir, des soirées aux masterclass`,
  },
  {
    kind: "association",
    href: routes.associations,
    title: "Les associations",
    more: "Toutes les associations",
    describe: (n) => `${plural(n, "association")} : sport, arts, pro, solidaire…`,
  },
  {
    kind: "recrutement",
    href: routes.recruitment,
    title: "Recrutements",
    more: "Tous les recrutements",
    describe: (n) => `${plural(n, "campagne ouverte ou à venir", "campagnes ouvertes ou à venir")}`,
  },
  {
    kind: "article",
    href: routes.campus,
    title: "Campus, le fil",
    more: "Tout le fil",
    describe: (n) => `${plural(n, "article récent", "articles récents")} : annonces, récaps, interviews`,
  },
];
