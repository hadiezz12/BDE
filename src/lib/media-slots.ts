/**
 * Named image placements across the site. Each MediaFrame that renders one of
 * these sets data-media-slot, so a designer can find it in the DOM, and this
 * table says what to produce for it (photography or generated campaign art).
 * Every slot already has a designed fallback — none of them is required.
 */
export const MEDIA_SLOTS = {
  "home-hero": {
    where: "Accueil — visuel d'ouverture à droite du titre",
    ratio: "4/5",
    minSize: "1600×2000",
    brief: "Visuel de campagne du moment (soirée à venir, rentrée…). Sujet centré, fond sombre, bords libres pour le texte.",
    motion: "Boucle vidéo courte possible (≤ 6 s, muette, < 2 Mo) avec affiche fixe en repli.",
  },
  "home-feature": {
    where: "Accueil — grand bandeau éditorial / campagne",
    ratio: "21/9",
    minSize: "2400×1030",
    brief: "Annonce majeure du BDE (gala, carte, élections). Laisser le tiers gauche calme pour le titre.",
  },
  "event-cover": {
    where: "Carte et page événement",
    ratio: "3/2",
    minSize: "1800×1200",
    brief: "Photo de l'édition précédente ou affiche officielle. Éviter le texte incrusté (le site l'écrit).",
  },
  "event-hero": {
    where: "Page événement — en-tête plein écran",
    ratio: "16/9",
    minSize: "2400×1350",
    brief: "Ambiance de l'événement. Sujet dans la moitié droite sur desktop.",
  },
  "association-cover": {
    where: "Profil d'association — en-tête",
    ratio: "21/9",
    minSize: "2400×1030",
    brief: "Photo d'équipe ou d'activité. Les bords sont rognés sur mobile (4/5).",
  },
  "association-tile": {
    where: "Index des associations — tuiles visuelles",
    ratio: "4/5",
    minSize: "1200×1500",
    brief: "Activité phare de l'association, cadrage vertical.",
  },
  "campaign-cover": {
    where: "Page de recrutement — visuel de campagne",
    ratio: "3/2",
    minSize: "1800×1200",
    brief: "L'équipe actuelle au travail. Rassurant, pas de mise en scène corporate.",
  },
  "post-cover": {
    where: "Campus — article à la une et vignettes",
    ratio: "3/2",
    minSize: "1800×1200",
    brief: "Photo de reportage. Le premier article du fil l'affiche en très grand.",
  },
  gallery: {
    where: "Galeries (association, événement passé)",
    ratio: "variable",
    minSize: "1600 px côté long",
    brief: "Formats mixtes acceptés : la grille alterne paysage et portrait.",
  },
} as const;

export type MediaSlot = keyof typeof MEDIA_SLOTS;
