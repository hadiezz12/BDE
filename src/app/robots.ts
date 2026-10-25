import type { MetadataRoute } from "next";
import { routes } from "@/lib/routes";
import { siteUrl } from "@/lib/site-url";

/**
 * /robots.txt — personal and team spaces, previews (association pages,
 * articles and events) and private media are never for search engines (they also
 * require a session and say noindex; this only keeps crawlers from trying).
 * The fil's RSS feed stays allowed: it lists published articles only.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/manage",
        "/account",
        "/login",
        "/auth",
        "/media/apercu",
        "/associations/*/apercu",
        // Article previews: /campus/apercu/<post id>. The trailing slash keeps
        // articles whose slug merely starts with "apercu-" crawlable.
        `${routes.campus}/apercu/`,
        // Event previews: /events/apercu/<event id> ("apercu" is a reserved event address).
        "/events/apercu/",
        // Calendar files are copies of the event pages.
        "/events/*/ics",
      ],
    },
    sitemap: base ? new URL("/sitemap.xml", base).toString() : undefined,
  };
}
