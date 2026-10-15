import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getSession } from "@/lib/demo-session";
import { getNotifications } from "@/lib/data/users";
import { AccountGate } from "@/components/account/AccountGate";
import { AccountNav } from "@/components/account/AccountNav";
import { academicSeason } from "@/components/account/account-facts";

export const metadata: Metadata = {
  title: "Mon espace",
  robots: { index: false, follow: false },
};

/**
 * The student space: a paper surface (personal, calm, not a CRM) under the
 * night header, with its own tabs. Visitors get the way in instead of any
 * data — here, once, for every /account page. A layout does not stop its
 * pages from rendering, so each page also returns nothing without a user.
 */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const session = await getSession();

  if (!session.user) {
    return (
      <div data-surface="paper" className="grain">
        <AccountGate season={academicSeason()} />
      </div>
    );
  }

  const unread = (await getNotifications(session.user.id)).filter((n) => !n.read).length;

  return (
    <div data-surface="paper" className="grain pb-[var(--section)]">
      <AccountNav unread={unread} />
      {children}
    </div>
  );
}
