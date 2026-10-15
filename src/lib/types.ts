/**
 * Frontend domain types. Deliberately lightweight: they describe what the UI
 * needs, and will be aligned with the Supabase schema in a later phase.
 * Dates are ISO-8601 strings (with offset) so they serialise across the
 * server/client boundary unchanged.
 */

/** Controlled association accent palette — never arbitrary CSS. See lib/accents.ts. */
export type AccentKey =
  | "rose"
  | "cyan"
  | "violet"
  | "vert"
  | "or"
  | "bleu"
  | "orange"
  | "corail";

export interface Photo {
  src: string;
  alt: string;
  width: number;
  height: number;
  /** CSS object-position, e.g. "50% 30%", to keep faces in frame when cropped. */
  focal?: string;
  credit?: string;
}

export type AssociationCategory =
  | "bde"
  | "sport"
  | "culture"
  | "pro"
  | "entrepreneuriat"
  | "solidarite"
  | "international"
  | "arts"
  | "media"
  | "autre";

export interface SocialLink {
  kind: "instagram" | "tiktok" | "linkedin" | "site" | "mail";
  href: string;
  label: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  promo?: string;
  avatar?: Photo;
}

export interface Association {
  id: string;
  slug: string;
  name: string;
  /** Short form used in tight spaces ("VPC", "BDS"). */
  shortName?: string;
  /** Official status line, e.g. "Bureau des étudiants", "Junior-Entreprise". */
  kind: string;
  category: AssociationCategory;
  accent: AccentKey;
  /** One line, written like the association talks. */
  tagline: string;
  /** Profile intro — a few short paragraphs. */
  description: string[];
  logo?: Photo;
  cover?: Photo;
  gallery: Photo[];
  socials: SocialLink[];
  contactEmail?: string;
  foundedYear?: number;
  memberCount?: number;
  /** Where/when to find them, e.g. "Permanence le mardi 12h30, salle B204". */
  meetingInfo?: string;
  team: TeamMember[];
  /** Up to three things the association wants students to know first. */
  highlights?: string[];
  /**
   * The same highlights with their explanation, when the association wrote
   * one (the BDE's three pillars). `highlights` keeps the short titles.
   */
  pillars?: AssociationPillar[];
}

export interface AssociationPillar {
  title: string;
  detail: string;
}

/**
 * A recurring event of the BDE's year ("Les 8 événements de l'année"): the
 * WEI, the Boo Party, the barathons… Not a dated occurrence: it says what the
 * event is and roughly when it comes back. Each dated edition (CampusEvent)
 * can point to its series through `seriesId`.
 */
export interface EventSeries {
  id: string;
  /** Also its page: routes.event(slug). */
  slug: string;
  /** "Le WEI", "Boo Party". */
  name: string;
  /** "Week-end d'intégration", "La Sat' Halloween". */
  subtitle: string;
  description: string;
  /** When in the year, in words: "Septembre · rentrée". Never a date. */
  period: string;
  /** Neon emblem artwork, public path ("/brand/events/wei.png"), 154 × 154. */
  emblem: string;
  /** The colour the emblem wears. */
  accent: AccentKey;
  /** The association that produces it (the BDE). */
  associationId: string;
}

export type EventCategory =
  | "soiree"
  | "sport"
  | "carriere"
  | "academique"
  | "culture"
  | "solidarite"
  | "week-end";

export type RegistrationStatus =
  /** Registration not needed — just show up. */
  | "libre"
  | "bientot"
  | "ouverte"
  /** Open but closing within 48 h or nearly full. */
  | "derniere-chance"
  | "liste-attente"
  | "complet"
  | "fermee";

export type PublicationStatus = "brouillon" | "programme" | "publie";

export interface Venue {
  name: string;
  address?: string;
  city?: string;
  onCampus?: boolean;
}

export interface CampusEvent {
  id: string;
  slug: string;
  title: string;
  subtitle?: string;
  associationId: string;
  /** The recurring event this is an edition of (EventSeries.id), if any. */
  seriesId?: string;
  category: EventCategory;
  startsAt: string;
  endsAt?: string;
  venue: Venue;
  /** One or two sentences for previews. */
  summary: string;
  /** Detail page body, paragraph by paragraph. */
  description: string[];
  cover?: Photo;
  /** Neon emblem artwork (BDE signature events). */
  emblem?: string;
  /** Prices in euros. `null` means free. */
  price: { member?: number; standard: number } | null;
  registration: {
    status: RegistrationStatus;
    capacity?: number;
    taken?: number;
    opensAt?: string;
    closesAt?: string;
  };
  /** Practical lines shown on the detail page ("Dress code rose", "Navette retour 2h"). */
  practical?: string[];
  featured?: boolean;
  publication: PublicationStatus;
}

export type PostKind = "annonce" | "recap" | "interview" | "edito" | "breve";

export interface CampusPost {
  id: string;
  slug: string;
  kind: PostKind;
  title: string;
  associationId: string;
  authorName: string;
  publishedAt: string;
  excerpt: string;
  body: string[];
  cover?: Photo;
  readingMinutes: number;
  relatedEventId?: string;
  publication: PublicationStatus;
  /** Only for programmed posts. */
  scheduledFor?: string;
}

export type CampaignStatus = "a-venir" | "ouverte" | "derniere-chance" | "cloturee";

export interface RecruitmentPosition {
  id: string;
  title: string;
  /** Pole/team, e.g. "Pôle partenariats". */
  team?: string;
  seats: number;
  summary: string;
  missions: string[];
  expectations: string[];
  /** e.g. "3 à 4 h par semaine". */
  commitment: string;
  /** Overrides the campaign deadline when a role closes earlier. */
  closesAt?: string;
}

export interface RecruitmentStep {
  label: string;
  detail: string;
  date?: string;
}

export interface RecruitmentCampaign {
  id: string;
  slug: string;
  associationId: string;
  title: string;
  intro: string;
  opensAt: string;
  closesAt: string;
  status: CampaignStatus;
  positions: RecruitmentPosition[];
  process: RecruitmentStep[];
  /** What the applicant will be asked to provide. */
  requirements: string[];
  faq: { question: string; answer: string }[];
  cover?: Photo;
  /** Who answers questions about this campaign. */
  contact: { name: string; role: string; email: string };
}

export type ApplicationStatus =
  | "brouillon"
  | "envoyee"
  | "en-revue"
  | "entretien"
  | "acceptee"
  | "refusee"
  | "retiree";

export interface ApplicationEvent {
  status: ApplicationStatus;
  at: string;
  note?: string;
}

export interface ApplicationSummary {
  id: string;
  userId: string;
  campaignId: string;
  positionId: string;
  status: ApplicationStatus;
  createdAt: string;
  submittedAt?: string;
  updatedAt: string;
  nextStep?: { label: string; date?: string; location?: string };
  timeline: ApplicationEvent[];
  /** What the student submitted, shown back to them verbatim. */
  answers: { question: string; answer: string }[];
  attachments: { name: string; sizeKb: number }[];
}

/** One question of a campaign's application form (the role choice is always asked first). */
export interface ApplicationQuestion {
  id: string;
  label: string;
  hint?: string;
  /** long = textarea, short = one line, tel = phone number, choice = pick one of `options`. */
  kind: "long" | "short" | "tel" | "choice";
  options?: string[];
  optional?: boolean;
  maxLength?: number;
  /** Asked only for these position ids; every role otherwise. */
  onlyFor?: string[];
}

/** A file the applicant is asked for (CV, portfolio, audio demo…). */
export interface ApplicationAttachmentSpec {
  id: string;
  label: string;
  hint?: string;
  /** Value of the file input's accept attribute, e.g. ".pdf". */
  accept: string;
  optional?: boolean;
  onlyFor?: string[];
}

/** The application form of a campaign. */
export interface ApplicationFormSpec {
  campaignId: string;
  /** Lets the applicant name a second role, by order of preference. */
  secondChoice?: boolean;
  questions: ApplicationQuestion[];
  attachments: ApplicationAttachmentSpec[];
}

export interface Membership {
  associationId: string;
  role: string;
  since: string;
}

export interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  /** Name the student chose to be shown by, when set. */
  displayName?: string;
  /** Short-lived signed URL of the student's own avatar (private bucket). */
  avatarUrl?: string;
  /**
   * Set on Phase 1 demo accounts only: the label to show instead of a person
   * ("Compte démo — étudiant·e"). Absent on real accounts.
   */
  demoLabel?: string;
  /** Empty string when unknown (the demo accounts): hide it, never print "". */
  email: string;
  /** "Programme Grande École"… Empty string when unknown (the demo accounts). */
  programme: string;
  /** "2A"… Empty string when unknown (the demo accounts). */
  year: string;
  avatar?: Photo;
  memberships: Membership[];
  /** Carte cotisante BDE. */
  memberCard?: { number: string; season: string; validUntil: string };
  savedEventIds: string[];
  registeredEventIds: string[];
  /** Associations this user can manage (officer rights). */
  managedAssociationIds: string[];
}

export type NotificationKind = "evenement" | "candidature" | "association" | "bde";

export interface Notification {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  href?: string;
}

/** Where a student wants to hear about a kind of notification. */
export type NotificationChannel = "espace" | "mail";

/** Per-kind notification settings (student space › Profil). */
export type NotificationPreferences = Record<NotificationKind, Record<NotificationChannel, boolean>>;

/* ---- Management-side shapes ------------------------------------------- */

export interface Applicant {
  id: string;
  campaignId: string;
  positionId: string;
  name: string;
  programme: string;
  submittedAt: string;
  status: ApplicationStatus;
}

export interface MediaAsset {
  id: string;
  associationId: string;
  photo: Photo;
  uploadedAt: string;
  uploadedBy: string;
  /** Where the asset is currently used ("Couverture", "Événement : Boo Party"). */
  usedIn?: string;
}

export interface ManageTask {
  id: string;
  associationId: string;
  label: string;
  detail?: string;
  due?: string;
  href: string;
  priority: "haute" | "normale";
}

/** Someone who helps an association without sitting on its bureau (staff, chroniqueur·se, bénévole). */
export interface AssociationMember {
  id: string;
  associationId: string;
  name: string;
  /** What they do, in the association's words: "Staff soirées", "Chroniqueuse". */
  role: string;
  promo?: string;
  since: string;
}

/** An invitation to join a bureau (and its workspace) that has not been accepted yet. */
export interface TeamInvite {
  id: string;
  associationId: string;
  email: string;
  /** Role on the bureau once accepted, e.g. "Respo logistique". */
  role: string;
  sentAt: string;
  sentBy: string;
}

/* ---- Joined view models returned by lib/data ----------------------------
   What list/detail screens actually consume: the entity plus the bits of its
   association needed to render identity (name, accent, logo). */

export type AssociationRef = Pick<
  Association,
  "id" | "slug" | "name" | "shortName" | "kind" | "category" | "accent" | "logo"
>;

export type EventItem = CampusEvent & { association: AssociationRef };

export type PostItem = CampusPost & { association: AssociationRef };

export type CampaignItem = RecruitmentCampaign & {
  association: AssociationRef;
  /** Total seats across positions. */
  seats: number;
};

export type ApplicationItem = ApplicationSummary & {
  campaign: CampaignItem;
  position: RecruitmentPosition;
};

/* ---- Session (Phase 1 demo only) -------------------------------------- */

/**
 * How a page renders for the current visitor. "etudiant" is any signed-in
 * student; "responsable" exists only for the development preview of the
 * association workspace (Phase 4 brings real, scoped management rights).
 */
export type DemoRole = "visiteur" | "etudiant" | "responsable";

export interface Session {
  role: DemoRole;
  user: UserProfile | null;
  /**
   * Signed in but not finished: "mfa" = second factor still to enter (the
   * session is treated as signed out until then); "onboarding" = profile
   * not completed yet.
   */
  pending?: "mfa" | "onboarding";
}

/* ---- Search ------------------------------------------------------------ */

export type SearchKind = "association" | "evenement" | "recrutement" | "article";

export interface SearchEntry {
  kind: SearchKind;
  id: string;
  title: string;
  /** Secondary line: association name, date, roles… */
  context: string;
  href: string;
  accent: AccentKey;
  /** Extra text that should match but is not displayed. */
  keywords: string;
}

/* ---- Safety (VSS / VDH) -------------------------------------------------- */

/** A national number or website anyone can use. Real, not demo data. */
export interface SafetyHotline {
  id: string;
  /** What people dial or type: "17", "114", "arretonslesviolences.gouv.fr". */
  number: string;
  name: string;
  detail: string;
  /** "tel:17", "sms:114", "https://…". */
  href: string;
  /** Visible action, e.g. "Appeler le 17". */
  actionLabel: string;
  kind: "urgence" | "ecoute";
}

/**
 * A campus contact (a cell, a permanence). Only listed once its details are
 * confirmed by whoever runs it: none are known in Phase 1.
 */
export interface SafetyContact {
  id: string;
  name: string;
  /** Who runs it, e.g. "Very Pink Club, le BDE". */
  runBy: string;
  summary: string;
  people?: string;
  hours?: string;
  place?: string;
  email?: string;
  /** Set while names, hours and addresses are placeholders awaiting confirmation. */
  toConfirmBy?: "BDE" | "école";
}

/** One thing the BDE does to look after people at its events. */
export interface SafetyPractice {
  label: string;
  detail: string;
}

/** One of the BDE's VSS / VDH commitments ("Ce à quoi nous nous tenons"). */
export interface SafetyCommitment {
  /** "01" … "06", in the BDE's order. */
  number: string;
  title: string;
  detail: string;
}

/** A choice of "Nature de l'alerte" in the confidential alert form. */
export interface SafetyAlertKind {
  value: "violence-sexiste" | "violence-sexuelle" | "harcelement" | "discrimination";
  label: string;
}

/* ---- Carte cotisante (BDE membership card) ------------------------------- */

/** One step of "how it works", in order. */
export interface MemberCardStep {
  title: string;
  detail?: string;
}

/**
 * The card as the BDE sells it. Only what the BDE has said: price, benefits,
 * validity, how it works. Per-event prices are not known yet, so nothing here
 * computes savings.
 */
export interface MemberCardOffer {
  /** The association that sells it (the BDE). */
  associationId: string;
  /** Euros, once per academic year. */
  price: number;
  /** Current academic year, September → August, Paris time: "2026–2027". */
  season: string;
  /** How long it lasts, in words: "Année universitaire". */
  validity: string;
  /** What the card gives, one fact per line, in the BDE's words. */
  perks: string[];
  /** The summary table, row by row ("Prix" → "30 €"). */
  summary: { label: string; value: string }[];
  /** How it works, in order. */
  steps: MemberCardStep[];
  /**
   * False until online payment ships (later phase): the UI shows a demo
   * notice, never a pay button that looks like it works.
   */
  paymentLive: boolean;
  /** Last valid day (ISO), once the BDE fixes it. Unknown in Phase 1. */
  validUntil?: string;
  /** Where and when to get it in person, once the BDE says. Unknown in Phase 1. */
  where?: string;
  /** How to pay, once payment is live. Unknown in Phase 1. */
  payment?: string;
  /** What happens without it, once the BDE says. Unknown in Phase 1. */
  note?: string;
  /** Campus post explaining the price, when there is one. None in Phase 1. */
  storySlug?: string;
}
