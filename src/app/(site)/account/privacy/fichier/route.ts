import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import { governanceErrorCode, governanceErrorMessage } from "@/lib/governance/messages";
import { jsonDownload, refuse, sameOrigin } from "@/lib/privacy/download";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /account/privacy/fichier — the file the privacy officer prepared for
 * one of the person's requests (Phase 14). public.privacy_artifact_payload
 * hands it only to the requester, before its 14-day expiry, and records
 * every download. No URL works alone: the id is useless without the session.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return refuse(403, "Téléchargement refusé : il doit partir du site lui-même.");
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return refuse(401, governanceErrorMessage("not_authenticated"));
  let id = "";
  try {
    id = String((await request.formData()).get("artifact_id") ?? "").trim().toLowerCase();
  } catch {
    // Treated as missing below.
  }
  if (!UUID.test(id)) return refuse(404, governanceErrorMessage("privacy_request_not_found"));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("privacy_artifact_payload", { p_artifact_id: id });
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError("privacy_artifact_payload", { code: error.code ?? "", message: "" });
    return refuse(code === "privacy_export_expired" ? 410 : 404, governanceErrorMessage(code));
  }
  return jsonDownload(data, "demande-donnees-very-pink-club");
}
