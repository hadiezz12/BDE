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
  /**
   * What the index holds right now, in words ("8 événements de l'année"),
   * and who will fill it when it is empty. Never a promise of content.
   */
  describe: (n: number) => string;
}[] = [
  {
    kind: "evenement",
    href: routes.events,
    title: "L'agenda",
    more: "Tout l'agenda",
    describe: (n) =>
      n > 0
        ? `${plural(n, "événement")} de l'année, chacun avec sa page`
        : "Les événements de l'année seront présentés ici par le bureau.",
  },
  {
    kind: "association",
    href: routes.associations,
    title: "Les associations",
    more: "Toutes les associations",
    describe: (n) =>
      n > 1
        ? `${plural(n, "association")} du campus`
        : n === 1
          ? "Une seule pour l'instant : chaque présidente ou président créera la page de son asso."
          : "Les associations arrivent : chaque présidente ou président créera la page de son asso.",
  },
  {
    kind: "recrutement",
    href: routes.recruitment,
    title: "Recrutements",
    more: "Tous les recrutements",
    describe: (n) =>
      n > 0
        ? plural(n, "campagne ouverte ou à venir", "campagnes ouvertes ou à venir")
        : "Pas encore de campagne : chaque asso publiera ses recrutements ici.",
  },
  {
    kind: "article",
    href: routes.campus,
    title: "Campus, le fil",
    more: "Tout le fil",
    describe: (n) =>
      n > 0
        ? plural(n, "article publié", "articles publiés")
        : "Pas encore d'article : le bureau et les assos publieront ici.",
  },
];
