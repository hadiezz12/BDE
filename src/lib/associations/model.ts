/**
 * The public shape of an association page, as the database returns it
 * (public.public_association / public_associations / association_preview,
 * private.association_payload), and its mapping to the UI's Association
 * type. Pure module (no path-alias imports): the unit tests load it with
 * plain Node.
 *
 * Images never have a public storage URL: they are served by the site's own
 * routes, which read them with the visitor's rights (a draft image only for
 * the association's page team, a published one for everyone while a public
 * page uses it). See src/app/media/.
 */

import type { AccentKey, Association, Photo, SocialLink, TeamMember } from "../types";

export type SocialPlatform = "instagram" | "tiktok" | "linkedin" | "youtube" | "facebook" | "x" | "website";

export interface MediaPayload {
  id: string;
  /** "<organization_id>/<media_id>.webp" in the private bucket. */
  path: string;
  width: number;
  height: number;
  alt: string | null;
}

export interface TeamMemberPayload {
  membership_id: string;
  name: string;
  title: string | null;
  bio: string | null;
  photo: boolean;
}

export interface AssociationPayload {
  id: string;
  slug: string;
  kind: "bde" | "association";
  name: string;
  short_name: string | null;
  accent: AccentKey;
  kind_label: string | null;
  tagline: string | null;
  description: string | null;
  meeting_info: string | null;
  pillars: { title: string; detail: string }[];
  contact_email: string | null;
  social_links: { platform: SocialPlatform; url: string }[];
  founded_year: number | null;
  categories: { slug: string; label: string }[];
  logo: MediaPayload | null;
  cover: MediaPayload | null;
  cover_focal: string | null;
  /** Absent from the directory list (public_associations). */
  gallery?: { media: MediaPayload | null; caption: string | null }[];
  team?: TeamMemberPayload[];
  first_published_at: string | null;
  published_at: string | null;
  /** Preview only: the draft revision being shown. */
  revision?: number;
}

export type PublicPageState =
  | { state: "ok"; association: AssociationPayload }
  | { state: "moved"; slug: string }
  | { state: "archived"; name: string }
  | { state: "unavailable" }
  | { state: "not_found" };

export interface CategoryCount {
  slug: string;
  label: string;
  count: number;
}

/**
 * The site route that serves an association image: the public one (anyone,
 * while a public page uses it), or the preview one (the page team only, never
 * cached or optimized; see src/lib/media-url.ts).
 */
export function mediaUrl(path: string, preview = false): string {
  return preview ? `/media/apercu/associations/${path}` : `/media/associations/${path}`;
}

/** The site route that serves a member's photo shown on a public team. */
export function portraitUrl(membershipId: string): string {
  return `/media/portraits/${membershipId}`;
}

/** The BDE's official badge (a brand asset of the site), when it has no uploaded logo. */
export const BDE_BADGE: Photo = { src: "/brand/vpc-badge.png", alt: "Logo du Very Pink Club", width: 406, height: 404 };

export function toPhoto(
  media: MediaPayload | null | undefined,
  fallbackAlt: string,
  focal?: string | null,
  preview = false,
): Photo | undefined {
  if (!media) return undefined;
  return {
    src: mediaUrl(media.path, preview),
    alt: media.alt ?? fallbackAlt,
    width: media.width,
    height: media.height,
    focal: focal ?? undefined,
  };
}

const PLATFORM_KIND: Record<SocialPlatform, SocialLink["kind"]> = {
  instagram: "instagram",
  tiktok: "tiktok",
  linkedin: "linkedin",
  youtube: "youtube",
  facebook: "facebook",
  x: "x",
  website: "site",
};

/** "instagram.com/finance" — what a link shows, without the scheme. */
export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/$/, "");
}

/** Description text → paragraphs (blank lines separate them). */
export function paragraphs(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);
}

/**
 * preview: a draft shown to its page team. Images come from the private
 * preview route; members' photos are left out (they become visible only on
 * the published page, and only with each member's consent).
 */
export function toAssociation(p: AssociationPayload, { preview = false }: { preview?: boolean } = {}): Association {
  const isBde = p.kind === "bde";
  const team: TeamMember[] = (p.team ?? []).map((m) => ({
    id: m.membership_id,
    name: m.name,
    role: m.title ?? "",
    bio: m.bio ?? undefined,
    avatar: m.photo && !preview
      ? { src: portraitUrl(m.membership_id), alt: `Photo de ${m.name}`, width: 640, height: 640 }
      : undefined,
  }));
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    shortName: p.short_name ?? undefined,
    kind: p.kind_label ?? (isBde ? "Bureau des étudiants" : "Association étudiante"),
    isBde,
    categories: p.categories,
    accent: p.accent,
    tagline: p.tagline ?? "",
    description: paragraphs(p.description),
    logo: toPhoto(p.logo, `Logo de ${p.name}`, null, preview) ?? (isBde ? BDE_BADGE : undefined),
    cover: toPhoto(p.cover, `Couverture de la page de ${p.name}`, p.cover_focal, preview),
    gallery: (p.gallery ?? [])
      .filter((g): g is { media: MediaPayload; caption: string | null } => Boolean(g.media))
      .map((g) => ({ ...toPhoto(g.media, g.caption ?? `Photo de ${p.name}`, null, preview)!, caption: g.caption ?? undefined })),
    socials: p.social_links.map((l) => ({ kind: PLATFORM_KIND[l.platform], href: l.url, label: displayUrl(l.url) })),
    contactEmail: p.contact_email ?? undefined,
    foundedYear: p.founded_year ?? undefined,
    meetingInfo: p.meeting_info ?? undefined,
    team,
    highlights: p.pillars.map((x) => x.title),
    pillars: p.pillars.filter((x) => x.title),
    firstPublishedAt: p.first_published_at ?? undefined,
  };
}
