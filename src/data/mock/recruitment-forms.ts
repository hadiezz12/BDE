import type { ApplicationFormSpec } from "@/lib/types";

/**
 * The application form of each campaign: what the apply dialog asks beyond
 * the role choice. Mirrors each campaign's `requirements` (what the fiche
 * promises is exactly what the form asks) and the questions already answered
 * in the demo applications (src/data/mock/applications.ts).
 */
export const applicationForms: ApplicationFormSpec[] = [
  {
    campaignId: "c-finance-society-2027",
    secondChoice: true,
    questions: [
      {
        id: "motivation",
        label: "Pourquoi toi, et pourquoi ce pôle ?",
        hint: "Pas de lettre : quelques lignes franches valent mieux qu'une page bien tournée.",
        kind: "long",
        maxLength: 1200,
      },
      {
        id: "projet",
        label: "Un format ou un événement que tu aimerais lancer ?",
        kind: "long",
        optional: true,
        maxLength: 800,
      },
      {
        id: "disponibilites",
        label: "Tes disponibilités pour l'entretien",
        hint: "Par exemple : « mardi après 18h, jeudi midi ». En A-210 ou en visio.",
        kind: "short",
        maxLength: 160,
      },
    ],
    attachments: [
      {
        id: "cv",
        label: "Ton CV",
        hint: "PDF, 10 Mo maximum. On lit d'abord ta motivation.",
        accept: ".pdf,application/pdf",
        optional: true,
      },
    ],
  },
  {
    campaignId: "c-very-pink-club-staff-boo-party",
    questions: [
      {
        id: "shift",
        label: "Ton shift préféré",
        hint: "Les horaires exacts de chaque poste sont dans la fiche.",
        kind: "choice",
        options: ["Le premier, en début de soirée", "Le second, jusqu'à la fermeture", "Peu importe"],
        onlyFor: ["boo-accueil", "boo-vestiaire"],
      },
      {
        id: "telephone",
        label: "Ton numéro de téléphone",
        hint: "Pour le groupe staff du soir, et seulement pour ça.",
        kind: "tel",
      },
      {
        id: "pourquoi-vss",
        label: "Pourquoi veux-tu être référent·e VSS & VDH ?",
        hint: "Quelques lignes. Aucune expérience demandée : la formation de 3 h est là pour ça.",
        kind: "long",
        maxLength: 1000,
        onlyFor: ["boo-referent-vss"],
      },
    ],
    attachments: [],
  },
  {
    campaignId: "c-altitude-capitaines",
    questions: [
      {
        id: "motivation",
        label: "Pourquoi toi comme capitaine ?",
        hint: "Trois lignes suffisent.",
        kind: "long",
        maxLength: 600,
      },
      {
        id: "niveau",
        label: "Ton niveau dans le sport concerné",
        hint: "Honnêtement : un·e capitaine fait tourner le groupe, pas besoin d'être devant.",
        kind: "choice",
        options: ["Je m'y suis mis·e cette année", "Je pratique chaque semaine", "Je fais de la compétition"],
      },
    ],
    attachments: [],
  },
  {
    campaignId: "c-ourcq-fm-rejoins-l-antenne",
    questions: [
      {
        id: "antenne",
        label: "Ce que tu voudrais faire à l'antenne",
        hint: "Une émission, un son, un format de podcast : quelques lignes suffisent.",
        kind: "long",
        maxLength: 1000,
      },
      {
        id: "ecoute",
        label: "Qu'est-ce que tu écoutes, toi ?",
        hint: "Radio, podcasts, playlists : ça nous aide à te situer.",
        kind: "short",
        optional: true,
        maxLength: 200,
      },
    ],
    attachments: [
      {
        id: "demo",
        label: "Ta démo audio (1 minute)",
        hint: "Enregistrée au téléphone, c'est parfait : on écoute la voix, pas le matériel. 10 Mo maximum.",
        accept: "audio/*,.m4a,.mp3,.wav",
        onlyFor: ["ofm-animation"],
      },
    ],
  },
  {
    campaignId: "c-solidarite-ourcq-responsables-antenne",
    questions: [
      {
        id: "experience",
        label: "Ton expérience bénévole",
        hint: "Même si c'est la première fois : dis-nous ce qui te donne envie.",
        kind: "long",
        maxLength: 1000,
      },
      {
        id: "disponibilites",
        label: "Tes disponibilités",
        hint: "Par exemple : « mercredi après-midi, un samedi sur deux ».",
        kind: "short",
        maxLength: 160,
      },
    ],
    attachments: [],
  },
  {
    campaignId: "c-pantin-conseil-2027",
    questions: [
      { id: "motivation", label: "Pourquoi Pantin Conseil ?", kind: "long", maxLength: 1200 },
      {
        id: "mission",
        label: "Une mission que tu aimerais aller chercher ?",
        kind: "long",
        optional: true,
        maxLength: 800,
      },
      {
        id: "disponibilites",
        label: "Tes disponibilités pour le cas pratique et l'entretien",
        kind: "short",
        maxLength: 160,
      },
    ],
    attachments: [{ id: "cv", label: "Ton CV", hint: "PDF, 10 Mo maximum.", accept: ".pdf,application/pdf" }],
  },
  {
    campaignId: "c-atelier-93-mi-annee",
    questions: [{ id: "motivation", label: "Quelques lignes de motivation", kind: "long", maxLength: 1000 }],
    attachments: [
      {
        id: "portfolio",
        label: "Ton portfolio",
        hint: "PDF de 10 Mo maximum, ou colle un lien dans ta motivation.",
        accept: ".pdf,application/pdf",
        optional: true,
        onlyFor: ["a93-photographe"],
      },
    ],
  },
];
