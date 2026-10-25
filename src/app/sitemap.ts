import type { MetadataRoute } from "next";
import { routes } from "@/lib/routes";
import { siteUrl } from "@/lib/site-url";
import { getPublicAssociations } from "@/lib/data/associations";
import { getPostSitemap } from "@/lib/data/posts";
import { getEventSitemap } from "@/lib/data/events";
import { getRecruitmentSitemap } from "@/lib/data/recruitment";

/**
 * /sitemap.xml — the public pages search engines may list: the main
 * sections, every published association page, every article in the fil,
 * every published event and every published recruitment campaign with its
 * positions (all read as a visitor, so a draft, withheld, archived,
 * unpublished or hidden one never appears; archived articles stay readable
 * but are noindex). Empty until SITE_URL is set: absolute URLs need the BDE's
 * domain. Regenerated at most every hour.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  if (!base) return [];
  const url = (path: string) => new URL(path, base).toString();
  const [associations, posts, events, campaigns] = await Promise.all([
    getPublicAssociations().catch(() => []),
    getPostSitemap().catch(() => []),
    getEventSitemap().catch(() => []),
    getRecruitmentSitemap().catch(() => []),
  ]);
  return [
    { url: url(routes.home), changeFrequency: "weekly", priority: 1 },
    { url: url(routes.associations), changeFrequency: "weekly", priority: 0.8 },
    { url: url(routes.events), changeFrequency: "weekly", priority: 0.8 },
    { url: url(routes.campus), changeFrequency: "daily", priority: 0.8 },
    { url: url(routes.recruitment), changeFrequency: "weekly", priority: 0.8 },
    { url: url(routes.safety), changeFrequency: "monthly", priority: 0.6 },
    ...associations.map((a) => ({
      url: url(routes.association(a.slug)),
      changeFrequency: "monthly" as const,
      priority: a.isBde ? 0.9 : 0.7,
    })),
    ...events.map((e) => ({
      url: url(routes.event(e.slug)),
      lastModified: e.updated_at,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
    ...campaigns.flatMap((c) => [
      { url: url(routes.campaign(c.slug)), lastModified: c.updated_at, changeFrequency: "weekly" as const, priority: 0.6 },
      ...c.positions.map((p) => ({
        url: url(routes.campaignPosition(c.slug, p)),
        lastModified: c.updated_at,
        changeFrequency: "weekly" as const,
        priority: 0.5,
      })),
    ]),
    ...posts.map((p) => ({
      url: url(routes.post(p.slug)),
      // The live version's publication: an edit that went online counts.
      lastModified: p.published_at,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
