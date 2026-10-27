import type { ReactNode } from "react";
import { routes } from "@/lib/routes";
import { getMyAccess, hasPlatform } from "@/lib/governance/access";
import { PageTabs } from "@/components/manage/governance/PageTabs";
import { PlatformDenied } from "@/components/manage/moderation/PlatformDenied";

/**
 * /manage/plateforme/continuite — the site's continuity, for the BDE office
 * holders while their mandate runs: governance health and the academic year
 * (platform.organizations.manage), operations and the institutional
 * register (platform.operations.monitor). Each page checks its own key, and
 * every function it calls checks it again in the database.
 */
export default async function ContinuityLayout({ children }: { children: ReactNode }) {
  const access = await getMyAccess();
  const governance = hasPlatform(access, "platform.organizations.manage");
  const operations = hasPlatform(access, "platform.operations.monitor");
  if (!governance && !operations) return <PlatformDenied title="Continuité" right="Suivre la continuité du site" />;
  const tabs = [
    { href: routes.managePlatformContinuity, label: "Vue d'ensemble", exact: true, show: true },
    { href: routes.managePlatformYear, label: "Année universitaire", show: governance },
    { href: routes.managePlatformHandover, label: "Rapport de passation", show: governance },
    { href: routes.managePlatformOperations, label: "Opérations", show: operations },
    { href: routes.managePlatformRegister, label: "Registre et sauvegardes", show: operations },
    { href: routes.managePlatformRetention, label: "Conservation", show: governance },
  ];
  return (
    <div className="flex flex-col gap-8">
      <PageTabs label="Continuité" tabs={tabs.filter((t) => t.show)} />
      {children}
    </div>
  );
}
