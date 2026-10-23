import { routes } from "@/lib/routes";
import { getFeed } from "@/lib/data/posts";
import { CAMPUS_RSS_TITLE, campusRssBase } from "@/components/campus/campus-rss";
import { campusRssXml } from "@/components/campus/rss-feed";
import { POST_KIND_LABEL } from "@/components/campus/labels";

/**
 * /campus/rss — the 30 latest articles of the fil as RSS 2.0, from the same
 * public read as the fil (published, visible posts of public pages only;
 * archived ones are off the feeds here too). Regenerated at most every ten
 * minutes. Not found until the site has its public address (campus-rss.ts).
 */
export const revalidate = 600;

export async function GET(): Promise<Response> {
  const base = campusRssBase();
  if (!base) {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const url = (path: string) => new URL(path, base).toString();
  const { items } = await getFeed({ limit: 30 });

  const xml = campusRssXml({
    title: CAMPUS_RSS_TITLE,
    url: url(routes.campus),
    selfUrl: url(routes.campusRss),
    description:
      "Les articles, annonces, récaps et brèves du Very Pink Club et des associations de GEM Alpine Business School — Paris.",
    items: items.map((p) => ({
      id: p.id,
      title: p.title,
      url: url(routes.post(p.slug)),
      publishedAt: p.publishedAt,
      description: p.excerpt,
      categories: [p.category?.label ?? "", POST_KIND_LABEL[p.kind]],
      creator: p.authorName ? `${p.authorName} pour ${p.association.name}` : p.association.name,
    })),
  });

  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
