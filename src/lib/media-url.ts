/**
 * Images served by the site's own routes (src/app/media/). A preview image
 * (an association's draft, readable only by its page team) lives under
 * /media/apercu/: it must reach the browser straight from the route, with the
 * person's cookies, and never through the shared image optimizer cache.
 */
export function isPrivateMedia(src: string): boolean {
  return src.startsWith("/media/apercu/");
}
