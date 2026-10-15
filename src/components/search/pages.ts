import type { IconName } from "@/components/ui/Icon";
import { routes } from "@/lib/routes";
import { normaliseQuery } from "@/lib/search";

/**
 * The site's own pages, findable by search next to the data index
 * (associations, events…): "carte" or "harcèlement" should lead somewhere.
 * Every line describes a page that exists, in the maquette's words — no
 * claim about content that has not been published.
 */
export interface SitePage {
  id: string;
  title: string;
  context: string;
  href: string;
  icon: IconName;
  /** Safety pages wear amber. */
  tone?: "warn";
  /** Extra words that should find the page (accents and case do not matter). */
  keywords: string;
}

/** The BDE's page, where the carte cotisante is presented (#carte). */
const BDE_PAGE = routes.association("very-pink-club");

const EVENTS: SitePage = {
  id: "p-evenements",
  title: "Les 8 événements de l'année",
  context: "Chaque événement a sa page dédiée",
  href: routes.events,
  icon: "calendar",
  keywords: "agenda evenements soirees week-ends aperos annee",
};

const BDE: SitePage = {
  id: "p-bde",
  title: "Le Very Pink Club",
  context: "Le bureau des étudiants de GEM Alpine Business School",
  href: BDE_PAGE,
  icon: "users",
  keywords: "bde bureau",
};

const CARD: SitePage = {
  id: "p-carte",
  title: "Carte cotisante · 30 €",
  context: "De -20 % à -40 % sur tous nos événements",
  href: `${BDE_PAGE}#carte`,
  icon: "ticket",
  keywords: "carte cotisant cotisante cotisation adherent adhesion reduction tarif prix listes well",
};

const SAFETY: SitePage = {
  id: "p-vss",
  title: "Signaler une situation (VSS / VDH)",
  context: "Canal d'alerte confidentiel, aucun compte à créer",
  href: routes.safety,
  icon: "shield",
  tone: "warn",
  keywords:
    "vss vdh violences sexistes sexuelles harcelement discrimination alerte signaler securite aide victime temoin 112 3919",
};

/** Searchable pages. The BDE itself is already in the data index, so it is not repeated here. */
export const SITE_PAGES: SitePage[] = [
  EVENTS,
  CARD,
  SAFETY,
  {
    id: "p-associations",
    title: "Les associations",
    context: "Chaque asso aura sa page, créée par son bureau",
    href: routes.associations,
    icon: "users",
    keywords: "assos associations clubs",
  },
  {
    id: "p-recrutements",
    title: "Recrutements",
    context: "Les campagnes des assos, dès qu'elles ouvrent",
    href: routes.recruitment,
    icon: "megaphone",
    keywords: "recrutement recrute candidature candidater postes rejoindre",
  },
  {
    id: "p-campus",
    title: "Le fil du campus",
    context: "Les articles du bureau et des assos",
    href: routes.campus,
    icon: "file",
    keywords: "fil campus articles actus annonces recaps breves",
  },
  {
    id: "p-espace",
    title: "Mon espace",
    context: "Billets, candidatures, notifications et profil",
    href: routes.account,
    icon: "home",
    keywords: "compte espace profil billets candidatures notifications connexion",
  },
];

/** What the quick search offers before anything is typed. */
export const SEARCH_SHORTCUTS: SitePage[] = [EVENTS, BDE, CARD, SAFETY];

/** Pages whose title, context or keywords hold every word of the query. */
export function matchPages(query: string, pages: SitePage[] = SITE_PAGES): SitePage[] {
  const words = normaliseQuery(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return pages.filter((p) => {
    const haystack = normaliseQuery(`${p.title} ${p.context} ${p.keywords}`);
    return words.every((w) => haystack.includes(w));
  });
}
