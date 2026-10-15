import type { ReactNode } from "react";
import { getSession } from "@/lib/session";
import { MANAGE_PREVIEW } from "@/lib/manage-preview";
import { getSearchIndex } from "@/lib/data/search";
import { AuthListener } from "@/components/auth/AuthListener";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { MobileTabBar } from "./MobileTabBar";

/** Public + student-account shell: header, page, paper footer, phone tab bar. */
export async function SiteChrome({ children }: { children: ReactNode }) {
  // Rendered on the server from the verified session: no signed-out flash
  // before the header knows who is there. Nobody manages an association
  // before Phase 4, so the header never offers "Gérer".
  const [session, searchIndex] = await Promise.all([getSession(), getSearchIndex()]);

  return (
    <div className="flex min-h-dvh flex-col pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] lg:pb-0">
      <AuthListener />
      <SiteHeader session={session} managed={[]} searchIndex={searchIndex} />
      <main id="contenu" className="flex-1">
        {children}
      </main>
      <SiteFooter managePreview={MANAGE_PREVIEW} />
      <MobileTabBar />
    </div>
  );
}
