import type { ReactNode } from "react";
import { getSession } from "@/lib/demo-session";
import { getAssociationsByIds, toRef } from "@/lib/data/associations";
import { getSearchIndex } from "@/lib/data/search";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { MobileTabBar } from "./MobileTabBar";

/** Public + student-account shell: header, page, paper footer, phone tab bar. */
export async function SiteChrome({ children }: { children: ReactNode }) {
  const session = await getSession();
  const [managed, searchIndex] = await Promise.all([
    getAssociationsByIds(session.user?.managedAssociationIds ?? []),
    getSearchIndex(),
  ]);

  return (
    <div className="flex min-h-dvh flex-col pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] lg:pb-0">
      <SiteHeader session={session} managed={managed.map(toRef)} searchIndex={searchIndex} />
      <main id="contenu" className="flex-1">
        {children}
      </main>
      <SiteFooter role={session.role} />
      <MobileTabBar />
    </div>
  );
}
