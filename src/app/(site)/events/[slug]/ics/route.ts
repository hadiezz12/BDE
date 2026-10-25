import { routes } from "@/lib/routes";
import { siteUrl } from "@/lib/site-url";
import { getEventPageBySlug } from "@/lib/data/events";
import { buildIcs, icsFileName } from "@/lib/events/ics";
import { calendarInput } from "@/lib/events/seo";

/**
 * /events/[slug]/ics — one public event as an iCalendar file, from the same
 * public read as its page (public_event: never a draft, a hidden event or the
 * private joining details). A cancelled event comes out STATUS:CANCELLED, so
 * a calendar that imported it can show it crossed out. A former address
 * redirects to the current one; anything else is a plain 404.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }): Promise<Response> {
  const { slug } = await params;
  const page = await getEventPageBySlug(slug);
  if (page.state === "moved") {
    return new Response(null, { status: 308, headers: { Location: routes.eventIcs(page.slug) } });
  }
  if (page.state !== "ok") {
    return new Response("Not found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  const event = page.event;
  const base = siteUrl();
  const url = base ? new URL(routes.event(event.slug), base).toString() : routes.event(event.slug);
  return new Response(buildIcs(calendarInput(event, url)), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${icsFileName(event.slug)}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
