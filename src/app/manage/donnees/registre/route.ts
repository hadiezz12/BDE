import { getAuthContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import { governanceErrorCode, governanceErrorMessage } from "@/lib/governance/messages";
import { jsonDownload, refuse, sameOrigin } from "@/lib/privacy/download";

/**
 * POST /manage/donnees/registre — a copy of the erasure ledger for the privacy
 * officer (Phase 15, defect D1): one-way keys, dates and request references,
 * nothing that was erased. Kept outside the database, it is what re-applies
 * erasures after a restore. public.export_erasure_ledger checks the officer's
 * key and the second factor, and records the download.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return refuse(403, "Téléchargement refusé : il doit partir du site lui-même.");
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return refuse(401, governanceErrorMessage("not_authenticated"));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("export_erasure_ledger");
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError("export_erasure_ledger", { code: error.code ?? "", message: "" });
    return refuse(code === "mfa_required" ? 403 : code === "insufficient_permission" ? 403 : 400, governanceErrorMessage(code));
  }
  return jsonDownload(data, "registre-effacements-very-pink-club");
}
