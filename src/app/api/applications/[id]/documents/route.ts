import { revalidatePath } from "next/cache";
import { getAuthContext } from "@/lib/auth/context";
import { governanceErrorCode, governanceErrorMessage } from "@/lib/governance/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import { safeFileName, sniffDocument } from "@/lib/recruitment/documents";

/**
 * POST /api/applications/<id>/documents — adds a document (CV, portfolio…)
 * to one's own draft (multipart: question_id, file, replaces?). A route
 * handler rather than a Server Action so the browser can show progress.
 *
 * Storage and the database are two systems with no shared transaction, so:
 *   1. the server reads the file's first bytes: only a real PDF, Word
 *      (.docx, no macros, no embedded objects), JPEG or PNG goes further,
 *      whatever its name or the type the browser claims;
 *   2. public.reserve_application_document checks that the draft is the
 *      caller's, the question takes this kind and size, and the counts, then
 *      reserves a path (applications/<application>/<document>: no name, no
 *      e-mail in it);
 *   3. the file is stored with the candidate's own session: the Storage
 *      policy only lets them write a path they reserved;
 *   4. public.confirm_application_document checks the file is there and
 *      makes it count (with `replaces`, the previous one goes only now).
 * A reservation never confirmed expires (the nightly purge removes it).
 * No organizer, BDE member or guardian can read these files.
 */

const MAX_BYTES = 10 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const json = (status: number, body: object) =>
  Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/** Route handlers do not get the Server Actions' origin check: refuse a request sent from another site. */
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!sameOrigin(request)) return json(403, { error: "Envoi refusé : il doit partir du site lui-même." });
  if (!UUID.test(id)) return json(404, { error: governanceErrorMessage("application_not_found") });
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return json(401, { error: governanceErrorMessage("not_authenticated") });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES + 256 * 1024) return json(413, { error: governanceErrorMessage("document_too_large") });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json(400, { error: "L'envoi n'a pas abouti. Réessaie." });
  }
  const file = form.get("file");
  const questionId = String(form.get("question_id") ?? "");
  const replaces = String(form.get("replaces") ?? "");
  if (!(file instanceof File) || file.size === 0) return json(400, { error: "Choisis un fichier à envoyer." });
  if (!/^[a-z0-9_]{1,40}$/.test(questionId) || (replaces && !UUID.test(replaces))) {
    return json(400, { error: governanceErrorMessage("question_not_found") });
  }
  if (file.size > MAX_BYTES) return json(413, { error: governanceErrorMessage("document_too_large") });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffDocument(bytes);
  if (!mime) return json(422, { error: governanceErrorMessage("document_unreadable") });
  const name = safeFileName(file.name || "document", mime);

  const supabase = await createSupabaseServerClient();
  const fail = (error: { code?: string; message?: string }, where: string) => {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError(where, { code: error.code ?? "", message: "" });
    return json(code === "insufficient_permission" || code === "application_not_found" ? 403 : 422, { error: governanceErrorMessage(code), code });
  };

  const reserved = await supabase.rpc("reserve_application_document", {
    p_application_id: id,
    p_question_id: questionId,
    p_file_name: name,
    p_mime_type: mime,
    p_size_bytes: bytes.length,
  });
  if (reserved.error) return fail(reserved.error, "reserve_application_document");
  const { document_id: documentId, object_path: path } = reserved.data as unknown as { document_id: string; object_path: string };

  const stored = await supabase.storage
    .from("recruitment-documents")
    .upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "0" });
  if (stored.error) {
    logDataError("recruitment_documents.upload", { code: "storage", message: "" });
    return json(422, { error: governanceErrorMessage("document_not_uploaded") });
  }

  const confirmed = await supabase.rpc("confirm_application_document", {
    p_document_id: documentId,
    p_replaces: replaces || undefined,
  });
  if (confirmed.error) return fail(confirmed.error, "confirm_application_document");

  const app = await supabase.from("applications").select("version").eq("id", id).maybeSingle();
  revalidatePath(`/account/applications/${id}`);
  return json(201, {
    document: { id: documentId, question_id: questionId, file_name: name, mime_type: mime, size_bytes: bytes.length },
    version: app.data?.version ?? null,
  });
}
