// npm run db:check — confirms this checkout reaches the Supabase project that
// .env.local points at. Read-only: it touches no data, and it never prints a
// key. It reuses the app's own checks from src/lib/supabase/env.ts.
import process from "node:process";
import { getSupabasePublicEnv, isPrivilegedKey } from "../src/lib/supabase/env.ts";

for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

// Returns an error message, or null when everything checks out. The caller
// sets process.exitCode instead of calling process.exit(), which can crash
// Node on Windows while a fetch connection is still closing.
async function check() {
  // 1. No privileged key in any variable that would ship to the browser.
  for (const [name, value] of Object.entries(process.env)) {
    if (name.startsWith("NEXT_PUBLIC_") && value && isPrivilegedKey(value)) {
      return `${name} holds a secret or service_role key. Remove it and rotate that key in the Supabase dashboard.`;
    }
  }

  // 2. The public settings are present and well formed (same rules as the app).
  let env;
  try {
    env = getSupabasePublicEnv();
  } catch (error) {
    return error.message;
  }

  const host = new URL(env.url).host;
  const target = /^(127\.0\.0\.1|localhost)(:|$)/.test(host) ? "the local Supabase stack" : `project ${host.split(".")[0]}`;

  // 3. The project answers and accepts the publishable key. Auth settings are
  //    public configuration (which sign-in methods exist), not user data.
  let response;
  try {
    response = await fetch(`${env.url}/auth/v1/settings`, { headers: { apikey: env.publishableKey } });
    await response.arrayBuffer();
  } catch (error) {
    return `Could not reach ${host}: ${error.cause?.code ?? error.message}. Is the URL right, and is the local stack started (npm run db:start)?`;
  }
  if (response.status === 401 || response.status === 403) {
    return `${target} rejected NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (${response.status}). Copy the publishable key again (Dashboard → Settings → API Keys).`;
  }
  if (!response.ok) return `${target} answered ${response.status} on /auth/v1/settings.`;

  // 4. The secret key, when set, is at least the right kind. It is not sent anywhere.
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (secret && !isPrivilegedKey(secret)) {
    return "SUPABASE_SECRET_KEY is set but is not a secret key (expected sb_secret_...).";
  }

  console.log(`✓ Reached ${target} (${host}) with the publishable key.`);
  console.log(secret ? "✓ SUPABASE_SECRET_KEY is set (server only)." : "· SUPABASE_SECRET_KEY is not set — fine: nothing needs it yet.");
  return null;
}

const problem = await check();
if (problem) {
  console.error(`✗ ${problem}`);
  process.exitCode = 1;
}
