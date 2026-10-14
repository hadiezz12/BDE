import type { RecruitmentCampaign } from "@/lib/types";
import { ago, at } from "./clock";
import { photos } from "./photos";

/**
 * Stored statuses match the clock at offset 0; the data layer recomputes
 * them live from opensAt / closesAt anyway.
 */
export const campaigns: RecruitmentCampaign[] = [
  {
    id: "c-finance-society-2027",
    slug: "finance-society-2027",
    associationId: "a-finance-society",
    title: "Recrutement 2027",
    intro:
      "On renouvelle la moitié du bureau pour 2027. Quatre pôles cherchent du monde, et aucun ne demande de savoir déjà faire un DCF : on demande de la rigueur, du temps, et l'envie de monter des événements que les recruteurs viennent voir.",
    opensAt: ago(9, "09:00"),
    closesAt: at(5, "23:59"),
    status: "ouverte",
    positions: [
      {
        id: "fs-tresorerie",
        title: "Trésorier·e",
        team: "Bureau",
        seats: 1,
        summary:
          "Tu tiens les comptes d'une asso qui fait circuler environ 18 000 € par an entre cotisations, sponsoring et billetterie des événements.",
        missions: [
          "Tenir la comptabilité sur le tableur partagé et rapprocher le compte bancaire chaque mois.",
          "Construire le budget de chaque événement avec le pôle concerné et le valider avant tout engagement.",
          "Facturer les partenaires et relancer les paiements en retard.",
          "Rembourser les avances des membres sous 15 jours.",
          "Présenter les comptes à l'assemblée générale de juin.",
        ],
        expectations: [
          "À l'aise avec Excel : les tableaux croisés dynamiques, pas besoin de VBA.",
          "Fiable sur les délais : un remboursement promis est un remboursement fait.",
          "Disponible jusqu'en juin, y compris pendant les partiels de janvier, quand tombent les factures.",
        ],
        commitment: "3 h par semaine, plus une demi-journée pour la clôture de fin de mois.",
      },
      {
        id: "fs-communication",
        title: "Communication",
        team: "Pôle communication",
        seats: 2,
        summary:
          "Tu fais exister les masterclasses avant, pendant et après : visuels, posts LinkedIn, newsletter et couverture des événements.",
        missions: [
          "Créer les visuels des événements à partir de la charte de l'asso.",
          "Rédiger et programmer les posts LinkedIn et Instagram.",
          "Écrire la newsletter mensuelle (environ 900 abonné·es).",
          "Couvrir les masterclasses en photo et en stories.",
          "Tenir à jour la page de l'asso sur Very Pink Club.",
        ],
        expectations: [
          "Une plume claire, sans jargon inutile.",
          "Des bases en design, ou l'envie de les apprendre vite.",
          "Le sens du calendrier : un visuel sort 10 jours avant l'événement, pas la veille.",
        ],
        commitment: "2 à 3 h par semaine, plus les soirs d'événement.",
      },
      {
        id: "fs-evenements",
        title: "Événements",
        team: "Pôle événements",
        seats: 2,
        summary:
          "Tu organises les masterclasses, le Trading Game et le dîner des anciens, du premier mail à l'intervenant·e jusqu'au rangement de l'amphi.",
        missions: [
          "Démarcher des intervenant·es (banques, fonds, boutiques M&A) et caler les dates.",
          "Réserver les salles auprès de la vie étudiante et gérer les inscriptions.",
          "Préparer le déroulé et accueillir les invité·es le soir même.",
          "Faire le bilan de chaque événement : présence, retours, coûts.",
        ],
        expectations: [
          "Organisé·e, avec un agenda vraiment tenu.",
          "À l'aise pour écrire à des professionnel·les et relancer poliment.",
          "Présent·e aux événements que tu organises, environ deux par mois.",
        ],
        commitment: "3 h par semaine, plus les soirs d'événement.",
      },
      {
        id: "fs-partenariats",
        title: "Partenariats & sponsoring",
        team: "Pôle partenariats",
        seats: 1,
        summary:
          "Tu fais vivre les partenariats avec les banques et cabinets qui financent une bonne partie de l'année, et tu en ouvres de nouveaux.",
        missions: [
          "Suivre les six partenaires actuels : contreparties, logos, invitations.",
          "Préparer la plaquette partenaires 2027 avec le pôle communication.",
          "Démarcher au moins trois nouvelles structures d'ici mars.",
          "Négocier les contreparties et rédiger les conventions avec la trésorerie.",
        ],
        expectations: [
          "Aisance à l'écrit et à l'oral, y compris face à des professionnel·les seniors.",
          "De la persévérance : la moitié des mails restent sans réponse.",
          "Un intérêt réel pour la finance, pour savoir de quoi tu parles.",
        ],
        commitment: "2 à 3 h par semaine, avec des pics en janvier et en mars.",
      },
    ],
    process: [
      {
        label: "Candidature en ligne",
        detail: "Un formulaire de 10 minutes : poste visé, quelques lignes de motivation, tes disponibilités.",
        date: at(5, "23:59"),
      },
      {
        label: "Entretien de 20 min",
        detail: "Avec deux membres du bureau, en A-210 ou en visio. Pas de question technique : on parle de toi et du poste.",
        date: at(7, "18:00"),
      },
      {
        label: "Réponse sous 72 h",
        detail: "Par mail, que ce soit oui ou non. Si c'est non, on t'explique pourquoi.",
        date: at(10, "18:00"),
      },
      {
        label: "Passation",
        detail: "Une soirée avec l'ancien bureau pour récupérer les accès, les fichiers et les contacts.",
        date: at(14, "19:00"),
      },
    ],
    requirements: [
      "Le poste visé (tu peux en indiquer deux, par ordre de préférence).",
      "Quelques lignes de motivation : pas de lettre, on veut savoir pourquoi toi et pourquoi ce pôle.",
      "Tes disponibilités pour l'entretien.",
      "CV facultatif.",
    ],
    faq: [
      {
        question: "Faut-il être en majeure finance pour candidater ?",
        answer:
          "Non. Un tiers du bureau actuel vient du Bachelor ou du PGE sans majeure finance. Pour la trésorerie, il faut surtout aimer les tableurs.",
      },
      {
        question: "Je suis en 1A, ça vaut le coup ?",
        answer: "Oui, c'est même le meilleur moment : tu as deux ans devant toi pour prendre des responsabilités dans l'asso.",
      },
      {
        question: "Je pars en échange au semestre 2, je peux candidater ?",
        answer:
          "Pour la communication et les partenariats, oui : une partie se fait à distance. Pour la trésorerie et les événements, il faut être sur le campus jusqu'en juin.",
      },
      {
        question: "Je peux cumuler avec une autre asso ?",
        answer: "Oui, la moitié du bureau le fait. Dis-le simplement en entretien, pour qu'on cale la charge ensemble.",
      },
    ],
    cover: photos["finance-ecrans"],
    contact: { name: "Nathan Rousseau", role: "Président", email: "finance-society@asso.gem.exemple.fr" },
  },
  {
    id: "c-very-pink-club-staff-boo-party",
    slug: "very-pink-club-staff-boo-party",
    associationId: "a-very-pink-club",
    title: "Staff BOO Party",
    intro:
      "La BOO Party, c'est 900 personnes, six heures de soirée et 22 staffs qui font que tout se passe bien. Un shift de 3 h, ta place offerte, un t-shirt rose et le meilleur point de vue sur la soirée.",
    opensAt: ago(6, "12:00"),
    closesAt: at(10, "23:59"),
    status: "ouverte",
    positions: [
      {
        id: "boo-accueil",
        title: "Staff accueil",
        team: "Accueil & contrôle",
        seats: 12,
        summary:
          "Tu scannes les billets, vérifies les pièces d'identité et les costumes : tu es le premier visage de la soirée.",
        missions: [
          "Scanner les billets et vérifier la pièce d'identité qui va avec.",
          "Appliquer la règle du déguisement, avec le sourire et sans exception.",
          "Orienter vers le vestiaire, la safe zone et les sorties.",
          "Remonter tout souci au ou à la responsable de shift par le canal radio.",
        ],
        expectations: [
          "Avoir 18 ans le soir de l'événement.",
          "Être à l'aise pour dire non poliment.",
          "Être là au brief de 21h30, sur place.",
        ],
        commitment: "Un shift de 3 h 30 : 22h-1h30 (entrées) ou 1h30-5h (sorties et accompagnement), plus le brief.",
      },
      {
        id: "boo-vestiaire",
        title: "Staff vestiaire",
        team: "Vestiaire",
        seats: 6,
        summary:
          "Tu tiens le vestiaire à 2 €, le poste le plus rush de la soirée entre 23h30 et 1h, puis entre 4h et 5h.",
        missions: [
          "Prendre les affaires, remettre les tickets et encaisser (CB ou espèces).",
          "Garder le vestiaire rangé par numéro, sinon la sortie devient un enfer.",
          "Gérer les objets trouvés et les remettre au BDE le lendemain.",
        ],
        expectations: [
          "Organisé·e et calme sous pression.",
          "Savoir utiliser un terminal de paiement (on te montre en 5 minutes).",
          "Rester jusqu'à la fermeture si tu prends le second shift.",
        ],
        commitment: "Un shift de 3 h 30 : 22h30-2h ou 2h-5h30, plus le brief de 21h30.",
      },
      {
        id: "boo-referent-vss",
        title: "Référent·e VSS & VDH",
        team: "Cellule VSS & VDH",
        seats: 4,
        summary:
          "Tu fais partie de l'équipe qui veille sur les personnes pendant la soirée : écoute, accompagnement, mise à l'abri, lien avec la sécurité de la salle.",
        missions: [
          "Tourner dans la salle en binôme, brassard rose bien visible.",
          "Accueillir et écouter les personnes qui viennent vers toi, sans jugement.",
          "Accompagner vers la safe zone et, si besoin, vers les secours ou la sécurité de la salle.",
          "Remplir la fiche de signalement anonymisée en fin de nuit avec la référente principale.",
        ],
        expectations: [
          "Suivre la formation obligatoire de 3 h avant la soirée : sans elle, pas de brassard.",
          "Rester sobre toute la soirée. C'est non négociable.",
          "Garder la confidentialité, y compris vis-à-vis du bureau.",
        ],
        commitment: "Toute la soirée (22h-5h30) en binôme, avec des pauses, plus la formation de 3 h.",
        closesAt: at(7, "23:59"),
      },
    ],
    process: [
      {
        label: "Candidature en ligne",
        detail:
          "Choisis ton poste et ton shift préféré, 5 minutes. Pour les référent·es VSS & VDH, la candidature ferme trois jours plus tôt.",
      },
      {
        label: "Appel de 10 min",
        detail: "Uniquement pour les référent·es VSS & VDH : un échange avec Aïcha, notre référente principale.",
      },
      {
        label: "Formation VSS & VDH",
        detail: "Obligatoire pour les référent·es : 3 h en salle A-012, animée par une association spécialisée.",
        date: at(9, "18:30"),
      },
      {
        label: "Confirmation des shifts",
        detail: "Par mail : ton shift, ton binôme et le plan de la salle.",
        date: at(12, "18:00"),
      },
      {
        label: "Brief sur place",
        detail: "À la Machine du Moulin Rouge, pour tout le staff, une heure et demie avant l'ouverture.",
        date: at(18, "21:30"),
      },
    ],
    requirements: [
      "Le poste et le shift que tu préfères.",
      "Ton numéro de téléphone, pour le groupe staff du soir.",
      "Pour les référent·es VSS & VDH : quelques lignes sur pourquoi tu veux le faire.",
    ],
    faq: [
      { question: "Je paie ma place si je suis staff ?", answer: "Non, ta place est offerte, et tu profites de la soirée en dehors de ton shift." },
      {
        question: "J'ai déjà acheté mon billet, je fais comment ?",
        answer: "On te le rembourse dès la confirmation de ton shift, sans démarche de ta part.",
      },
      {
        question: "Je peux staffer avec un·e ami·e ?",
        answer: "Dis-le dans ta candidature : on essaie de mettre les binômes sur le même shift.",
      },
      {
        question: "Le staff boit ?",
        answer:
          "Pas pendant le shift. En dehors, c'est ta soirée, sauf pour les référent·es VSS & VDH, qui restent sobres toute la nuit.",
      },
    ],
    cover: photos["soiree-foule"],
    contact: { name: "Yanis Haddad", role: "VP événements", email: "very-pink-club@asso.gem.exemple.fr" },
  },
  {
    id: "c-altitude-capitaines",
    slug: "altitude-capitaines",
    associationId: "a-altitude",
    title: "Capitaines de section",
    intro:
      "Chaque section d'Altitude a un·e capitaine qui fait tourner les créneaux, motive les troupes et tient le groupe WhatsApp. On en cherche trois pour l'année. Dernière ligne droite : ça ferme demain soir.",
    opensAt: ago(12, "12:00"),
    closesAt: at(1, "20:00"),
    status: "derniere-chance",
    positions: [
      {
        id: "alt-cap-running",
        title: "Capitaine running",
        team: "Section running",
        seats: 1,
        summary: "Tu fais vivre le run du canal chaque week-end et tu montes un groupe pour un semi au printemps.",
        missions: [
          "Lancer le run du week-end sur le groupe et compter les inscrit·es.",
          "Encadrer un des deux groupes d'allure avec Elena.",
          "Choisir un semi-marathon de printemps et monter le groupe d'entraînement.",
        ],
        expectations: [
          "Courir 8 km sans souffrir, à 6 min/km.",
          "Être là la plupart des week-ends, ou trouver quelqu'un pour te remplacer.",
          "Être d'humeur égale à 10h du matin.",
        ],
        commitment: "2 h par semaine, le run compris.",
      },
      {
        id: "alt-cap-escalade",
        title: "Capitaine escalade",
        team: "Section escalade",
        seats: 1,
        summary: "Tu gères les créneaux de bloc à tarif étudiant et tu lances les nouvelles séances débutant·es.",
        missions: [
          "Réserver les créneaux auprès de la salle et suivre les présences.",
          "Animer la séance débutant·es : échauffement, placement, chute.",
          "Organiser une sortie à Fontainebleau au printemps.",
        ],
        expectations: [
          "Grimper au moins en 5 en salle.",
          "Aimer expliquer, surtout à celles et ceux qui ont peur de tomber.",
          "Être dispo un soir par semaine.",
        ],
        commitment: "2 à 3 h par semaine.",
      },
      {
        id: "alt-ski-week",
        title: "Co-responsable Ski Week",
        team: "Ski Week",
        seats: 1,
        summary: "Tu prépares la Ski Week avec Hugo : 120 personnes, six jours, et beaucoup de tableurs.",
        missions: [
          "Suivre les inscriptions, la liste d'attente et les échéanciers de paiement.",
          "Faire le lien avec la résidence et le loueur de matériel.",
          "Répartir les appartements (le vrai défi de l'année).",
          "Être sur place pendant la semaine comme référent·e.",
        ],
        expectations: [
          "Rigueur sur les paiements : il y a 60 000 € en jeu.",
          "Être disponible pendant la Ski Week elle-même.",
          "Savoir dire non à quelqu'un qui veut changer d'appart pour la quatrième fois.",
        ],
        commitment: "3 h par semaine jusqu'en janvier, puis la semaine sur place.",
      },
    ],
    process: [
      { label: "Candidature en ligne", detail: "Le poste, trois lignes de motivation, ton niveau dans le sport concerné.", date: at(1, "20:00") },
      {
        label: "Séance test",
        detail: "Tu co-animes une séance avec le ou la capitaine actuel·le. Pas d'entretien formel.",
        date: at(4, "10:00"),
      },
      { label: "Réponse", detail: "Par message, dans la semaine qui suit la séance test.", date: at(8, "20:00") },
    ],
    requirements: ["Le poste visé.", "Trois lignes de motivation.", "Ton niveau dans le sport concerné, honnêtement."],
    faq: [
      {
        question: "Il faut être très bon·ne ?",
        answer: "Non. Il faut être régulier·e et aimer embarquer les autres. Le niveau, ça se travaille.",
      },
      {
        question: "Je peux candidater si je ne suis pas encore adhérent·e ?",
        answer: "Oui, l'adhésion à 25 € se prend après, si tu es retenu·e.",
      },
    ],
    cover: photos["sport-course"],
    contact: { name: "Camille Moreau", role: "Présidente", email: "altitude@asso.gem.exemple.fr" },
  },
  {
    id: "c-ourcq-fm-rejoins-l-antenne",
    slug: "ourcq-fm-rejoins-l-antenne",
    associationId: "a-ourcq-fm",
    title: "Rejoins l'antenne",
    intro:
      "Ourcq FM cherche des voix, des oreilles et des mains sur la console. Pas besoin d'expérience : on forme au micro, au montage et au direct. Entretiens au fil de l'eau, donc ne traîne pas.",
    opensAt: ago(4, "10:00"),
    closesAt: at(14, "23:59"),
    status: "ouverte",
    positions: [
      {
        id: "ofm-animation",
        title: "Animation",
        team: "Antenne",
        seats: 3,
        summary: "Tu animes une émission en direct, seul·e ou en duo, et tu la fais vivre en podcast.",
        missions: [
          "Préparer et animer une émission de 30 à 60 minutes, une fois par semaine ou toutes les deux semaines.",
          "Inviter des assos, des profs, des ancien·nes, et les faire parler.",
          "Assurer le direct lors des grands événements (débat des listes, soirées du VPC).",
        ],
        expectations: [
          "Accepter d'entendre ta voix enregistrée.",
          "Préparer tes émissions : un conducteur, pas une improvisation totale.",
          "Être régulier·e sur le créneau choisi.",
        ],
        commitment: "2 à 4 h par semaine selon le format.",
      },
      {
        id: "ofm-realisation",
        title: "Réalisation & son",
        team: "Technique",
        seats: 2,
        summary: "Tu tiens la console pendant les directs et tu montes le studio mobile pour les événements.",
        missions: [
          "Réaliser les émissions en direct : niveaux, jingles, appels.",
          "Installer le studio mobile pour les lives à l'Agora.",
          "Entretenir le matériel et tenir l'inventaire.",
        ],
        expectations: [
          "Curiosité technique, aucun diplôme requis.",
          "Calme quand un micro lâche en plein direct.",
          "Dispo sur certains créneaux du soir.",
        ],
        commitment: "2 à 3 h par semaine, plus les lives.",
      },
      {
        id: "ofm-podcast",
        title: "Podcast & montage",
        team: "Podcasts",
        seats: 2,
        summary: "Tu transformes les émissions en podcasts propres et tu produis des formats courts pour Instagram et TikTok.",
        missions: [
          "Monter les émissions pour la mise en ligne en podcast.",
          "Découper des extraits vidéo de 30 à 60 secondes.",
          "Rédiger les descriptions et les publier.",
        ],
        expectations: [
          "Avoir déjà monté quelque chose, même une vidéo de vacances.",
          "Tenir les délais : un podcast sort sous 48 h après le direct.",
        ],
        commitment: "2 à 3 h par semaine, en partie à distance.",
      },
    ],
    process: [
      { label: "Candidature en ligne", detail: "Le poste, quelques lignes, et pour l'animation une démo audio d'une minute (au téléphone, ça suffit)." },
      {
        label: "Entretien au studio",
        detail: "30 minutes au studio B-14, dont 5 minutes d'essai micro ou console. Entretiens au fil des candidatures.",
      },
      { label: "Réponse sous une semaine", detail: "Par mail, après l'entretien." },
      { label: "Première émission en binôme", detail: "Tu fais ta première émission avec un·e membre de l'équipe avant d'avoir ton créneau." },
    ],
    requirements: [
      "Le poste visé.",
      "Quelques lignes sur ce que tu voudrais faire à l'antenne.",
      "Pour l'animation : une démo audio d'une minute.",
    ],
    faq: [
      { question: "Je n'ai jamais fait de radio, c'est grave ?", answer: "Non, la moitié de l'équipe n'en avait jamais fait. On forme tout le monde." },
      {
        question: "Je peux proposer une émission en anglais ?",
        answer: "Oui, on en a déjà une avec Passport et on en voudrait une deuxième.",
      },
      {
        question: "Je suis déjà chroniqueur·se, je dois candidater pour animer ?",
        answer: "Oui, mais tu passes directement l'essai micro : on te connaît déjà.",
      },
    ],
    cover: photos["radio-micro"],
    contact: { name: "Sacha Lévy", role: "Responsable d'antenne", email: "ourcq-fm@asso.gem.exemple.fr" },
  },
  {
    id: "c-solidarite-ourcq-responsables-antenne",
    slug: "solidarite-ourcq-responsables-antenne",
    associationId: "a-solidarite-ourcq",
    title: "Responsables d'antenne",
    intro:
      "Solidarité Ourcq grandit et cherche cinq personnes pour tenir ses trois antennes : soutien scolaire, collectes et maraudes. Ce sont des postes de confiance, avec des gens qui comptent sur toi chaque semaine.",
    opensAt: ago(2, "09:00"),
    closesAt: at(20, "23:59"),
    status: "ouverte",
    positions: [
      {
        id: "so-soutien-scolaire",
        title: "Responsable soutien scolaire",
        team: "Antenne soutien scolaire",
        seats: 2,
        summary: "Tu coordonnes les binômes de bénévoles et tu fais le lien avec les professeur·es du collège.",
        missions: [
          "Constituer les binômes et les plannings en début de semestre.",
          "Faire le point chaque mois avec les deux professeures référentes.",
          "Remplacer ou trouver un remplacement quand un binôme est absent.",
        ],
        expectations: [
          "Être disponible une heure par semaine au collège, en plus de la coordination.",
          "Fiabilité absolue : les élèves remarquent tout.",
          "Engagement jusqu'en juin.",
        ],
        commitment: "3 h par semaine.",
      },
      {
        id: "so-collectes",
        title: "Responsable collectes",
        team: "Antenne collectes",
        seats: 1,
        summary: "Tu organises les collectes de l'année avec les supermarchés et les associations d'aide alimentaire.",
        missions: [
          "Obtenir les autorisations des supermarchés partenaires.",
          "Recruter et répartir les bénévoles sur les créneaux.",
          "Organiser le transport et la remise aux associations le soir même.",
        ],
        expectations: ["Sens de l'organisation et un peu de patience au téléphone.", "Permis B apprécié pour la camionnette."],
        commitment: "2 h par semaine, plus les jours de collecte.",
      },
      {
        id: "so-maraudes",
        title: "Responsable maraudes",
        team: "Antenne maraudes",
        seats: 2,
        summary: "Tu coordonnes les maraudes avec l'association partenaire du 19e et tu accompagnes les nouveaux et nouvelles bénévoles.",
        missions: [
          "Organiser le planning des maraudes avec l'association partenaire.",
          "Préparer les kits (boissons chaudes, produits d'hygiène).",
          "Accompagner les bénévoles lors de leur première sortie.",
        ],
        expectations: [
          "Avoir fait au moins deux maraudes avec nous.",
          "Suivre la formation de l'association partenaire.",
          "Être à l'écoute, sans vouloir tout régler.",
        ],
        commitment: "Un soir par semaine, 3 h.",
      },
    ],
    process: [
      { label: "Candidature en ligne", detail: "Le poste visé et quelques lignes sur ton expérience bénévole, même petite." },
      { label: "Rencontre", detail: "Un café avec Fatoumata et l'actuel·le responsable d'antenne." },
      { label: "Réponse", detail: "Sous une semaine après la rencontre." },
      { label: "Passation", detail: "Deux semaines en doublon avec l'actuel·le responsable." },
    ],
    requirements: ["Le poste visé.", "Quelques lignes sur ton expérience bénévole, même si c'est la première.", "Tes disponibilités."],
    faq: [
      {
        question: "Je n'ai jamais fait de bénévolat, je peux candidater ?",
        answer: "Pour le soutien scolaire et les collectes, oui. Pour les maraudes, on te propose d'abord d'en faire deux avec nous.",
      },
      { question: "Ça compte pour l'engagement associatif de l'école ?", answer: "Oui, les trois postes sont reconnus." },
    ],
    cover: photos["solidarite-collecte"],
    contact: { name: "Fatoumata Sissoko", role: "Présidente", email: "solidarite-ourcq@asso.gem.exemple.fr" },
  },
  {
    id: "c-pantin-conseil-2027",
    slug: "pantin-conseil-2027",
    associationId: "a-pantin-conseil",
    title: "Chargé·es d'affaires 2027",
    intro:
      "Pantin Conseil recrute sa promo 2027 : six chargé·es d'affaires pour aller chercher les missions, les suivre et les livrer, et un·e responsable qualité pour relire tout ce qui part chez les clients.",
    opensAt: at(7, "09:00"),
    closesAt: at(21, "23:59"),
    status: "a-venir",
    positions: [
      {
        id: "pc-charge-affaires",
        title: "Chargé·e d'affaires",
        team: "Développement commercial",
        seats: 6,
        summary: "Tu prospectes des PME, tu signes des missions et tu les suis jusqu'à la livraison avec les étudiant·es qui les réalisent.",
        missions: [
          "Prospecter des PME et des commerces de l'est parisien et de Seine-Saint-Denis.",
          "Rédiger les propositions commerciales et négocier les budgets.",
          "Recruter les étudiant·es intervenant·es sur chaque mission.",
          "Suivre l'avancement et tenir le client informé chaque semaine.",
        ],
        expectations: [
          "Aisance à l'oral, au téléphone comme en rendez-vous.",
          "Rigueur sur les documents : une proposition commerciale engage l'association.",
          "Engagement d'un an, de janvier à décembre.",
        ],
        commitment: "4 à 5 h par semaine.",
      },
      {
        id: "pc-qualite",
        title: "Responsable qualité",
        team: "Bureau",
        seats: 1,
        summary: "Tu relis chaque livrable avant qu'il parte chez le client et tu tiens les process à jour.",
        missions: [
          "Relire les livrables : cohérence, chiffres, orthographe, mise en page.",
          "Tenir les modèles de documents et les process à jour.",
          "Préparer l'audit annuel de la Junior-Entreprise.",
        ],
        expectations: ["Un œil qui repère une coquille à dix mètres.", "Diplomatie : tu vas renvoyer des slides à leurs auteur·es."],
        commitment: "3 à 4 h par semaine, plus en fin de mission.",
      },
    ],
    process: [
      { label: "Candidature en ligne", detail: "CV, quelques lignes de motivation et tes disponibilités.", date: at(21, "23:59") },
      { label: "Cas pratique", detail: "45 minutes en binôme sur une vraie demande de client (anonymisée).", date: at(24, "18:00") },
      { label: "Entretien individuel", detail: "20 minutes avec la présidente et la responsable RH.", date: at(26, "18:00") },
      { label: "Réponse et formation", detail: "Réponse sous 72 h, puis un week-end de formation interne en janvier.", date: at(29, "18:00") },
    ],
    requirements: ["CV.", "Quelques lignes de motivation.", "Tes disponibilités pour le cas pratique et l'entretien."],
    faq: [
      {
        question: "C'est payé ?",
        answer:
          "Les chargé·es d'affaires sont bénévoles, comme tout le bureau. En revanche, tu peux aussi réaliser des missions, et celles-ci sont rémunérées.",
      },
      {
        question: "Il faut déjà avoir fait du conseil ?",
        answer: "Non. Viens au Forum des missions pour voir à quoi ça ressemble avant de candidater.",
      },
    ],
    cover: photos["atelier-equipe"],
    contact: { name: "Rania Cherif", role: "Responsable RH", email: "pantin-conseil@asso.gem.exemple.fr" },
  },
  {
    id: "c-atelier-93-mi-annee",
    slug: "atelier-93-mi-annee",
    associationId: "a-atelier-93",
    title: "Recrutement de mi-année",
    intro:
      "Atelier 93 complète son équipe pour le reste de l'année : deux photographes pour l'atelier argentique et les événements, et une personne à la régie de la scène ouverte.",
    opensAt: ago(24, "10:00"),
    closesAt: ago(3, "23:59"),
    status: "cloturee",
    positions: [
      {
        id: "a93-photographe",
        title: "Photographe",
        team: "Atelier photo",
        seats: 2,
        summary: "Tu couvres les scènes ouvertes et l'expo de printemps, et tu aides Samuel à animer l'atelier argentique.",
        missions: [
          "Photographier les scènes ouvertes et livrer une sélection sous 48 h.",
          "Co-animer l'atelier argentique une fois par mois.",
          "Préparer les tirages de l'expo de printemps.",
        ],
        expectations: ["Un portfolio, même au téléphone.", "Être dispo les soirs de scène ouverte."],
        commitment: "2 à 3 h par semaine.",
      },
      {
        id: "a93-regie",
        title: "Régie scène ouverte",
        team: "Scène",
        seats: 1,
        summary: "Tu tiens le son et la lumière pendant les scènes ouvertes.",
        missions: ["Installer et régler le son et les lumières de l'Agora.", "Gérer l'ordre de passage avec Gabriel."],
        expectations: ["Curiosité technique.", "Être là une soirée par mois."],
        commitment: "Une soirée par mois, plus l'installation.",
      },
    ],
    process: [
      { label: "Candidature en ligne", detail: "Le poste, quelques lignes et un portfolio pour les photographes.", date: ago(3, "23:59") },
      { label: "Rencontre", detail: "Un café avec Jade et la personne avec qui tu travailleras." },
      { label: "Réponse", detail: "Sous dix jours après la clôture." },
    ],
    requirements: ["Le poste visé.", "Quelques lignes de motivation.", "Pour les photographes : un portfolio (PDF ou lien)."],
    faq: [
      {
        question: "Il y aura un autre recrutement ?",
        answer: "Oui, en septembre, pour toute l'équipe. Et l'atelier argentique est ouvert à tout le monde en attendant.",
      },
    ],
    cover: photos["theatre-scene"],
    contact: { name: "Jade Martin", role: "Présidente", email: "atelier-93@asso.gem.exemple.fr" },
  },
];
