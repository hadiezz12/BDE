import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** The student's authenticator (TOTP) status, from Supabase Auth: verified factors only count. */
export async function getMyMfaStatus(): Promise<{ enabled: boolean; factorId: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return { enabled: false, factorId: null };
  const factor = data.totp.find((f) => f.status === "verified") ?? null;
  return { enabled: Boolean(factor), factorId: factor?.id ?? null };
}
