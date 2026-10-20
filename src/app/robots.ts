import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site-url";

/**
 * /robots.txt — personal and team spaces, previews and private media are
 * never for search engines (they also require a session; this only keeps
 * crawlers from trying).
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/manage", "/account", "/login", "/auth", "/media/apercu", "/associations/*/apercu"],
    },
    sitemap: base ? new URL("/sitemap.xml", base).toString() : undefined,
  };
}
