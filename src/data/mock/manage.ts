import type { ManageTask, MediaAsset } from "@/lib/types";
import { ago, at } from "./clock";
import { type PhotoKey, photos } from "./photos";

export const tasks: ManageTask[] = [
  /* ---- Very Pink Club ------------------------------------------------- */
  {
    id: "t-vpc-trier-staff-boo",
    associationId: "a-very-pink-club",
    label: "Trier les 14 candidatures staff BOO Party",
    detail: "7 pas encore ouvertes, 3 en revue, et l'appel VSS de Sarah Cohen à caler avant la formation.",
    due: at(2, "20:00"),
    href: "/manage/very-pink-club/recruitment",
    priority: "haute",
  },
  {
    id: "t-vpc-confirmer-referents-vss",
    associationId: "a-very-pink-club",
    label: "Confirmer le nombre de référent·es VSS",
    detail: "La Machine veut le chiffre final pour les badges. Objectif 12 sur la nuit : 8 déjà formé·es au bureau, 4 places dans la campagne staff.",
    due: at(8, "18:00"),
    href: "/manage/very-pink-club/recruitment",
    priority: "haute",
  },
  {
    id: "t-vpc-plan-acces-machine",
    associationId: "a-very-pink-club",
    label: "Ajouter le plan d'accès de la Machine",
    detail: "La salle a envoyé le PDF. À mettre dans les infos pratiques de la BOO Party avant l'envoi des billets.",
    due: at(5, "12:00"),
    href: "/manage/very-pink-club/events",
    priority: "normale",
  },
  {
    id: "t-vpc-publier-recap-wei",
    associationId: "a-very-pink-club",
    label: "Publier le récap photo du WEI",
    detail: "Le brouillon de Chloé est prêt depuis 4 jours. Il manque les crédits photo et le lien vers l'album.",
    due: at(1, "18:00"),
    href: "/manage/very-pink-club/content",
    priority: "normale",
  },
  {
    id: "t-vpc-relancer-bus-well",
    associationId: "a-very-pink-club",
    label: "Relancer le partenaire bus du WELL",
    detail: "Devis pour 5 cars reçu, toujours pas de confirmation écrite. Sans elle, on ne peut pas ouvrir les inscriptions.",
    due: at(4, "12:00"),
    href: "/manage/very-pink-club/events",
    priority: "normale",
  },

  /* ---- Ourcq FM ------------------------------------------------------- */
  {
    id: "t-ofm-entretiens-animation",
    associationId: "a-ourcq-fm",
    label: "Caler les 2 derniers entretiens animation",
    detail: "Jules Renard et Hana Kobayashi attendent un créneau. Celui d'Inès Belkacem est déjà calé.",
    due: at(2, "18:00"),
    href: "/manage/ourcq-fm/recruitment",
    priority: "haute",
  },
  {
    id: "t-ofm-conducteur-live-listes",
    associationId: "a-ourcq-fm",
    label: "Envoyer le conducteur du Live spécial listes",
    detail: "Aux deux listes, 48 h avant au plus tard : ordre de passage, temps de parole, thèmes.",
    due: at(6, "19:00"),
    href: "/manage/ourcq-fm/events",
    priority: "normale",
  },
  {
    id: "t-ofm-photo-couverture",
    associationId: "a-ourcq-fm",
    label: "Changer la photo de couverture",
    detail: "Celle d'aujourd'hui date d'avant les travaux du studio.",
    href: "/manage/ourcq-fm/media",
    priority: "normale",
  },
];

const EMBLEM_SIZE = 154;

function emblemAsset(file: string, name: string, usedIn: string, uploadedAt: string): MediaAsset {
  return {
    id: `m-vpc-emblem-${file}`,
    associationId: "a-very-pink-club",
    photo: { src: `/brand/events/${file}.png`, alt: `Emblème néon ${name}`, width: EMBLEM_SIZE, height: EMBLEM_SIZE },
    uploadedAt,
    uploadedBy: "Chloé Fabre",
    usedIn,
  };
}

/** Photo assets only exist when the photo key has been filled in photos.ts. */
function photoAsset(
  id: string,
  associationId: string,
  key: PhotoKey,
  uploadedAt: string,
  uploadedBy: string,
  usedIn?: string,
): MediaAsset[] {
  const photo = photos[key];
  return photo ? [{ id, associationId, photo, uploadedAt, uploadedBy, usedIn }] : [];
}

export const mediaAssets: MediaAsset[] = [
  /* ---- Very Pink Club: logo and the eight event emblems -------------- */
  {
    id: "m-vpc-logo",
    associationId: "a-very-pink-club",
    photo: { src: "/brand/vpc-badge.png", alt: "Logo du Very Pink Club", width: 406, height: 404 },
    uploadedAt: ago(140, "14:00"),
    uploadedBy: "Chloé Fabre",
    usedIn: "Logo de l'association",
  },
  emblemAsset("wei", "du WEI", "Événement : WEI 2026", ago(120, "11:20")),
  emblemAsset("boo-party", "de la BOO Party", "Événement : BOO Party", ago(120, "11:21")),
  emblemAsset("well", "du WELL", "Événement : WELL", ago(120, "11:22")),
  emblemAsset("rose-rain", "de Rose Rain", "Événement : Rose Rain", ago(120, "11:23")),
  emblemAsset("desintegration", "de la Soirée de Désintégration", "Événement : La Soirée de Désintégration", ago(120, "11:24")),
  emblemAsset("apero-attack", "de l'Apéro Attack", "Événement : Apéro Attack", ago(120, "11:25")),
  emblemAsset("barathons", "des Barathons", "Événements : Barathon #2, Barathon #3", ago(120, "11:26")),
  emblemAsset("campagne-des-listes", "de la Campagne des listes", "Événement : Campagne des listes", ago(120, "11:27")),

  /* ---- Very Pink Club: photos ---------------------------------------- */
  ...photoAsset("m-vpc-soiree-foule", "a-very-pink-club", "soiree-foule", ago(95, "10:00"), "Chloé Fabre", "Couverture de l'association"),
  ...photoAsset("m-vpc-halloween", "a-very-pink-club", "halloween-costumes", ago(30, "18:30"), "Chloé Fabre", "Événement : BOO Party"),
  ...photoAsset("m-vpc-bar-rue", "a-very-pink-club", "bar-rue-nuit", ago(21, "16:45"), "Yanis Haddad", "Événements : Barathon #2, Barathon #3"),
  ...photoAsset("m-vpc-wei", "a-very-pink-club", "wei-plein-air", ago(23, "09:15"), "Chloé Fabre", "Événement : WEI 2026 · Article : récap du WEI"),
  ...photoAsset("m-vpc-soiree-dj", "a-very-pink-club", "soiree-dj", ago(60, "12:00"), "Chloé Fabre", "Événement : Rose Rain"),
  ...photoAsset("m-vpc-apero", "a-very-pink-club", "apero-pelouse", ago(60, "12:05"), "Chloé Fabre", "Événement : Apéro Attack"),
  ...photoAsset("m-vpc-concert", "a-very-pink-club", "concert-scene", ago(60, "12:10"), "Chloé Fabre", "Événement : La Soirée de Désintégration"),
  ...photoAsset("m-vpc-campus", "a-very-pink-club", "campus-etudiants", ago(20, "08:00"), "Zoé Laurent", "Événement : Campagne des listes"),
  ...photoAsset("m-vpc-canal", "a-very-pink-club", "campus-canal", ago(6, "17:20"), "Yanis Haddad", "Événement : Afterwork des alternant·es (programmé)"),
  ...photoAsset("m-vpc-vinyles", "a-very-pink-club", "vinyles-dj", ago(2, "22:40"), "Yanis Haddad"),

  /* ---- Ourcq FM ------------------------------------------------------- */
  ...photoAsset("m-ofm-micro", "a-ourcq-fm", "radio-micro", ago(400, "15:00"), "Sacha Lévy", "Couverture de l'association"),
  ...photoAsset("m-ofm-vinyles", "a-ourcq-fm", "vinyles-dj", ago(180, "19:30"), "Diego Herrera", "Galerie"),
  ...photoAsset("m-ofm-concert", "a-ourcq-fm", "concert-scene", ago(26, "23:50"), "Lou Besson", "Galerie"),
  ...photoAsset("m-ofm-campus", "a-ourcq-fm", "campus-etudiants", ago(3, "12:15"), "Yanis Haddad"),
];
