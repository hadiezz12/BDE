import { getAuthContext } from "@/lib/auth/context";
import { governanceErrorCode } from "@/lib/governance/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import { attachmentHeader, safeFileName } from "@/lib/recruitment/documents";

/**
 * GET /api/applications/documents/<id> — a candidate downloads one of their
 * own documents. public.my_application_document answers for the caller's own
 * documents only; the file is read with the candidate's own session (the
 * Storage policy allows nothing else) and streamed back as a download: never
 * displayed inline, never cached, no signed URL handed out to be shared.
 * Anyone else (another student, the association, the BDE, the guardian)
 * gets "not found".
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
  const { data, error } = await supabase.rpc("my_application_document", { p_document_id: document });
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError("my_application_document", { code: error.code ?? "", message: "" });
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
