import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import { governanceErrorCode, governanceErrorMessage } from "@/lib/governance/messages";
import { attendeesCsv, attendeesFileName, type ExportRow } from "@/lib/events/csv";

/**
 * POST /manage/<asso>/events/<event>/participants/export — the participant
 * list as a CSV file. public.export_event_attendees checks
 * events.attendees.export in the event's own association and records the
 * export in the audit (who, when, how many rows); it returns names,
 * statuses, references and dates only (never an e-mail). A POST from the
 * site itself, never a link: nothing exports by being opened, prefetched or
 * embedded elsewhere. The file is built in memory and never stored.
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

export async function POST(request: Request, { params }: { params: Promise<{ asso: string; event: string }> }) {
  const { event } = await params;
  if (!sameOrigin(request)) return refuse(403, "Export refusé : il doit partir du site lui-même.");
  if (!UUID.test(event)) return refuse(404, governanceErrorMessage("event_not_found"));
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return refuse(401, governanceErrorMessage("not_authenticated"));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("export_event_attendees", { p_event_id: event.toLowerCase() });
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError("export_event_attendees", { code: error.code ?? "", message: "" });
    return refuse(code === "event_not_found" ? 404 : 403, governanceErrorMessage(code));
  }
  const payload = data as unknown as { event: { title: string; slug: string | null }; rows: ExportRow[] };
  return new Response(attendeesCsv(payload.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${attendeesFileName(payload.event.slug ?? event)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
