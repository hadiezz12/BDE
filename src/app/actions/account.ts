"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/auth/context";
import { AUTH_MESSAGES, classifyAuthError } from "@/lib/auth/messages";
import { safeNextPath } from "@/lib/auth/next-path";
import {
  AVATAR_CONTENT_TYPE,
  AVATAR_MAX_BYTES,
  sniffImage,
  validateProfileInput,
  type ProfileErrors,
  type ProfileInput,
} from "@/lib/auth/profile-input";
import { DataError, logDataError } from "@/lib/data/errors";
import { getMyProfile, setMyAvatarPath, updateMyProfile } from "@/lib/data/profile";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * The student's own account: profile, avatar, two-factor authentication.
 * Each action starts with requireUser(): the user id always comes from the
 * verified session, never from the form. Row level security on profiles and
 * on the avatars bucket enforces the same rule a second time.
 */

export interface ProfileFormState {
  status: "idle" | "saved" | "error";
  errors?: ProfileErrors;
  message?: string;
  /** What was submitted, so the form shows it again after React resets it. */
  values?: Partial<ProfileInput>;
}

function submitted(form: FormData): Partial<ProfileInput> {
  const text = (name: string) => String(form.get(name) ?? "");
  const year = Number(form.get("studyYear"));
  return {
    firstName: text("firstName"),
    lastName: text("lastName"),
    displayName: text("displayName") || null,
    program: text("program") || null,
    studyYear: Number.isInteger(year) && year > 0 ? year : null,
  };
}

export interface AvatarState {
  status: "idle" | "saved" | "removed" | "error";
  message?: string;
}

export interface MfaState {
  status: "idle" | "enabled" | "removed" | "error";
  message?: string;
}

export type EnrollmentStart =
  | { status: "ready"; factorId: string; qrCode: string; secret: string }
  | { status: "error"; message: string };

const failure = (error: unknown) =>
  error instanceof DataError ? error.userMessage : AUTH_MESSAGES.unknown;

/** First visit: name (required), the rest optional; then where the student was going. */
export async function completeOnboarding(_prev: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  await requireUser(routes.accountOnboarding);
  const result = validateProfileInput(form);
  if (!result.ok) return { status: "error", errors: result.errors, values: submitted(form) };
  try {
    await updateMyProfile(result.values, { completeOnboarding: true });
  } catch (error) {
    return { status: "error", message: failure(error), values: submitted(form) };
  }
  revalidatePath("/", "layout");
  redirect(safeNextPath(String(form.get("next") ?? "")) ?? routes.account);
}

export async function updateProfile(_prev: ProfileFormState, form: FormData): Promise<ProfileFormState> {
  await requireUser(routes.accountProfile);
  const result = validateProfileInput(form);
  if (!result.ok) return { status: "error", errors: result.errors, values: submitted(form) };
  try {
    await updateMyProfile(result.values);
  } catch (error) {
    return { status: "error", message: failure(error), values: submitted(form) };
  }
  revalidatePath("/", "layout");
  return { status: "saved", values: result.values };
}

/**
 * New profile picture. The server picks the path (the student's own folder,
 * a random name), checks the real file type from its bytes and the size,
 * uploads with the student's own session (storage policies apply), then
 * removes the previous picture.
 */
export async function uploadAvatar(_prev: AvatarState, form: FormData): Promise<AvatarState> {
  const user = await requireUser(routes.accountProfile);
  const file = form.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { status: "error", message: "Choisis une image." };
  if (file.size > AVATAR_MAX_BYTES) return { status: "error", message: "L'image fait plus de 2 Mo. Choisis-en une plus légère." };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) return { status: "error", message: "Formats acceptés : JPEG, PNG ou WebP." };

  const path = `${user.userId}/${crypto.randomUUID()}.${kind}`;
  const supabase = await createSupabaseServerClient();
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, bytes, { contentType: AVATAR_CONTENT_TYPE[kind], upsert: false, cacheControl: "3600" });
  if (uploadError) {
    logDataError("avatars.upload", { code: uploadError.name, message: uploadError.message });
    return { status: "error", message: "L'image n'a pas pu être envoyée. Réessaie." };
  }

  const previous = (await getMyProfile())?.avatarPath ?? null;
  try {
    await setMyAvatarPath(path);
  } catch (error) {
    await supabase.storage.from("avatars").remove([path]);
    return { status: "error", message: failure(error) };
  }
  if (previous && previous !== path) await supabase.storage.from("avatars").remove([previous]);
  revalidatePath("/", "layout");
  return { status: "saved" };
}

export async function removeAvatar(): Promise<AvatarState> {
  await requireUser(routes.accountProfile);
  const previous = (await getMyProfile())?.avatarPath ?? null;
  if (!previous) return { status: "removed" };
  try {
    await setMyAvatarPath(null);
  } catch (error) {
    return { status: "error", message: failure(error) };
  }
  const supabase = await createSupabaseServerClient();
  await supabase.storage.from("avatars").remove([previous]);
  revalidatePath("/", "layout");
  return { status: "removed" };
}

/**
 * Two-factor setup, step 1: a new authenticator factor. Returns the QR code
 * and the setup key for this screen only; they are not stored or logged.
 * The factor counts only once a code from the app is verified (step 2).
 */
export async function startTotpEnrollment(): Promise<EnrollmentStart> {
  await requireUser(routes.accountSecurity);
  const supabase = await createSupabaseServerClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { status: "error", message: AUTH_MESSAGES[classifyAuthError(listError)] };
  if (factors.totp.some((f) => f.status === "verified")) {
    return { status: "error", message: "La double authentification est déjà activée sur ton compte." };
  }
  // A setup abandoned halfway leaves an unverified factor: clear it first.
  for (const factor of factors.all) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Application d'authentification",
    issuer: "Very Pink Club",
  });
  if (error) return { status: "error", message: AUTH_MESSAGES[classifyAuthError(error)] };
  return { status: "ready", factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

/** Step 2: the first code from the app. On success the session becomes aal2. */
export async function confirmTotpEnrollment(_prev: MfaState, form: FormData): Promise<MfaState> {
  await requireUser(routes.accountSecurity);
  const factorId = String(form.get("factorId") ?? "");
  const code = String(form.get("code") ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return { status: "error", message: AUTH_MESSAGES.mfa_invalid };

  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (!factors?.all.some((f) => f.id === factorId)) return { status: "error", message: AUTH_MESSAGES.unknown };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { status: "error", message: AUTH_MESSAGES[classifyAuthError(error)] };
  revalidatePath("/", "layout");
  return { status: "enabled" };
}

/**
 * Turning it off needs a session that passed the second factor (aal2):
 * a stolen first-factor session cannot remove it. Supabase enforces the
 * same rule on its side.
 */
export async function removeTotpFactor(_prev: MfaState, form: FormData): Promise<MfaState> {
  const user = await requireUser(routes.accountSecurity);
  if (user.aal !== "aal2") return { status: "error", message: AUTH_MESSAGES.mfa_required };
  const factorId = String(form.get("factorId") ?? "");

  const supabase = await createSupabaseServerClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (!factors?.all.some((f) => f.id === factorId)) return { status: "error", message: AUTH_MESSAGES.unknown };

  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { status: "error", message: AUTH_MESSAGES[classifyAuthError(error)] };
  // The token still says aal2 until refreshed; refresh now so the session matches.
  await supabase.auth.refreshSession();
  revalidatePath("/", "layout");
  return { status: "removed" };
}
