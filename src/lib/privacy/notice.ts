/**
 * The privacy notice of the site, as a draft written from what the code
 * actually does (Phase 14). It is shown as a draft until the controller
 * approves it; the approval is then recorded in the database with this
 * exact text (public.record_privacy_notice_version) and the page shows the
 * recorded version instead. Nothing here names a legal entity, a contact or
 * a delegate the BDE has not given: what is missing is listed in
 * PENDING_FACTS and said on the page, never filled with a placeholder.
 * Pure module (relative imports with extensions only): the unit tests load it with plain Node.
 */

export interface NoticeSection {
  heading: string;
  paragraphs: string[];
}

/** Bumped whenever the draft's text changes. */
export const DRAFT_VERSION = "projet-2026-11";

/** What the controller must give before the notice can be approved and the site opened. */
export const PENDING_FACTS: { key: string; label: string }[] = [
  { key: "controller", label: "L'entité juridique responsable du traitement (nom, forme, adresse) et son représentant" },
  { key: "contact", label: "L'adresse où écrire pour les demandes sur les données, hors du site" },
  { key: "dpo", label: "Le délégué à la protection des données, s'il y en a un, et ses coordonnées" },
  { key: "bases", label: "Les bases légales de chaque traitement, validées" },
  { key: "retention", label: "Les durées de conservation, décidées par le BDE dans le site" },
  { key: "hosting", label: "L'hébergeur du site en production, sa région, et les transferts éventuels hors de l'Union européenne" },
  { key: "email", label: "Le prestataire d'envoi des e-mails en production et son contrat de sous-traitance" },
];

export const NOTICE_SECTIONS: NoticeSection[] = [
  {
    heading: "Ce que dit cette page",
    paragraphs: [
      "Ce site sert la vie étudiante du campus de Paris de GEM Alpine Business School : le Very Pink Club (le bureau des étudiants), les associations, leurs événements, leurs recrutements et leurs articles.",
      "Cette page explique quelles données le site garde sur toi, pourquoi, qui les voit, combien de temps, et comment exercer tes droits. Elle décrit le fonctionnement réel du site.",
    ],
  },
  {
    heading: "Qui est responsable",
    paragraphs: [
      "Le site est édité pour le Very Pink Club. L'entité juridique responsable des traitements, son adresse et la personne à contacter seront indiquées ici une fois validées : tant que ce n'est pas fait, le site n'est pas ouvert au public.",
      "Une personne chargée des demandes sur les données, désignée hors du site par le responsable du projet, traite les demandes faites depuis « Mes données ». Ni le bureau du BDE, ni la personne garante de la continuité n'ont accès à ces demandes.",
    ],
  },
  {
    heading: "Ce que le site garde, et pourquoi",
    paragraphs: [
      "Ton compte : ton adresse e-mail de l'école (pour te connecter, par un code envoyé à chaque connexion), ton prénom et ton nom ; si tu le choisis, ton programme, ton année et une photo. Sans compte, on peut lire les pages publiques.",
      "Les assos : tes adhésions, tes postes et leurs dates de mandat, et l'historique de gouvernance (qui a nommé qui, quand), pour que chaque équipe fonctionne et reste traçable.",
      "Les événements : tes inscriptions, ta place en liste d'attente et tes annulations, pour organiser l'événement. L'équipe organisatrice voit le nom des inscrit·es, jamais leur adresse e-mail.",
      "Les recrutements : tes candidatures, tes réponses au formulaire et tes fichiers (CV, documents), pour que l'asso choisisse ses membres. Les formulaires qui posent des questions sensibles ne peuvent être publiés qu'avec une justification enregistrée.",
      "Les notifications : ce que le site t'envoie (sur le site et par e-mail), tes choix d'envoi et les assos que tu suis. Le site ne suit pas l'ouverture des e-mails.",
      "Tes choix : les contenus que tu enregistres et les centres d'intérêt que tu choisis, pour ton espace seulement. Personne d'autre ne les voit.",
      "La sécurité : l'historique des actions sensibles et des ouvertures de candidatures et de fichiers, pour savoir qui a fait quoi en cas de problème.",
    ],
  },
  {
    heading: "Bases légales",
    paragraphs: [
      "Les bases légales de chaque traitement (contrat, intérêt légitime, consentement…) sont en cours de validation par le responsable du traitement. Elles seront indiquées ici, traitement par traitement, une fois validées.",
      "Le consentement n'est utilisé que pour ce qui est vraiment facultatif : la photo et la présentation dans l'équipe publique d'une asso, et les e-mails que tu choisis de recevoir. Il se retire à tout moment : la présentation depuis l'espace de l'asso (Gérer), les e-mails depuis tes réglages de notifications.",
    ],
  },
  {
    heading: "Qui voit tes données",
    paragraphs: [
      "Une asso ne voit que ce qui la concerne : ses membres, les inscrit·es à ses événements (noms seulement), et les candidatures à ses recrutements, lues seulement par les personnes que ses postes ou son comité de recrutement y autorisent, au moment où elles les lisent.",
      "Le bureau du BDE ne lit ni les candidatures ni les listes d'inscrit·es des assos : il voit des comptes, sans personne derrière. Les statistiques masquent les petits groupes.",
      "Aucune donnée n'est vendue, ni utilisée pour de la publicité, ni envoyée à un service d'intelligence artificielle.",
    ],
  },
  {
    heading: "Prestataires",
    paragraphs: [
      "La base de données, les comptes et les fichiers sont hébergés par Supabase. L'hébergeur du site en production, sa région, et le prestataire d'envoi des e-mails restent à confirmer avant l'ouverture ; les éventuels transferts hors de l'Union européenne seront indiqués ici avec leurs garanties.",
    ],
  },
  {
    heading: "Combien de temps",
    paragraphs: [
      "Les durées de conservation sont décidées par le BDE, donnée par donnée, dans le site ; tant qu'une durée n'est pas décidée, rien n'est supprimé automatiquement, et cela doit être réglé avant l'ouverture.",
      "Certaines durées sont fixes : un fichier préparé pour une demande d'accès est disponible 14 jours, les journaux techniques des envois d'e-mails de 7 à 30 jours.",
      "Les sauvegardes de la base gardent pendant leur propre durée ce qui a été supprimé ; si une sauvegarde est restaurée, les effacements faits depuis sont refaits avant la réouverture du site.",
    ],
  },
  {
    heading: "Cookies",
    paragraphs: [
      "Le site n'utilise que deux cookies, tous deux nécessaires ou choisis par toi : celui de ta session de connexion, et celui qui retient le thème clair ou sombre. Aucune mesure d'audience, aucune publicité, aucun réseau social intégré. Le détail est sur la page Cookies.",
    ],
  },
  {
    heading: "Tes droits",
    paragraphs: [
      "Tu peux accéder à tes données, les faire corriger, les faire effacer, en limiter ou t'opposer à une utilisation, récupérer celles que tu as fournies dans un format réutilisable, et retirer un consentement.",
      "Le plus simple : la page « Mes données » de ton espace. Tu y télécharges tout de suite tes données, et tu y fais et suis tes demandes. La réponse arrive dans un délai d'un mois ; s'il faut plus de temps (deux mois de plus au maximum), tu en es prévenu·e avec la raison avant la fin du premier mois.",
      "Si tu n'as plus accès à ton compte, écris à l'adresse qui sera indiquée ci-dessus : ton identité sera vérifiée sans te demander de pièce d'identité quand ce n'est pas nécessaire.",
      "Tu peux aussi adresser une réclamation à la CNIL (www.cnil.fr).",
    ],
  },
  {
    heading: "Décisions automatiques",
    paragraphs: [
      "Aucune décision te concernant n'est prise par une machine. Dans un recrutement, les notes des évaluateur·rices aident l'équipe, mais le site ne classe, ne présélectionne et ne refuse personne automatiquement : chaque décision est proposée, validée et annoncée par des personnes.",
    ],
  },
  {
    heading: "Ce qui est obligatoire",
    paragraphs: [
      "Pour avoir un compte : ton adresse e-mail de l'école, ton prénom et ton nom. Le reste du profil est facultatif. Dans un formulaire de candidature, l'asso indique elle-même les questions obligatoires.",
    ],
  },
];
