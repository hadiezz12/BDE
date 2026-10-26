import { getAuthContext } from "@/lib/auth/context";
import { governanceErrorCode } from "@/lib/governance/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import { attachmentHeader, safeFileName } from "@/lib/recruitment/documents";

/**
 * GET /api/recruitment/documents/<id> — someone of the recruitment team
 * downloads a candidate's document (Phase 9).
 *
 * public.recruitment_document decides with the caller's own session: the
 * application is sent, the person holds the "documents" power within its
 * scope (an appointment or the association's key), has no declared conflict
 * and is not a candidate in the same recruitment. It records the opening in
 * the application's access log and returns the file's path. The Storage
 * policy lets that same person read that one file for two minutes after the
 * record (checking the access again), so the file is read with their own
 * session, never a privileged key, and streamed back as a download: never
 * inline, never cached, no signed URL handed out. Anyone refused gets "not
 * found", whatever the reason.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const notFound = () =>
  new Response("Document introuvable.", { status: 404, headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" } });

export async function GET(_request: Request, { params }: { params: Promise<{ document: string }> }) {
  const { document } = await params;
  if (!UUID.test(document)) return notFound();
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return notFound();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("recruitment_document", { p_document_id: document });
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError("recruitment_document", { code: error.code ?? "", message: "" });
    return notFound();
  }
  const doc = data as unknown as { object_path: string; file_name: string; mime_type: string; size_bytes: number };
  const file = await supabase.storage.from("recruitment-documents").download(doc.object_path);
  if (file.error || !file.data) return notFound();

  return new Response(file.data.stream(), {
    status: 200,
    headers: {
      "Content-Type": doc.mime_type,
      "Content-Length": String(file.data.size),
      "Content-Disposition": attachmentHeader(safeFileName(doc.file_name, doc.mime_type)),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  });
}
