import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import { governanceErrorCode, governanceErrorMessage } from "@/lib/governance/messages";
import { jsonDownload, refuse, sameOrigin } from "@/lib/privacy/download";

/**
 * POST /account/privacy/export — the person's own data as a JSON file
 * (Phase 14). public.my_personal_data reads only the signed-in person's rows,
 * records the export (never its content) and limits it to ten a day. Built
 * in memory, never stored, never cached. A POST from the site itself.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return refuse(403, "Téléchargement refusé : il doit partir du site lui-même.");
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return refuse(401, governanceErrorMessage("not_authenticated"));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_personal_data");
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError("my_personal_data", { code: error.code ?? "", message: "" });
    return refuse(code === "privacy_export_limit" ? 429 : 403, governanceErrorMessage(code));
  }
  return jsonDownload(data, "mes-donnees-very-pink-club");
}
