import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { siteUrl } from "@/lib/site-url";

/** The feed's name, in readers and in the pages' <link rel="alternate">. */
export const CAMPUS_RSS_TITLE = "Le fil du campus — Very Pink Club";

/**
 * Where the fil's RSS feed lives, or null when it must not exist: a feed is
 * only useful with absolute links to the site's real address, so in
 * production it waits for SITE_URL (the BDE's domain) and never lists
 * localhost links. In development the local address is fine. The route
 * answers 404 when this is null, and pages only announce the feed
 * (<link rel="alternate">) when it is not.
 */
export function campusRssBase(): URL | null {
  const base = siteUrl();
  if (!base) return null;
  const local = base.hostname === "localhost" || base.hostname === "127.0.0.1" || base.hostname === "[::1]";
  return local && process.env.NODE_ENV === "production" ? null : base;
}

/**
 * The feed announced in a page's metadata (`alternates.types`), so browsers
 * and feed readers find it from the fil or an article; nothing while the
 * feed does not exist.
 */
export function campusRssAlternate(): NonNullable<Metadata["alternates"]>["types"] {
  const base = campusRssBase();
  if (!base) return undefined;
  return { "application/rss+xml": [{ url: new URL(routes.campusRss, base).toString(), title: CAMPUS_RSS_TITLE }] };
}
