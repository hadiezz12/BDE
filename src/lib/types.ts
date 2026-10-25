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
  /** Shown under the image in a gallery (written by the association). */
  caption?: string;
}

/**
 * A directory category. The catalog lives in the database
 * (public.association_categories) and BDE leadership maintains it: never a
 * fixed list in the code.
 */
export interface CategoryRef {
  slug: string;
  label: string;
}

export interface SocialLink {
  kind: "instagram" | "tiktok" | "linkedin" | "youtube" | "facebook" | "x" | "site" | "mail";
  href: string;
  label: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  promo?: string;
  avatar?: Photo;
  /** A line the member chose to show publicly. */
  bio?: string;
}

export interface Association {
  id: string;
  slug: string;
  name: string;
  /** Short form used in tight spaces ("VPC", "BDS"). */
  shortName?: string;
  /** Official status line, e.g. "Bureau des étudiants", "Junior-Entreprise". */
  kind: string;
  /** The BDE (one, the platform's root) rather than an association. */
  isBde: boolean;
  /** 0 to 3 directory categories, in the association's order. */
  categories: CategoryRef[];
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
  /** When the page was first published (directory "récentes"). */
  firstPublishedAt?: string;
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

/** A category of the platform catalog (public.event_categories): its slug. */
export type EventCategory = string;

/** Where it happens: on the campus, somewhere else, or online. */
export type EventLocationType = "campus" | "external" | "online";

/** How students take part: just come, register on the site, or on the organizer's site. */
export type RegistrationMode = "none" | "internal" | "external";

/**
 * Where registration stands for everyone (no personal data), as the database
 * computes it (private.event_registration_state): information only, on
 * another site, not open yet, open, full with a waiting list, full, closed,
 * event cancelled, event over.
 */
export type RegistrationState = "none" | "external" | "upcoming" | "open" | "waitlist" | "full" | "closed" | "cancelled" | "past";

/** The event itself: will it happen? "completed" is derived (it has ended). */
export type EventStatus = "scheduled" | "cancelled" | "completed";

export interface Venue {
  type: EventLocationType;
  /** "Amphithéâtre", "Le lieu de la soirée". Absent for an online event. */
  name?: string;
  address?: string;
  city?: string;
  onCampus: boolean;
  /** Only coordinates the organizer typed (never guessed from an address). */
  latitude?: number;
  longitude?: number;
  /** A public link to follow an online event. */
  onlineUrl?: string;
  /** Private instructions exist (given to confirmed participants only). */
  hasPrivateDetails: boolean;
}

/** A published event as the public site shows it (src/lib/events/model.ts maps the database payload). */
export interface CampusEvent {
  id: string;
  slug: string;
  title: string;
  /** One or two sentences for previews. */
  summary: string;
  /** Detail page body, paragraph by paragraph (plain text). */
  description: string[];
  associationId: string;
  /** Associations credited as co-organizers (no right on the event). */
  coorganizers: AssociationRef[];
  /** One of the BDE's events of the year (EventSeries.slug), if any. */
  seriesKey?: string;
  category?: { slug: EventCategory; label: string };
  startsAt: string;
  endsAt: string;
  /** The intended zone (Europe/Paris): dates are always shown in it. */
  timezone: string;
  venue: Venue;
  cover?: Photo;
  /** Neon emblem artwork (the BDE's events of the year). */
  emblem?: string;
  status: EventStatus;
  cancelledAt?: string;
  cancellationReason?: string;
  registration: {
    mode: RegistrationMode;
    state: RegistrationState;
    /** The organizer's own registration page (mode "external"). */
    externalUrl?: string;
    opensAt?: string;
    /** When registration closes (at the latest, the start). */
    closesAt?: string;
    /** Absent: no fixed capacity. */
    capacity?: number;
    /** Confirmed seats. */
    taken: number;
    waitlistEnabled: boolean;
    /** People waiting (a count, never names). */
    waiting: number;
    /** Self-service cancellation stops this many minutes before the start. */
    cancellationCutoffMinutes: number;
  };
  /** Featured on the site by the BDE. */
  featured: boolean;
  /** Pinned by its association on its own page. */
  pinned: boolean;
}

/**
 * The kinds of post (Phase 6): one content model, four presentations.
 * Featured stories and important BDE notices are a prominence, not a kind.
 */
export type PostKind = "article" | "annonce" | "recap" | "breve";

/**
 * A published post as lists show it (no body). Built from the database's
 * public read model (src/lib/posts/model.ts); never from client input.
 */
export interface PostItem {
  id: string;
  slug: string;
  kind: PostKind;
  title: string;
  /** The introduction (standfirst). */
  excerpt: string;
  cover?: Photo;
  /** First publication: the feed's order, never moved by later edits. */
  publishedAt: string;
  /** Last republication, when it came later. */
  updatedAt?: string;
  readingMinutes: number;
  /** Only where the association shows its authors (and the author agreed). */
  authorName?: string;
  association: AssociationRef;
  category?: CategoryRef;
  tags: string[];
  prominence: "normal" | "featured" | "important";
  /** Pinned on its association's page. */
  pinned: boolean;
  /** Archived: readable at its address, off the feeds. */
  archived: boolean;
  /** The event the article is about, read live from the event (public events only). */
  event?: EventItem;
  /** The recruitment campaign the article is about, read live (public campaigns only). */
  campaign?: CampaignItem;
}

/**
 * A campaign's state as visitors read it: derived by the database from its
 * publication, its pause or cancellation and its dates (private.campaign_state),
 * plus "derniere-chance" in the last 48 hours of an open campaign.
 */
export type CampaignStatus = "a-venir" | "ouverte" | "derniere-chance" | "en-pause" | "cloturee" | "annulee";

/** What a document question takes. "image" = JPEG or PNG. */
export type DocumentKind = "pdf" | "docx" | "image";

/** What the live form asks a candidate to one position, in short (enough to decide to apply). */
export interface FormSummary {
  questions: number;
  required: number;
  documents: { label: string; type: "file" | "cv"; required: boolean; fileTypes: DocumentKind[] }[];
}

export interface RecruitmentPosition {
  id: string;
  slug: string;
  title: string;
  /** Pole/team, e.g. "Pôle partenariats". */
  team?: string;
  /** Places the association announced; absent when it did not say. */
  openings?: number;
  summary?: string;
  /** Paragraphs. */
  description: string[];
  missions: string[];
  expectations: string[];
  /** e.g. "3 à 4 h par semaine". */
  commitment?: string;
  /** When this position stops taking applications (its own, earlier date, or the campaign's). */
  closesAt: string;
  closesEarly: boolean;
  /** Self-declared study years allowed to apply; absent = every student. */
  eligibleYears?: number[];
  /** Takes applications right now (decided by the database). */
  accepting: boolean;
  /** What the live form asks (campaign and position pages only). */
  form?: FormSummary;
}

export interface RecruitmentStep {
  label: string;
  detail: string;
  /** A day ("2026-11-20"), no time. */
  date?: string;
}

export interface RecruitmentCampaign {
  id: string;
  slug: string;
  associationId: string;
  title: string;
  intro: string;
  /** Paragraphs (campaign page only). */
  description: string[];
  /** "2026-2027". */
  academicYear?: string;
  opensAt: string;
  closesAt: string;
  status: CampaignStatus;
  cancellationReason?: string;
  /** How many positions of this campaign one student may apply to. */
  maxApplications: number;
  /** Self-declared study years allowed to apply; absent = every student. */
  eligibleYears?: number[];
  eligibilityNote?: string;
  archived: boolean;
  positions: RecruitmentPosition[];
  process: RecruitmentStep[];
  faq: { question: string; answer: string }[];
  cover?: Photo;
  /** Who answers questions about this campaign, when the association named someone. */
  contact?: { name?: string; role?: string; email?: string };
  updatedAt: string;
}

/**
 * Where a student's application stands. Phase 8 knows these three only:
 * "envoyée" never means read or accepted (the review states come with Phase 9).
 */
export type ApplicationStatus = "brouillon" | "envoyee" | "retiree";

/** The campaign of one of the student's applications (the page may be offline). */
export interface ApplicationCampaign {
  id: string;
  /** Absent when the campaign is no longer online (hidden, unpublished). */
  slug?: string;
  title: string;
  association: AssociationRef;
  status: CampaignStatus;
  closesAt: string;
  cancellationReason?: string;
}

export interface ApplicationItem {
  id: string;
  status: ApplicationStatus;
  /** Shown once submitted ("Référence K7Q2M9XA"). */
  reference?: string;
  createdAt: string;
  updatedAt: string;
  lastSavedAt?: string;
  submittedAt?: string;
  withdrawnAt?: string;
  /** A draft that can no longer be sent says why (a database code: campaign_closed…). */
  refusal?: string;
  /** A draft's completion (required questions still missing). */
  progress?: { required: number; missing: number; complete: boolean };
  campaign: ApplicationCampaign;
  position: { id: string; slug: string; title: string; team?: string; closesAt: string };
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
  "id" | "slug" | "name" | "shortName" | "kind" | "isBde" | "categories" | "accent" | "logo"
>;

export type EventItem = CampusEvent & { association: AssociationRef };

export type CampaignItem = RecruitmentCampaign & {
  association: AssociationRef;
  /** Places across positions, only when every position announced its number. */
  seats: number | null;
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
