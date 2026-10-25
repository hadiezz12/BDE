/**
 * Every internal URL is built here, so renaming a section (e.g. French paths)
 * is a one-file change.
 */
export const routes = {
  home: "/",
  events: "/events",
  event: (slug: string) => `/events/${slug}`,
  /** The campus calendar: month, week or list (?vue=mois|semaine|liste&date=YYYY-MM-DD). */
  eventCalendar: "/events/calendrier",
  /** The event as an iCalendar file (public information only). */
  eventIcs: (slug: string) => `/events/${slug}/ics`,
  /**
   * An event as it will look, for its team only (never indexed). "apercu" is
   * a reserved event slug, so no event can take it.
   */
  eventPreview: (eventId: string) => `/events/apercu/${eventId}`,
  associations: "/associations",
  association: (slug: string) => `/associations/${slug}`,
  /** The draft of a page, for its team only (never indexed). */
  associationPreview: (slug: string) => `/associations/${slug}/apercu`,
  recruitment: "/recruitment",
  campaign: (slug: string) => `/recruitment/${slug}`,
  campaignPosition: (slug: string, position: string) => `/recruitment/${slug}/${position}`,
  /**
   * A campaign and its form as candidates will see them, for its team only
   * (never indexed). "apercu" is a reserved campaign slug.
   */
  campaignPreview: (campaignId: string, positionId?: string) =>
    `/recruitment/apercu/${campaignId}${positionId ? `?poste=${positionId}` : ""}`,
  campus: "/campus",
  /** The fil filtered to one association. */
  campusFor: (asso: string) => `/campus?asso=${encodeURIComponent(asso)}`,
  /** RSS of the latest articles (only once SITE_URL is set). */
  campusRss: "/campus/rss",
  post: (slug: string) => `/campus/${slug}`,
  /**
   * A post as it will look, for its association's content team only (never
   * indexed). "apercu" is a reserved post slug, so no article can take it.
   */
  postPreview: (postId: string, revisionId?: string) =>
    `/campus/apercu/${postId}${revisionId ? `?version=${revisionId}` : ""}`,
  search: "/search",
  safety: "/vss",
  login: "/login",
  /** Second sign-in step for students who turned on two-factor authentication. */
  loginVerification: "/login/verification",
  /** Where Supabase Auth sends people back (OAuth, email links). */
  authCallback: "/auth/callback",

  account: "/account",
  accountEvents: "/account/events",
  accountApplications: "/account/applications",
  accountApplication: (id: string) => `/account/applications/${id}`,
  /** Upload (POST) a document to one's own draft; download (GET) one's own document. */
  applicationUpload: (applicationId: string) => `/api/applications/${applicationId}/documents`,
  applicationDocument: (documentId: string) => `/api/applications/documents/${documentId}`,
  accountNotifications: "/account/notifications",
  accountProfile: "/account/profile",
  accountSecurity: "/account/security",
  /** Invitations to answer, presidencies to accept, BDE approvals to give. */
  accountInvitations: "/account/invitations",
  /** First sign-in: name and study details, once. */
  accountOnboarding: "/account/onboarding",

  /** Chooser / redirect to the officer's association workspace. */
  manage: "/manage",
  /**
   * The association is part of the path: deep-linkable, no hidden state, and
   * an officer of two associations can keep both open in two tabs.
   */
  manageHome: (asso: string) => `/manage/${asso}`,
  manageContent: (asso: string) => `/manage/${asso}/content`,
  manageContentNew: (asso: string) => `/manage/${asso}/content/new`,
  /** One post in the editor (by id: drafts have no address yet). */
  manageContentPost: (asso: string, postId: string) => `/manage/${asso}/content/${postId}`,
  manageContentHistory: (asso: string, postId: string) => `/manage/${asso}/content/${postId}/historique`,
  /** The association's publishing rules (approval or direct, authors shown). */
  manageContentSettings: (asso: string) => `/manage/${asso}/content/reglages`,
  manageEvents: (asso: string) => `/manage/${asso}/events`,
  manageEventNew: (asso: string) => `/manage/${asso}/events/new`,
  /** One event in the wizard (by id: drafts have no address yet); `step` opens a step. */
  manageEvent: (asso: string, eventId: string, step?: string) =>
    `/manage/${asso}/events/${eventId}${step ? `?etape=${step}` : ""}`,
  manageEventParticipants: (asso: string, eventId: string) => `/manage/${asso}/events/${eventId}/participants`,
  manageEventParticipantsExport: (asso: string, eventId: string) => `/manage/${asso}/events/${eventId}/participants/export`,
  manageTeam: (asso: string) => `/manage/${asso}/team`,
  /** One member: positions, mandates and the permission inspector. */
  manageMember: (asso: string, membershipId: string) => `/manage/${asso}/team/${membershipId}`,
  manageRoles: (asso: string) => `/manage/${asso}/roles`,
  manageNewRole: (asso: string) => `/manage/${asso}/roles/new`,
  manageRole: (asso: string, positionId: string) => `/manage/${asso}/roles/${positionId}`,
  manageGovernance: (asso: string) => `/manage/${asso}/governance`,
  manageRecruitment: (asso: string) => `/manage/${asso}/recruitment`,
  manageRecruitmentNew: (asso: string) => `/manage/${asso}/recruitment/new`,
  /** One campaign in the wizard (by id: drafts have no address yet); `step` opens a step. */
  manageCampaign: (asso: string, campaignId: string, step?: string) =>
    `/manage/${asso}/recruitment/${campaignId}${step ? `?etape=${step}` : ""}`,
  manageMedia: (asso: string) => `/manage/${asso}/media`,
  manageAnalytics: (asso: string) => `/manage/${asso}/analytics`,
  /** The public page editor: content (index), then the tabs below. */
  manageSettings: (asso: string) => `/manage/${asso}/settings`,
  managePageAppearance: (asso: string) => `/manage/${asso}/settings/apparence`,
  managePageGallery: (asso: string) => `/manage/${asso}/settings/galerie`,
  managePageTeam: (asso: string) => `/manage/${asso}/settings/equipe`,
  managePagePublication: (asso: string) => `/manage/${asso}/settings/publication`,
  /** First-time setup of the page, step by step. */
  manageSetup: (asso: string) => `/manage/${asso}/demarrer`,

  /**
   * BDE control center (BDE president and vice-president) and the
   * continuity guardian's page. Fixed words next to /manage/[asso]: the
   * database reserves them as slugs (organizations_slug_reserved_check).
   */
  managePlatform: "/manage/plateforme",
  managePlatformOrganizations: "/manage/plateforme/assos",
  /** The directory's category catalog (BDE leadership). */
  managePlatformCategories: "/manage/plateforme/categories",
  managePlatformHistory: "/manage/plateforme/historique",
  /** Reports, hidden posts and the moderation history (BDE). */
  managePlatformModeration: "/manage/plateforme/moderation",
  /** What the BDE puts "à la une" or marks important, campus-wide. */
  managePlatformFeatured: "/manage/plateforme/une",
  /** The site's events: moderation and the front page (public information only). */
  managePlatformEvents: "/manage/plateforme/evenements",
  /** The site's recruitment: moderation, privacy notice and retention (public information and counts only). */
  managePlatformRecruitment: "/manage/plateforme/recrutements",
  manageContinuity: "/manage/continuite",
} as const;
