import { getManageGate } from "@/lib/data/manage";
import { getAnalyticsYears, getOrganizationAnalytics, logAnalyticsExport } from "@/lib/data/analytics";
import { parsePeriod } from "@/lib/analytics/period";
import { ORGANIZATION_SECTIONS, analyticsFileName, organizationCsv, pickSections } from "@/lib/analytics/csv";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { parisDateKey } from "@/lib/time";

/**
 * POST /manage/<asso>/analytics/export — the association's statistics as a
 * CSV file (Phase 13). The figures come from organization_analytics (each
 * section's key checked now, small groups hidden by the database), the
 * export is recorded by log_analytics_export (analytics.export, checked
 * now) before the file is sent, and a refused record means no file. Counts
 * only, cells neutralised for spreadsheets; built in memory, never stored.
 * A POST from the site itself, never a link.
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

export async function POST(request: Request, { params }: { params: Promise<{ asso: string }> }) {
  const { asso } = await params;
  if (!sameOrigin(request)) return refuse(403, "Export refusé : il doit partir du site lui-même.");
  const gate = await getManageGate(asso);
  if (!gate) return refuse(404, governanceErrorMessage("organization_not_found"));
  if (gate.status === "login") return refuse(401, governanceErrorMessage("not_authenticated"));
  if (gate.status !== "ok") return refuse(403, governanceErrorMessage("insufficient_permission"));

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

  const read = await getOrganizationAnalytics(gate.organization.id, period, period.compare);
  if (!read.ok) return refuse(read.code === "insufficient_permission" ? 403 : 503, governanceErrorMessage(read.code));
  const d = read.data;
  if (!d.rights.export) return refuse(403, governanceErrorMessage("insufficient_permission"));
  const sections = pickSections(form.getAll("sections"), ORGANIZATION_SECTIONS).filter((s) => d.rights[s]);
  if (sections.length === 0) return refuse(400, "Coche au moins une section que tes postes te permettent de lire.");

  const logged = await logAnalyticsExport({ scope: "organization", organizationId: d.organization.id, kind: "csv", sections, period });
  if (!logged.ok) return refuse(logged.code === "insufficient_permission" ? 403 : 503, governanceErrorMessage(logged.code));

  return new Response(organizationCsv(d, sections), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${analyticsFileName(d.organization.slug, period)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
