import { NextResponse, type NextRequest } from "next/server";
import { routes } from "@/lib/routes";
import { withNext } from "@/lib/auth/next-path";
import { updateSession } from "@/lib/supabase/proxy";

/**
 * Next.js 16 proxy (the former middleware): keeps the Supabase session fresh
 * and sends signed-out visitors from /account to the sign-in page.
 *
 * It is only a first gate. Every account page, layout and Server Action
 * checks the session again itself (lib/auth/context.ts), and the database
 * enforces row level security whatever happens here. Public pages never
 * require an account.
 */
export async function proxy(request: NextRequest) {
  const { response, claims } = await updateSession(request);
  const { pathname, search } = request.nextUrl;
  const personal = pathname === routes.account || pathname.startsWith(`${routes.account}/`);

  if (personal && !claims) {
    const url = request.nextUrl.clone();
    const target = withNext(routes.login, `${pathname}${search}`);
    url.pathname = routes.login;
    url.search = target.slice(routes.login.length);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  // Personal and sign-in pages are never stored by a shared cache.
  if (personal || pathname.startsWith(routes.login) || pathname.startsWith("/auth")) {
    response.headers.set("Cache-Control", "private, no-store");
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except Next's assets, images and the files in /public.
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
