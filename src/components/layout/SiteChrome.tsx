import type { ReactNode } from "react";
import { getSession } from "@/lib/session";
import { getManageEntries } from "@/lib/governance/entries";
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
  // Search asks the database when something is typed (/api/search): no
  // index is read or shipped with every page.
  const [session, managed, notifications] = await Promise.all([
    getSession(),
    getManageEntries(),
    getMyNotificationSummary(),
  ]);

  return (
    <div className="flex min-h-dvh flex-col pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] lg:pb-0">
      <AuthListener />
      <SiteHeader session={session} managed={managed} notifications={notifications} />
      <main id="contenu" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <MobileTabBar />
    </div>
  );
}
