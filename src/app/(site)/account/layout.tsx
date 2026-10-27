import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/auth/context";
import { withNext } from "@/lib/auth/next-path";
import { getMyProfile } from "@/lib/data/profile";
import { getMyNotificationSummary } from "@/lib/notifications/data";
import { PATHNAME_HEADER } from "@/lib/supabase/proxy";
import { AccountNav } from "@/components/account/AccountNav";
import { AccountUnavailable } from "@/components/account/AccountUnavailable";
import { DoneAnnouncer } from "@/components/manage/governance/DoneAnnouncer";

export const metadata: Metadata = {
  title: "Mon espace",
  robots: { index: false, follow: false },
};

/**
 * The student space: a paper surface (personal, calm, not a CRM) under the
 * night header, with its own tabs. Only for signed-in students (the proxy
 * already sends visitors to sign in; this checks again, from the verified
 * session). A first visit goes through the short profile form before
 * anything else. Personal data only ever comes from the student's own rows.
 */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const path = (await headers()).get(PATHNAME_HEADER) ?? routes.account;
  await requireUser(path);

  const profile = await getMyProfile();
  // Signed in but no profile row: the signup trigger failed. Say so, never guess.
  if (!profile) {
    return (
      <div data-surface="paper" className="grain">
        <AccountUnavailable />
      </div>
    );
  }

  const onboarding = path === routes.accountOnboarding;
  const notifications = onboarding ? null : await getMyNotificationSummary();
  if (!profile.onboardingCompleted && !onboarding) redirect(withNext(routes.accountOnboarding, path));

  return (
    <div data-surface="paper" className="grain pb-[var(--section)]">
      {!onboarding && <AccountNav unread={notifications?.unread ?? 0} />}
      {children}
      <DoneAnnouncer />
    </div>
  );
}
