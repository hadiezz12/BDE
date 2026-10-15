"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_ROLE_COOKIE, parseDemoRole } from "@/lib/demo-session";

/**
 * Only same-site relative paths: never "//host", absolute URLs, backslashes
 * (browsers read "/\host" as "//host") or control characters.
 */
function safeRedirect(value: FormDataEntryValue | null): string {
  const path = typeof value === "string" ? value : "/";
  const ok =
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\") &&
    ![...path].some((ch) => ch.charCodeAt(0) < 0x20 || ch.charCodeAt(0) === 0x7f);
  return ok ? path : "/";
}

/** Phase 1 demo switch between the visitor / student / officer states. */
export async function setDemoRole(formData: FormData) {
  const role = parseDemoRole(String(formData.get("role")));
  if (role) {
    (await cookies()).set(DEMO_ROLE_COOKIE, role, {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  redirect(safeRedirect(formData.get("redirectTo")));
}
