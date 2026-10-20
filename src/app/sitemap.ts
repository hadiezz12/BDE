import type { MetadataRoute } from "next";
import { routes } from "@/lib/routes";
import { siteUrl } from "@/lib/site-url";
import { getPublicAssociations } from "@/lib/data/associations";

/**
 * /sitemap.xml — the public pages search engines may list: the main
 * sections and every published association page (read as a visitor, so a
 * draft, withheld or archived page never appears). Empty until SITE_URL is
 * set: absolute URLs need the BDE's domain.
 */
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  if (!base) return [];
  const url = (path: string) => new URL(path, base).toString();
  const associations = await getPublicAssociations().catch(() => []);
  return [
    { url: url(routes.home), changeFrequency: "weekly", priority: 1 },
    { url: url(routes.associations), changeFrequency: "weekly", priority: 0.8 },
    { url: url(routes.events), changeFrequency: "weekly", priority: 0.8 },
    { url: url(routes.safety), changeFrequency: "monthly", priority: 0.6 },
    ...associations.map((a) => ({
      url: url(routes.association(a.slug)),
      changeFrequency: "monthly" as const,
      priority: a.isBde ? 0.9 : 0.7,
    })),
  ];
}
