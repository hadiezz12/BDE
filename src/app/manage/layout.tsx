import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getSession } from "@/lib/session";
import { MANAGE_PREVIEW } from "@/lib/manage-preview";
import { ManageTopBar } from "@/components/manage/ManageTopBar";
import { ManageFooter, ManageMain } from "@/components/manage/ManageFrame";
import { ManageUnavailable } from "@/components/manage/ManageUnavailable";

export const metadata: Metadata = {
  title: { template: "%s · Espace assos", default: "Espace assos" },
  robots: { index: false, follow: false },
};

/**
 * The association workspace has its own chrome, not the public SiteChrome:
 * ink top bar (brand, back to the site, account), studio surface below.
 * /manage/[asso] adds the section nav and <main>.
 *
 * Signing in grants no management right. In production every visitor, signed
 * in or not, gets "not available yet" until Phase 4 brings real, scoped
 * permissions; the section pages below are never rendered. In development the
 * shell stays reviewable with fictional data (lib/manage-preview.ts).
 */
export default async function ManageLayout({ children }: { children: ReactNode }) {
  // The top bar shows the real account (to reach "Mon espace" or sign out),
  // never as someone who manages anything.
  const session = await getSession();
  return (
    <div data-surface="studio" className="flex min-h-dvh flex-col">
      <ManageTopBar session={session} managed={[]} />
      <div className="flex flex-1 flex-col">
        {MANAGE_PREVIEW ? (
          children
        ) : (
          <ManageMain>
            <ManageUnavailable />
          </ManageMain>
        )}
      </div>
      <ManageFooter preview={MANAGE_PREVIEW} />
    </div>
  );
}
