import type { ReactNode } from "react";
import { getSession } from "@/lib/session";
import { getManageEntries } from "@/lib/governance/entries";
import { getSearchIndex } from "@/lib/data/search";
import { getMyNotificationSummary } from "@/lib/notifications/data";
import { AuthListener } from "@/components/auth/AuthListener";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { MobileTabBar } from "./MobileTabBar";

/** Public + student-account shell: header, page, paper footer, phone tab bar. */
export async function SiteChrome({ children }: { children: ReactNode }) {
  // Rendered on the server from the verified session: no signed-out flash
  // before the header knows who is there. "Gérer" lists what the database
  // says this person may manage right now (public.my_access).
  const [session, searchIndex, managed, notifications] = await Promise.all([
    getSession(),
    getSearchIndex(),
    getManageEntries(),
    getMyNotificationSummary(),
  ]);

  return (
    <div className="flex min-h-dvh flex-col pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] lg:pb-0">
      <AuthListener />
      <SiteHeader session={session} managed={managed} searchIndex={searchIndex} notifications={notifications} />
      <main id="contenu" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}
