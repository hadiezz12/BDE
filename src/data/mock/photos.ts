import type { Photo } from "@/lib/types";

/**
 * Mock photography. Each key is a brief; values are verified Unsplash photos
 * (free Unsplash licence, credited) cropped to a known size so next/image can
 * reserve space. A key left `undefined` makes the UI fall back to a generated
 * poster — the layout must look right either way.
 *
 * Real association photos will replace these through Supabase storage.
 */
export type PhotoKey =
  | "soiree-foule"
  | "soiree-dj"
  | "halloween-costumes"
  | "wei-plein-air"
  | "apero-pelouse"
  | "bar-rue-nuit"
  | "gala-tenue"
  | "concert-scene"
  | "sport-foot"
  | "sport-course"
  | "sport-escalade"
  | "sport-ski"
  | "finance-ecrans"
  | "conference-amphi"
  | "atelier-equipe"
  | "pitch-startup"
  | "theatre-scene"
  | "atelier-photo"
  | "vinyles-dj"
  | "expo-galerie"
  | "oenologie"
  | "danse"
  | "solidarite-collecte"
  | "international-diner"
  | "voyage-gare"
  | "campus-canal"
  | "campus-etudiants"
  | "radio-micro"
  | "ecologie-velo"
  | "ecologie-jardin";

export const photos: Record<PhotoKey, Photo | undefined> = {
  "soiree-foule": {
    src: "https://images.unsplash.com/photo-1751922000953-e43c20148b35?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Foule dense qui danse bras levés dans une boîte de nuit baignée de lumière violette et rose",
    width: 1800,
    height: 1200,
    credit: "Axel Gallay / Unsplash",
  },
  "soiree-dj": {
    src: "https://images.unsplash.com/photo-1730818203797-897b2838105a?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "DJ en silhouette derrière ses platines, devant des arches de néons roses",
    width: 1800,
    height: 1200,
    credit: "Aleksandr Popov / Unsplash",
  },
  "halloween-costumes": {
    src: "https://images.unsplash.com/photo-1604160071440-6a3d97e8c88e?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Couple maquillé en têtes de mort lors d'une soirée d'Halloween, sous une lumière violette",
    width: 1800,
    height: 1200,
    credit: "Irina Krutova / Unsplash",
  },
  "wei-plein-air": {
    src: "https://images.unsplash.com/photo-1520880867055-1e30d1cb001c?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Groupe d'amis en montagne au coucher du soleil, bras ouverts face à la vallée",
    width: 1800,
    height: 1200,
    credit: "Helena Lopes / Unsplash",
  },
  "apero-pelouse": {
    src: "https://images.unsplash.com/photo-1569949380643-6e746ecaa3bd?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Pique-niqueurs sur la pelouse du Champ-de-Mars, au pied de la tour Eiffel sous un ciel rosé",
    width: 1800,
    height: 1200,
    credit: "Il Vagabiondo / Unsplash",
  },
  "bar-rue-nuit": {
    src: "https://images.unsplash.com/photo-1774733505590-779d307830eb?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Boulevard parisien de nuit, terrasses de cafés éclairées sous les arbres",
    width: 1800,
    height: 1200,
    credit: "Bruce Barrow / Unsplash",
  },
  "gala-tenue": {
    src: "https://images.unsplash.com/photo-1768508950790-3bbdfe3973c1?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Invités en tenue de soirée réunis sous des lustres lors d'une réception de gala",
    width: 1800,
    height: 1200,
    credit: "Filip Rankovic Grobgaard / Unsplash",
  },
  "concert-scene": {
    src: "https://images.unsplash.com/photo-1768054182858-2edeccc72e36?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Scène de concert balayée de faisceaux roses et rouges au-dessus de la foule",
    width: 1800,
    height: 1200,
    credit: "Nicolás Flor / Unsplash",
  },
  "sport-foot": {
    src: "https://images.unsplash.com/photo-1431324155629-1a6deb1dec8d?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Match de foot amateur de nuit sur un terrain éclairé par un projecteur",
    width: 1800,
    height: 1200,
    focal: "50% 75%",
    credit: "Abigail Keenan / Unsplash",
  },
  "sport-course": {
    src: "https://images.unsplash.com/photo-1739368732843-800f36a9b7d0?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Groupe de coureurs le long d'un fleuve au coucher du soleil, tours de la ville en arrière-plan",
    width: 1800,
    height: 1200,
    credit: "Joshua Tsu / Unsplash",
  },
  "sport-escalade": {
    src: "https://images.unsplash.com/photo-1689775884353-b01c7a8ad1b2?auto=format&fit=crop&w=1200&h=1500&q=80",
    alt: "Grimpeur sur un mur de bloc aux prises colorées, en salle d'escalade",
    width: 1200,
    height: 1500,
    focal: "50% 60%",
    credit: "Tofan Teodor / Unsplash",
  },
  "sport-ski": {
    src: "https://images.unsplash.com/photo-1664436341001-b02974ae7524?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Skieur dévalant une pente enneigée face au Cervin, dans les Alpes",
    width: 1800,
    height: 1200,
    focal: "30% 50%",
    credit: "Patrick Robert Doyle / Unsplash",
  },
  "finance-ecrans": {
    src: "https://images.unsplash.com/photo-1560221328-12fe60f83ab8?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Gros plan sur un écran affichant des courbes boursières en temps réel",
    width: 1800,
    height: 1200,
    credit: "Nicholas Cappello / Unsplash",
  },
  "conference-amphi": {
    src: "https://images.unsplash.com/photo-1773828755374-0ee802d9f44b?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Intervenant sur scène face à un amphithéâtre comble aux fauteuils rouges",
    width: 1800,
    height: 1200,
    focal: "25% 45%",
    credit: "Marwen Larafa / Unsplash",
  },
  "atelier-equipe": {
    src: "https://images.unsplash.com/photo-1565351167686-7a19c5114965?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Vue du dessus d'une équipe autour d'une table, entre ordinateurs, post-it et affiche en cours",
    width: 1800,
    height: 1200,
    credit: "Van Tay Media / Unsplash",
  },
  "pitch-startup": {
    src: "https://images.unsplash.com/photo-1576085898323-218337e3e43c?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Intervenante qui présente sur scène devant un public attablé, diapositive projetée derrière elle",
    width: 1800,
    height: 1200,
    focal: "35% 60%",
    credit: "charlesdeluvio / Unsplash",
  },
  "theatre-scene": {
    src: "https://images.unsplash.com/photo-1503095396549-807759245b35?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Silhouettes de trois comédiens sur scène devant un rideau rouge",
    width: 1800,
    height: 1200,
    credit: "Kyle Head / Unsplash",
  },
  "atelier-photo": {
    src: "https://images.unsplash.com/photo-1568819107248-c5ebc8b62fad?auto=format&fit=crop&w=1200&h=1500&q=80",
    alt: "Photographe tenant un appareil photo au look argentique, au bord d'un lac",
    width: 1200,
    height: 1500,
    credit: "Alex Azabache / Unsplash",
  },
  "vinyles-dj": {
    src: "https://images.unsplash.com/photo-1634650254521-b1596c5a2d37?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Disque vinyle qui tourne sur une platine, bras de lecture posé",
    width: 1800,
    height: 1200,
    credit: "Andres Valdes / Unsplash",
  },
  "expo-galerie": {
    src: "https://images.unsplash.com/photo-1569783721854-33a99b4c0bae?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Visiteurs devant une grande toile colorée dans une galerie aux murs blancs",
    width: 1800,
    height: 1200,
    credit: "Jessica Pamp / Unsplash",
  },
  oenologie: {
    src: "https://images.unsplash.com/photo-1658993431137-184e9fc2b481?auto=format&fit=crop&w=1200&h=1500&q=80",
    alt: "Verres de vin rouge, rosé et blanc alignés sur une table pour une dégustation",
    width: 1200,
    height: 1500,
    credit: "Makis Panagopoulos / Unsplash",
  },
  danse: {
    src: "https://images.unsplash.com/photo-1787724691124-6d0ad5409b77?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Groupe de danseurs en pleine chorégraphie dans un studio aux murs géométriques",
    width: 1800,
    height: 1200,
    credit: "Vitaly Gariev / Unsplash",
  },
  "solidarite-collecte": {
    src: "https://images.unsplash.com/photo-1599059813005-11265ba4b4ce?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Bénévoles qui trient des conserves et des denrées lors d'une collecte alimentaire",
    width: 1800,
    height: 1200,
    credit: "Joel Muniz / Unsplash",
  },
  "international-diner": {
    src: "https://images.unsplash.com/photo-1721180672486-fe663c31e3a6?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Vue du dessus d'une grande tablée qui partage des plats variés, « bienvenue » écrit en plusieurs langues sur la nappe",
    width: 1800,
    height: 1200,
    credit: "DJ Paine / Unsplash",
  },
  "voyage-gare": {
    src: "https://images.unsplash.com/photo-1697896321319-2bca3f51d105?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Quai de gare sous une verrière, voyageurs qui marchent le long des voies",
    width: 1800,
    height: 1200,
    credit: "Meizhi Lang / Unsplash",
  },
  "campus-canal": {
    src: "https://images.unsplash.com/photo-1749845378384-a31ce7142381?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Bord de canal arboré dans le 19e arrondissement de Paris, promeneurs le long de l'eau",
    width: 1800,
    height: 1200,
    credit: "Antoine Pouligny / Unsplash",
  },
  "campus-etudiants": {
    src: "https://images.unsplash.com/photo-1549057446-9f5c6ac91a04?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Groupe d'étudiants qui marchent en riant le long d'un bâtiment en brique",
    width: 1800,
    height: 1200,
    credit: "Eliott Reyna / Unsplash",
  },
  "radio-micro": {
    src: "https://images.unsplash.com/photo-1688039763740-9036cb5d566e?auto=format&fit=crop&w=1200&h=1500&q=80",
    alt: "Micro de studio sur bras articulé devant des écrans, voyant rouge allumé",
    width: 1200,
    height: 1500,
    credit: "Koen Sweers / Unsplash",
  },
  "ecologie-velo": {
    src: "https://images.unsplash.com/photo-1775138174893-5509b3bd19f6?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Vélos garés le long d'une piste cyclable dans une rue parisienne, de nuit",
    width: 1800,
    height: 1200,
    credit: "Bruce Barrow / Unsplash",
  },
  "ecologie-jardin": {
    src: "https://images.unsplash.com/photo-1788538812851-9aacd4189fa8?auto=format&fit=crop&w=1800&h=1200&q=80",
    alt: "Deux personnes qui jardinent dans un jardin partagé aux bacs en bois",
    width: 1800,
    height: 1200,
    credit: "Zoshua Colah / Unsplash",
  },
};

/** Photos for the given keys, skipping any that are not available. */
export function pick(...keys: PhotoKey[]): Photo[] {
  return keys.map((k) => photos[k]).filter((p): p is Photo => Boolean(p));
}
