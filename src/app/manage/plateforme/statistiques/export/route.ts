import { getAuthContext } from "@/lib/auth/context";
import { getAnalyticsYears, getPlatformAnalytics, logAnalyticsExport } from "@/lib/data/analytics";
import { parsePeriod } from "@/lib/analytics/period";
import { PLATFORM_SECTIONS, analyticsFileName, pickSections, platformCsv } from "@/lib/analytics/csv";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { parisDateKey } from "@/lib/time";

/**
 * POST /manage/plateforme/statistiques/export — the platform's statistics
 * as a CSV file (Phase 13): campus-wide totals and suppressed breakdowns
 * from platform_analytics, recorded by log_analytics_export
 * (platform.analytics.view and the second factor, checked now) before the
 * file is sent; a refused record means no file. Built in memory, never
 * stored. A POST from the site itself, never a link.
 */

const refuse = (status: number, message: string) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

/** Route handlers do not get the Server Actions' origin check. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return refuse(403, "Export refusé : il doit partir du site lui-même.");
  const auth = await getAuthContext();
  if (auth.status !== "authenticated") return refuse(401, governanceErrorMessage("not_authenticated"));

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return refuse(400, governanceErrorMessage("analytics_export_invalid"));
  }
  const value = (name: string) => {
    const v = form.get(name);
    return typeof v === "string" ? v : undefined;
  };
  const parsed = parsePeriod(
    { periode: value("periode"), du: value("du"), au: value("au"), comparer: value("comparer") },
    parisDateKey(new Date()),
    await getAnalyticsYears(),
  );
  if (!parsed.ok) return refuse(400, governanceErrorMessage("analytics_period_invalid"));
  const period = parsed.period;

  const read = await getPlatformAnalytics(period, period.compare);
  if (!read.ok) return refuse(read.code === "insufficient_permission" ? 403 : 503, governanceErrorMessage(read.code));
  const d = read.data;
  if (!d.rights.export) return refuse(403, governanceErrorMessage("insufficient_permission"));
  const allowed = { associations: d.rights.view, content: d.rights.view, events: d.rights.view, recruitment: d.rights.view, governance: d.rights.governance, messages: d.rights.messages };
  const sections = pickSections(form.getAll("sections"), PLATFORM_SECTIONS).filter((s) => allowed[s]);
  if (sections.length === 0) return refuse(400, "Coche au moins une section que ton poste te permet de lire.");

  const logged = await logAnalyticsExport({ scope: "platform", organizationId: null, kind: "csv", sections, period });
  if (!logged.ok) {
    const status = logged.code === "insufficient_permission" || logged.code === "mfa_required" ? 403 : 503;
    return refuse(status, governanceErrorMessage(logged.code));
  }

  return new Response(platformCsv(d, sections), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${analyticsFileName("plateforme", period)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
