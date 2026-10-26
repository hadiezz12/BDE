import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import { governanceErrorCode, governanceErrorMessage } from "@/lib/governance/messages";
import { applicationsCsv, exportFileName, type ExportRow } from "@/lib/recruitment/review";

/**
 * POST /manage/<asso>/recruitment/<campaign>/export — the applications of a
 * recruitment as a CSV file (Phase 9). public.recruitment_export checks
 * recruitment.applications.export within the campaign (an appointment with
 * the "export" power, or the association's key), requires a second factor,
 * and records the export in the audit (who, when, how many rows). It returns
 * essential fields only: never an answer, a note, a score detail or a file.
 * Cells are neutralised for spreadsheets (formula injection). A POST from
 * the site itself, never a link; the file is built in memory and never stored.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export async function POST(request: Request, { params }: { params: Promise<{ asso: string; campaign: string }> }) {
  const { campaign } = await params;
  if (!sameOrigin(request)) return refuse(403, "Export refusé : il doit partir du site lui-même.");
  if (!UUID.test(campaign)) return refuse(404, governanceErrorMessage("campaign_not_found"));
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return refuse(401, governanceErrorMessage("not_authenticated"));

  let position: string | undefined;
  try {
    const form = await request.formData();
    const value = String(form.get("position_id") ?? "").trim().toLowerCase();
    if (UUID.test(value)) position = value;
  } catch {
    // No body: the whole recruitment.
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("recruitment_export", { p_campaign_id: campaign.toLowerCase(), p_position_id: position });
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError("recruitment_export", { code: error.code ?? "", message: "" });
    return refuse(code === "campaign_not_found" ? 404 : 403, governanceErrorMessage(code));
  }
  const payload = data as unknown as { campaign: string; rows: ExportRow[] };
  return new Response(applicationsCsv(payload.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(payload.campaign)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
