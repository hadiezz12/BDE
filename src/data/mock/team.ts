import type { AssociationMember, TeamInvite } from "@/lib/types";
import { ago } from "./clock";

/**
 * Management side of a team: the people who help an association without
 * sitting on its bureau, and bureau invitations not accepted yet. The bureau
 * itself is Association.team. Shown in /manage/[asso]/team only.
 */
export const associationMembers: AssociationMember[] = [
  /* ---- Very Pink Club: staff de soirée et coups de main --------------- */
  {
    id: "mb-vpc-camille-petit",
    associationId: "a-very-pink-club",
    name: "Camille Petit",
    role: "Cheffe de groupe barathons",
    promo: "PGE 2A",
    since: ago(330, "19:00"),
  },
  {
    id: "mb-vpc-bastien-leroy",
    associationId: "a-very-pink-club",
    name: "Bastien Leroy",
    role: "Logistique cars, WEI et WELL",
    promo: "PGE 3A",
    since: ago(400, "18:30"),
  },
  {
    id: "mb-vpc-sofia-almeida",
    associationId: "a-very-pink-club",
    name: "Sofia Almeida",
    role: "Staff accueil",
    promo: "Bachelor 3",
    since: ago(380, "12:30"),
  },
  {
    id: "mb-vpc-hugo-moreau",
    associationId: "a-very-pink-club",
    name: "Hugo Moreau",
    role: "Staff soirées",
    promo: "Bachelor 2",
    since: ago(300, "20:00"),
  },
  {
    id: "mb-vpc-nina-rossi",
    associationId: "a-very-pink-club",
    name: "Nina Rossi",
    role: "Billetterie et caisse",
    promo: "MSc 1",
    since: ago(45, "13:00"),
  },
  {
    id: "mb-vpc-maxime-girard",
    associationId: "a-very-pink-club",
    name: "Maxime Girard",
    role: "Photo et vidéo",
    promo: "PGE 1A",
    since: ago(30, "17:45"),
  },

  /* ---- Ourcq FM: l'antenne ------------------------------------------- */
  {
    id: "mb-ofm-theo-garnier",
    associationId: "a-ourcq-fm",
    name: "Théo Garnier",
    role: "Animateur de la matinale",
    promo: "PGE 1A",
    since: ago(190, "18:00"),
  },
  {
    id: "mb-ofm-aya-diallo",
    associationId: "a-ourcq-fm",
    name: "Aya Diallo",
    role: "Montage podcast",
    promo: "MSc 1",
    since: ago(42, "18:00"),
  },
  {
    id: "mb-ofm-ines-belkacem",
    associationId: "a-ourcq-fm",
    name: "Inès Belkacem",
    role: "Chroniqueuse",
    promo: "PGE 2A",
    since: ago(28, "18:00"),
  },
  {
    id: "mb-ofm-romane-caron",
    associationId: "a-ourcq-fm",
    name: "Romane Caron",
    role: "Chroniqueuse cinéma",
    promo: "Bachelor 1",
    since: ago(21, "18:00"),
  },
];

export const teamInvites: TeamInvite[] = [
  {
    id: "inv-vpc-bastien-leroy",
    associationId: "a-very-pink-club",
    email: "bastien.leroy@gem.exemple.fr",
    role: "Respo logistique",
    sentAt: ago(2, "19:10"),
    sentBy: "Léa Marchand",
  },
];
