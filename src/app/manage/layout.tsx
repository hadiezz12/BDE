import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getSession } from "@/lib/demo-session";
import { getManagedAssociations } from "@/lib/data/manage";
import { ManageTopBar } from "@/components/manage/ManageTopBar";
import { ManageFooter } from "@/components/manage/ManageFrame";

export const metadata: Metadata = {
  title: { template: "%s · Espace assos", default: "Espace assos" },
  robots: { index: false, follow: false },
};

/**
 * The association workspace has its own chrome, not the public SiteChrome:
 * ink top bar (brand, back to the site, account), studio surface below, demo
 * switcher at the bottom. /manage/[asso] adds the section nav and <main>.
 */
export default async function ManageLayout({ children }: { children: ReactNode }) {
  const [session, managed] = await Promise.all([getSession(), getManagedAssociations()]);
  return (
    <div data-surface="studio" className="flex min-h-dvh flex-col">
      <ManageTopBar session={session} managed={managed} />
      <div className="flex flex-1 flex-col">{children}</div>
      <ManageFooter role={session.role} />
    </div>
  );
}
