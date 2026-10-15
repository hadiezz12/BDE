import "server-only";
import { cache } from "react";
import type { Tables } from "@/types/database.types";
import { getAuthContext } from "@/lib/auth/context";
import type { ProfileInput } from "@/lib/auth/profile-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { DataError, logDataError, toDataError } from "./errors";

/**
 * The signed-in student's own profile: the only place that reads or writes
 * public.profiles. Every call works on the profile of the verified session
 * user; no function takes a user id from the caller, and row level security
 * would refuse anyone else's row anyway.
 */

export interface StudentProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  avatarPath: string | null;
  program: string | null;
  studyYear: number | null;
  onboardingCompleted: boolean;
}

const COLUMNS = "id, first_name, last_name, display_name, avatar_path, program, study_year, onboarding_completed_at";

type ProfileRow = Pick<
  Tables<"profiles">,
  "id" | "first_name" | "last_name" | "display_name" | "avatar_path" | "program" | "study_year" | "onboarding_completed_at"
>;

function toStudentProfile(row: ProfileRow): StudentProfile {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    program: row.program,
    studyYear: row.study_year,
    onboardingCompleted: row.onboarding_completed_at !== null,
  };
}

/**
 * The current student's profile; null when signed out. A signed-in user
 * without a row means the signup trigger failed: that is logged and surfaced
 * as an error, never hidden.
 */
export const getMyProfile = cache(async (): Promise<StudentProfile | null> => {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("profiles").select(COLUMNS).eq("id", ctx.userId).maybeSingle();
  if (error) {
    logDataError("profiles.select", error);
    throw toDataError(error);
  }
  if (!data) {
    logDataError("profiles.missing", { code: "PGRST116", message: "no profile row for the signed-in user" });
    return null;
  }
  return toStudentProfile(data);
});

/** Short-lived URL of the student's own avatar (private bucket), or null. */
export const getAvatarUrl = cache(async (path: string | null): Promise<string | null> => {
  if (!path) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
  if (error) {
    logDataError("avatars.sign", { code: error.name, message: error.message });
    return null;
  }
  return data.signedUrl;
});

async function updateOwn(
  values: Partial<Pick<ProfileRow, "first_name" | "last_name" | "display_name" | "program" | "study_year" | "onboarding_completed_at" | "avatar_path">>,
  where: string,
) {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") throw new DataError("forbidden", "Reconnecte-toi pour modifier ton profil.");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("profiles").update(values).eq("id", ctx.userId).select("id");
  if (error) {
    logDataError(where, error);
    throw toDataError(error);
  }
  if (!data?.length) {
    logDataError(where, { code: "no_row", message: "profile update matched no row" });
    throw new DataError("forbidden", "Ton profil n'a pas pu être enregistré. Reconnecte-toi et réessaie.");
  }
}

/** Saves the editable fields. With `completeOnboarding`, also marks the first-visit form as done. */
export async function updateMyProfile(input: ProfileInput, options: { completeOnboarding?: boolean } = {}) {
  await updateOwn(
    {
      first_name: input.firstName,
      last_name: input.lastName,
      display_name: input.displayName,
      program: input.program,
      study_year: input.studyYear,
      ...(options.completeOnboarding ? { onboarding_completed_at: new Date().toISOString() } : {}),
    },
    "profiles.update",
  );
}

/** Points the profile at a new avatar object (already uploaded into the student's folder), or clears it. */
export async function setMyAvatarPath(path: string | null) {
  await updateOwn({ avatar_path: path }, "profiles.avatar");
}

/**
 * Names the school's sign-in provider sent (Microsoft/Google), to pre-fill
 * the first-visit form only. Never treated as verified or authoritative,
 * and never used for any decision: the student confirms or corrects them.
 */
export async function getProviderNameHint(): Promise<{ firstName: string | null; lastName: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = meta[key];
      if (typeof value === "string" && value.trim() && value.trim().length <= 60) return value.trim();
    }
    return null;
  };
  return { firstName: pick("given_name", "first_name"), lastName: pick("family_name", "last_name") };
}
