import type { Applicant, ApplicationSummary } from "@/lib/types";
import { ago, at } from "./clock";

/** Inès's applications, as she sees them in /account/applications. */
export const applications: ApplicationSummary[] = [
  {
    id: "app-finance-society-communication",
    userId: "u-ines",
    campaignId: "c-finance-society-2027",
    positionId: "fs-communication",
    status: "en-revue",
    createdAt: ago(4, "21:15"),
    submittedAt: ago(2, "22:47"),
    updatedAt: ago(1, "10:20"),
    timeline: [
      { status: "brouillon", at: ago(4, "21:15") },
      { status: "envoyee", at: ago(2, "22:47"), note: "Candidature envoyée. Un accusé de réception est parti sur ta boîte mail." },
      {
        status: "en-revue",
        at: ago(1, "10:20"),
        note: "Clara et Nathan lisent les candidatures du pôle communication. Les entretiens sont proposés juste après la clôture.",
      },
    ],
    answers: [
      {
        question: "Pourquoi le pôle communication ?",
        answer:
          "Je fais déjà une chronique sport sur Ourcq FM, donc écrire court et rendre à l'heure, je connais. Ce qui m'a frappée l'an dernier, c'est que vos masterclasses sont très bonnes mais que personne ne le sait avant d'y être allé : à la masterclass private equity de mars, on était une quarantaine pour 120 places. C'est ça que j'ai envie de régler.",
      },
      {
        question: "Un format ou une campagne que tu aimerais lancer ?",
        answer:
          "Des carrousels LinkedIn où un·e ancien·ne raconte son premier deal en cinq slides : ce qu'il ou elle faisait à 23h, ce qu'il ou elle aurait aimé savoir. Ça se lit dans le métro et ça donne envie de venir poser des questions en vrai. J'en ai maquetté deux, ils sont en pièce jointe.",
      },
      {
        question: "Tes disponibilités",
        answer: "Lundi et jeudi après 17h, et le mercredi après-midi. Pas d'échange prévu cette année, je suis sur le campus jusqu'en juin.",
      },
    ],
    attachments: [
      { name: "CV_Ines_Belkacem.pdf", sizeKb: 184 },
      { name: "Maquettes_carrousels_LinkedIn.pdf", sizeKb: 2310 },
    ],
  },
  {
    id: "app-ourcq-fm-animation",
    userId: "u-ines",
    campaignId: "c-ourcq-fm-rejoins-l-antenne",
    positionId: "ofm-animation",
    status: "entretien",
    createdAt: ago(4, "13:05"),
    submittedAt: ago(3, "18:30"),
    updatedAt: ago(1, "17:45"),
    nextStep: { label: "Entretien avec l'équipe", date: at(3, "18:00"), location: "Studio Ourcq FM, B-14" },
    timeline: [
      { status: "brouillon", at: ago(4, "13:05") },
      { status: "envoyee", at: ago(3, "18:30"), note: "Candidature et démo audio reçues." },
      { status: "en-revue", at: ago(2, "11:00"), note: "Sacha a écouté ta démo." },
      {
        status: "entretien",
        at: ago(1, "17:45"),
        note: "Entretien calé au studio B-14. Prévois 30 minutes, dont 5 minutes d'essai micro. Comme tu es déjà chroniqueuse, on passe direct à l'essai.",
      },
    ],
    answers: [
      {
        question: "Quelle émission voudrais-tu animer ?",
        answer:
          "Une matinale courte, 30 minutes avant le premier cours : l'agenda du jour sur le campus, une asso invitée, et deux morceaux choisis par l'invité·e. Je fais la chronique sport depuis septembre et j'ai envie de passer de quatre minutes à une vraie émission.",
      },
      {
        question: "Qu'est-ce que tu écoutes, toi ?",
        answer:
          "Beaucoup de matinales, surtout pour le rythme : une info, une vanne, on passe à la suite. Et des podcasts d'interviews de sportifs et sportives, pour la façon dont l'animateur relance quand l'invité répond en trois mots.",
      },
      {
        question: "Ta démo (1 minute)",
        answer: "En pièce jointe : un faux lancement de matinale avec l'agenda du jour et la météo du canal.",
      },
    ],
    attachments: [{ name: "Demo_matinale_Ines.m4a", sizeKb: 1460 }],
  },
  {
    id: "app-pantin-conseil-charge-affaires",
    userId: "u-ines",
    campaignId: "c-pantin-conseil-2027",
    positionId: "pc-charge-affaires",
    status: "brouillon",
    createdAt: ago(1, "22:30"),
    updatedAt: ago(1, "23:10"),
    timeline: [
      {
        status: "brouillon",
        at: ago(1, "22:30"),
        note: "Brouillon enregistré. Tu pourras l'envoyer dès l'ouverture du recrutement.",
      },
    ],
    answers: [
      {
        question: "Pourquoi Pantin Conseil ?",
        answer:
          "J'ai fait mon stage de 1A dans une PME de Montreuil qui avait besoin d'une étude de marché et n'avait pas le budget d'un cabinet. Je veux être de l'autre côté : aller chercher ces entreprises et monter des missions qui leur servent vraiment.",
      },
      {
        question: "Une mission que tu aimerais aller chercher ?",
        answer: "À finir après le Forum des missions : piste d'une étude de prix pour les commerces du quai de l'Ourcq.",
      },
    ],
    attachments: [{ name: "CV_Ines_Belkacem.pdf", sizeKb: 184 }],
  },
  {
    id: "app-atelier-93-photographe",
    userId: "u-ines",
    campaignId: "c-atelier-93-mi-annee",
    positionId: "a93-photographe",
    status: "refusee",
    createdAt: ago(16, "20:05"),
    submittedAt: ago(15, "19:40"),
    updatedAt: ago(1, "12:30"),
    timeline: [
      { status: "brouillon", at: ago(16, "20:05") },
      { status: "envoyee", at: ago(15, "19:40"), note: "Candidature et portfolio reçus." },
      { status: "en-revue", at: ago(11, "10:00") },
      {
        status: "refusee",
        at: ago(1, "12:30"),
        note: "« On a reçu 11 candidatures pour 2 places, et la tienne faisait partie des dernières qu'on a départagées. Tes photos du five sous la pluie sont vraiment bien. Viens à l'atelier argentique en attendant, et retente en septembre. » Jade, pour Atelier 93",
      },
    ],
    answers: [
      {
        question: "Montre-nous trois photos dont tu es fière ou fier",
        answer:
          "Dans le portfolio : le five d'Altitude sous la pluie, le départ du run du canal à 10h, et ma grand-mère au marché de Belleville. Toutes prises au téléphone, je n'ai pas encore d'appareil.",
      },
      {
        question: "Tu as déjà fait de l'argentique ?",
        answer: "Jamais, et c'est justement pour ça que je candidate : je veux apprendre avec des gens qui savent.",
      },
    ],
    attachments: [{ name: "Portfolio_Ines_Belkacem.pdf", sizeKb: 5820 }],
  },
];

/** Management view: who applied to the campaigns Yanis manages. */
export const applicants: Applicant[] = [
  /* Staff BOO Party (Very Pink Club) — 14 candidatures */
  { id: "apl-boo-01", campaignId: "c-very-pink-club-staff-boo-party", positionId: "boo-accueil", name: "Louise Bernard", programme: "PGE 1A", submittedAt: ago(6, "14:10"), status: "acceptee" },
  { id: "apl-boo-02", campaignId: "c-very-pink-club-staff-boo-party", positionId: "boo-accueil", name: "Théo Chevalier", programme: "Bachelor 2", submittedAt: ago(6, "18:42"), status: "acceptee" },
  { id: "apl-boo-03", campaignId: "c-very-pink-club-staff-boo-party", positionId: "boo-referent-vss", name: "Sarah Cohen", programme: "PGE 2A", submittedAt: ago(5, "09:15"), status: "entretien" },
  { id: "apl-boo-04", campaignId: "c-very-pink-club-staff-boo-party", positionId: "boo-referent-vss", name: "Yasmine El Amrani", programme: "MSc 1", submittedAt: ago(5, "21:30"), status: "en-revue" },
  { id: "apl-boo-05", campaignId: "c-very-pink-club-staff-boo-party", positionId: "boo-vestiaire", name: "Anaïs Perrin", programme: "PGE 1A", submittedAt: ago(5, "12:05"), status: "en-revue" },
  { id: "apl-boo-06", campaignId: "c-very-pink-club-staff-boo-party", positionId: "boo-accueil", name: "Victor Blanchard", programme: "Bachelor 1", submittedAt: ago(4, "23:50"), status: "refusee" },
  { id: "apl-boo-07", campaignId: "c-very-pink-club-staff-boo-party", positionId: "boo-accueil", name: "Romain Gauthier", programme: "PGE 2A", submittedAt: ago(4, "10:30"), status: "en-revue" },
  { id: "apl-boo-08", campaignId: "c-very-pink-club-staff-boo-party", positionId: "boo-vestiaire", name: "Élise Vidal", programme: "Bachelor 3", submittedAt: ago(3, "16:20"), status: "envoyee" },
  { id: "apl-boo-09", campaignId: "c-very-pink-club-staff-boo-party", positionId: "boo-accueil", name: "Mohamed Cissé", programme: "PGE 1A", submittedAt: ago(3, "19:05"), status: "envoyee" },
  { id: "apl-boo-10", campaignId: "c-very-pink-club-staff-boo-party", positionId: "boo-accueil", name: "Ana Ferreira", programme: "MSc 1 (échange)", submittedAt: ago(2, "11:45"), status: "envoyee" },
  { id: "apl-boo-11", campaignId: "c-very-pink-club-staff-boo-party", positionId: "boo-referent-vss", name: "Bilal Ouali", programme: "PGE 3A", submittedAt: ago(2, "20:15"), status: "envoyee" },
  { id: "apl-boo-12", campaignId: "c-very-pink-club-staff-boo-party", positionId: "boo-vestiaire", name: "Clémence Aubert", programme: "Bachelor 2", submittedAt: ago(1, "13:30"), status: "envoyee" },
  { id: "apl-boo-13", campaignId: "c-very-pink-club-staff-boo-party", positionId: "boo-accueil", name: "Noah Lemoine", programme: "PGE 1A", submittedAt: ago(1, "22:10"), status: "envoyee" },
  { id: "apl-boo-14", campaignId: "c-very-pink-club-staff-boo-party", positionId: "boo-referent-vss", name: "Chiara Conti", programme: "MSc 2", submittedAt: ago(1, "23:55"), status: "envoyee" },

  /* Rejoins l'antenne (Ourcq FM) */
  { id: "apl-ofm-01", campaignId: "c-ourcq-fm-rejoins-l-antenne", positionId: "ofm-animation", name: "Inès Belkacem", programme: "PGE 2A", submittedAt: ago(3, "18:30"), status: "entretien" },
  { id: "apl-ofm-02", campaignId: "c-ourcq-fm-rejoins-l-antenne", positionId: "ofm-animation", name: "Jules Renard", programme: "Bachelor 2", submittedAt: ago(3, "22:05"), status: "en-revue" },
  { id: "apl-ofm-03", campaignId: "c-ourcq-fm-rejoins-l-antenne", positionId: "ofm-podcast", name: "Ilyes Hamdi", programme: "Bachelor 3", submittedAt: ago(2, "09:10"), status: "acceptee" },
  { id: "apl-ofm-04", campaignId: "c-ourcq-fm-rejoins-l-antenne", positionId: "ofm-realisation", name: "Mathilde Guérin", programme: "PGE 1A", submittedAt: ago(2, "14:20"), status: "envoyee" },
  { id: "apl-ofm-05", campaignId: "c-ourcq-fm-rejoins-l-antenne", positionId: "ofm-animation", name: "Hana Kobayashi", programme: "Échange (Osaka)", submittedAt: ago(1, "16:00"), status: "en-revue" },
];
