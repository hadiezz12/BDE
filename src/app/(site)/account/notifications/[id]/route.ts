import { notificationPath } from "@notify/catalog.ts";
import { getAuthContext } from "@/lib/auth/context";
import { withNext } from "@/lib/auth/next-path";
import { governanceErrorCode } from "@/lib/governance/messages";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logDataError } from "@/lib/data/errors";
import { routes } from "@/lib/routes";
import type { NotificationRow } from "@/lib/notifications/view";

/**
 * GET /account/notifications/<id> — opens one of one's notifications:
 * public.open_notification marks it read (one's own row only) and returns
 * it; the person is then sent to the page it is about, a path rebuilt from
 * validated ids (notificationPath), never a URL from the payload. That page
 * checks access again: a notification proves nothing. Linked with a plain
 * <a> (no prefetch), so only a real click marks it read.
 */

const redirect = (request: Request, path: string) =>
  new Response(null, { status: 303, headers: { Location: new URL(path, request.url).toString(), "Cache-Control": "private, no-store" } });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d{1,18}$/.test(id)) return redirect(request, routes.accountNotifications);
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return redirect(request, withNext(routes.login, routes.accountNotification(id)));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("open_notification", { p_id: Number(id) });
  if (error) {
    const code = governanceErrorCode(error);
    if (code === "unexpected" || code === "unavailable") logDataError("open_notification", { code: error.code ?? "", message: "" });
    return redirect(request, `${routes.accountNotifications}?introuvable=1`);
  }
  const row = data as unknown as NotificationRow;
  return redirect(
    request,
    notificationPath({
      kind: row.kind,
      payload: row.payload ?? {},
      event_id: row.event_id,
      application_id: row.application_id,
      resource_type: row.resource_type,
      resource_id: row.resource_id,
      organization: row.organization,
    }),
  );
}
