import type { Metadata } from "next";
import type { ReactNode } from "react";
import { routes } from "@/lib/routes";
import { getAuthContext } from "@/lib/auth/context";
import { getMyAccess } from "@/lib/governance/access";
import { canUsePlatform } from "@/lib/governance/workspace";
import { ButtonLink } from "@/components/ui/Button";
import { ManageMain } from "@/components/manage/ManageFrame";
import { ManageGateState, ManageStatePanel } from "@/components/manage/ManageState";
import { PageTabs } from "@/components/manage/governance/PageTabs";

export const metadata: Metadata = { title: { template: "%s · Centre de contrôle BDE", default: "Centre de contrôle BDE" } };

/**
 * /manage/plateforme — the BDE control center, for the BDE's president and
 * vice-president while their mandate runs (platform.organizations.manage,
 * from my_access). The pages below check again, and every function they
 * call checks the platform permission itself.
 */
export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const ctx = await getAuthContext();
  if (ctx.status !== "authenticated") {
    return (
      <ManageMain>
        <ManageGateState reason="login" />
      </ManageMain>
    );
  }
  if (!canUsePlatform(await getMyAccess())) {
    return (
      <ManageMain>
        <ManageStatePanel
          kicker="Réservé à la direction du BDE"
          title="Le centre de contrôle est réservé à la présidence et à la vice-présidence du BDE."
          actions={
            <ButtonLink href={routes.manage} icon="arrow-right">
              Mes espaces
            </ButtonLink>
          }
        >
          <p>L&apos;accès suit le mandat&nbsp;: il s&apos;ouvre à la date de début et se ferme à la date de fin, sans autre réglage.</p>
        </ManageStatePanel>
      </ManageMain>
    );
  }
  return (
    <ManageMain>
      <div data-accent="rose" className="flex flex-col gap-8">
        <PageTabs
          label="Centre de contrôle BDE"
          tabs={[
            { href: routes.managePlatform, label: "Vue d'ensemble", exact: true },
            { href: routes.managePlatformOrganizations, label: "Assos" },
            { href: routes.managePlatformCategories, label: "Catégories" },
            { href: routes.managePlatformHistory, label: "Historique" },
          ]}
        />
        {children}
      </div>
    </ManageMain>
  );
}
