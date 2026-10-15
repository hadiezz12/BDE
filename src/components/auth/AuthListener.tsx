"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Supabase's session cookie (possibly split into .0, .1…). Its value is never read. */
const SESSION_COOKIE = /(?:^|;\s*)sb-[^=;]*-auth-token(?:\.\d+)?=/;

/**
 * Keeps open tabs in step with the account: signing in or out in one tab
 * re-renders the others (from the server) the next time they come to the
 * front. Only notices that the session cookie appeared or disappeared;
 * protected pages re-check the session on the server anyway.
 */
export function AuthListener() {
  const router = useRouter();

  useEffect(() => {
    let present = SESSION_COOKIE.test(document.cookie);
    const check = () => {
      if (document.visibilityState !== "visible") return;
      const now = SESSION_COOKIE.test(document.cookie);
      if (now !== present) {
        present = now;
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [router]);

  return null;
}
