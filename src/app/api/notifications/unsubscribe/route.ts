import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";

/**
 * POST /api/notifications/unsubscribe?t=<token> — the one-click unsubscribe
 * of RFC 8058, sent by the mail client itself (List-Unsubscribe-Post) with
 * no session and no page. The token, 64 hex characters made for one person
 * and one topic, is the only proof; public.unsubscribe_with_token turns that
 * topic's e-mails off (never an essential topic) and records the choice.
 * The answer never says whose token it was.
 *
 * A GET (someone pasting the address in a browser) changes nothing: it
 * goes to the page /notifications/desabonnement, which asks first.
 */
export function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  const page = new URL("/notifications/desabonnement", request.url);
  if (/^[0-9a-f]{64}$/.test(token)) page.searchParams.set("t", token);
  return new Response(null, { status: 303, headers: { Location: page.toString(), "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("t") ?? "";
  if (!token) {
    const form = await request.formData().catch(() => null);
    token = String(form?.get("t") ?? "");
  }
  if (!/^[0-9a-f]{64}$/.test(token)) return new Response(null, { status: 400 });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("unsubscribe_with_token", { p_token: token });
  if (error) {
    logDataError("unsubscribe_with_token", { code: error.code ?? "", message: "" });
    return new Response(null, { status: 503 });
  }
  return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
}
