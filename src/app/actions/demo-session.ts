"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_ROLE_COOKIE, parseDemoRole } from "@/lib/demo-session";

/** Only same-site relative paths, never "//host" or absolute URLs. */
function safeRedirect(value: FormDataEntryValue | null): string {
  const path = typeof value === "string" ? value : "/";
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
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
