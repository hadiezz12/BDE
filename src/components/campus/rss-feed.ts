/**
 * The fil as an RSS 2.0 document. Pure module (no path-alias imports): the
 * route (src/app/(site)/campus/rss/route.ts) gives it absolute URLs and
 * words, the unit tests load it with plain Node. Every value is escaped;
 * characters XML 1.0 forbids are dropped rather than breaking the feed.
 */

export interface RssItem {
  /** The post id: a stable guid, whatever happens to its address later. */
  id: string;
  title: string;
  url: string;
  /** First publication (ISO). */
  publishedAt: string;
  /** The introduction; left out when empty. */
  description: string;
  /** Rubrique and kind, in words. */
  categories: string[];
  /** Who signs: "Julie Martin pour Finance Society", or the association alone. */
  creator: string;
}

export interface RssChannel {
  title: string;
  /** The fil's page. */
  url: string;
  /** This feed's own address (atom:link rel="self"). */
  selfUrl: string;
  description: string;
  items: RssItem[];
}

const FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

export function escapeXml(value: string): string {
  return value
    .replace(FORBIDDEN, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** RFC 822 date, as RSS 2.0 wants it ("Thu, 22 Oct 2026 09:21:20 GMT"). */
export function rssDate(iso: string): string {
  return new Date(iso).toUTCString();
}

function element(name: string, value: string, attributes = ""): string {
  return `<${name}${attributes}>${escapeXml(value)}</${name}>`;
}

export function campusRssXml(channel: RssChannel, now: Date = new Date()): string {
  const newest = channel.items.reduce<string | null>(
    (latest, item) => (latest === null || Date.parse(item.publishedAt) > Date.parse(latest) ? item.publishedAt : latest),
    null,
  );
  const items = channel.items.map((item) =>
    [
      "    <item>",
      `      ${element("title", item.title)}`,
      `      ${element("link", item.url)}`,
      `      ${element("guid", `urn:uuid:${item.id}`, ' isPermaLink="false"')}`,
      `      ${element("pubDate", rssDate(item.publishedAt))}`,
      `      ${element("dc:creator", item.creator)}`,
      ...item.categories.filter(Boolean).map((c) => `      ${element("category", c)}`),
      ...(item.description ? [`      ${element("description", item.description)}`] : []),
      "    </item>",
    ].join("\n"),
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "  <channel>",
    `    ${element("title", channel.title)}`,
    `    ${element("link", channel.url)}`,
    `    ${element("description", channel.description)}`,
    "    <language>fr-FR</language>",
    `    <atom:link href="${escapeXml(channel.selfUrl)}" rel="self" type="application/rss+xml" />`,
    `    ${element("lastBuildDate", rssDate(newest ?? now.toISOString()))}`,
    "    <ttl>10</ttl>",
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
