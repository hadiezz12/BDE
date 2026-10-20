/**
 * Every internal URL is built here, so renaming a section (e.g. French paths)
 * is a one-file change.
 */
export const routes = {
  home: "/",
  events: "/events",
  event: (slug: string) => `/events/${slug}`,
  associations: "/associations",
  association: (slug: string) => `/associations/${slug}`,
  /** The draft of a page, for its team only (never indexed). */
  associationPreview: (slug: string) => `/associations/${slug}/apercu`,
  recruitment: "/recruitment",
  campaign: (slug: string) => `/recruitment/${slug}`,
  campus: "/campus",
  post: (slug: string) => `/campus/${slug}`,
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
  manageEvents: (asso: string) => `/manage/${asso}/events`,
  manageTeam: (asso: string) => `/manage/${asso}/team`,
  /** One member: positions, mandates and the permission inspector. */
  manageMember: (asso: string, membershipId: string) => `/manage/${asso}/team/${membershipId}`,
  manageRoles: (asso: string) => `/manage/${asso}/roles`,
  manageNewRole: (asso: string) => `/manage/${asso}/roles/new`,
  manageRole: (asso: string, positionId: string) => `/manage/${asso}/roles/${positionId}`,
  manageGovernance: (asso: string) => `/manage/${asso}/governance`,
  manageRecruitment: (asso: string) => `/manage/${asso}/recruitment`,
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
  manageContinuity: "/manage/continuite",
} as const;
