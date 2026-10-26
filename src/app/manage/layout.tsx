import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getSession } from "@/lib/session";
import { getManageEntries } from "@/lib/governance/entries";
import { ManageTopBar } from "@/components/manage/ManageTopBar";
import { ManageFooter } from "@/components/manage/ManageFrame";
import { DoneAnnouncer } from "@/components/manage/governance/DoneAnnouncer";

export const metadata: Metadata = {
  title: { template: "%s · Espace assos", default: "Espace assos" },
  robots: { index: false, follow: false },
};

/**
 * The association workspace has its own chrome, not the public SiteChrome:
 * ink top bar (brand, back to the site, account), studio surface below.
 * /manage/[asso] adds the section nav and <main>; the other screens
 * (chooser, BDE control center, continuity) bring their own ManageMain.
 *
 * Signing in grants nothing here: each screen asks the database what this
 * person may see (public.my_access and the governance read functions), and
 * every action is checked again by the database.
 */
export default async function ManageLayout({ children }: { children: ReactNode }) {
  const [session, managed] = await Promise.all([getSession(), getManageEntries()]);
  return (
    <div data-surface="studio" className="flex min-h-dvh flex-col">
      <ManageTopBar session={session} managed={managed} />
      <div className="flex flex-1 flex-col">{children}</div>
      <ManageFooter />
      <DoneAnnouncer />
    </div>
  );
}
