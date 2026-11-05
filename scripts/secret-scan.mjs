#!/usr/bin/env node
/**
 * Secret scan (Phase 15, brief §67): fails when a privileged credential is in
 * the repository's tracked files or in the browser bundle.
 *
 *   node scripts/secret-scan.mjs              tracked files (git ls-files)
 *   node scripts/secret-scan.mjs --bundle     .next/static (after `npm run build`)
 *
 * It looks for the shapes of real secrets — Supabase secret keys, JWTs whose
 * role is service_role (publishable / anon tokens are public by design),
 * Brevo keys, private keys, database URLs carrying a password, AWS, GitHub
 * and Stripe live keys — and prints the file and line only, never the value.
 * Deliberately fake values used by tests are listed in ALLOWED with a reason.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const PATTERNS = [
  ["Supabase secret key", /sb_secret_[A-Za-z0-9_-]{20,}/g],
  ["Brevo API key", /xkeysib-[a-f0-9]{64}-[A-Za-z0-9]{16}/g],
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
  ["database URL with a password", /postgres(?:ql)?:\/\/[^:\s'"`/]+:[^@\s'"`]{6,}@[^\s'"`]+/g],
  ["AWS access key", /AKIA[0-9A-Z]{16}/g],
  ["GitHub token", /gh[pousr]_[A-Za-z0-9]{36,}/g],
  ["Stripe live key", /[sr]k_live_[0-9A-Za-z]{20,}/g],
  ["JWT", /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g],
];

/** Deliberately fake values: path → reason. A match there is reported as allowed, never silently. */
const ALLOWED = new Map([
  ["supabase/tests/database/continuity.test.sql", "synthetic secret-looking text: the register must refuse it (private.looks_secret)"],
]);

/** The secrets found in one text (kind and offset), JWTs only when privileged. Used by the CLI and the unit test. */
export function findSecrets(text) {
  const out = [];
  for (const [what, re] of PATTERNS) {
    for (const m of text.matchAll(re)) {
      if (what === "JWT" && !isPrivilegedJwt(m[0])) continue;
      out.push({ what, index: m.index });
    }
  }
  return out;
}

const isPrivilegedJwt = (token) => {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return payload.role === "service_role" || payload.role === "supabase_admin";
  } catch {
    return false;
  }
};

function files(bundle) {
  if (!bundle) {
    return execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
  }
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(js|mjs|css|json|html|txt|map)$/.test(name)) out.push(p);
    }
  };
  walk(".next/static");
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bundle = process.argv.includes("--bundle");
  let found = 0;
  let allowed = 0;
  let scanned = 0;
  for (const file of files(bundle)) {
    let text;
    try {
      if (statSync(file).size > 5 * 1024 * 1024) continue;
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (text.includes("\u0000")) continue; // binary
    scanned += 1;
    const path = file.replace(/\\/g, "/");
    for (const { what, index } of findSecrets(text)) {
      const where = `${path}:${text.slice(0, index).split("\n").length}`;
      if (ALLOWED.has(path)) {
        allowed += 1;
        console.log(`allowed  ${where}  ${what} — ${ALLOWED.get(path)}`);
      } else {
        found += 1;
        console.log(`FOUND    ${where}  ${what}`);
      }
    }
  }
  console.log(`secret scan (${bundle ? "browser bundle" : "tracked files"}): ${scanned} files, ${found} finding(s), ${allowed} allowed fake value(s)`);
  process.exit(found > 0 ? 1 : 0);
}
