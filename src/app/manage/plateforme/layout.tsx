import type { Metadata } from "next";
import type { ReactNode } from "react";
import { routes } from "@/lib/routes";
import { getAuthContext } from "@/lib/auth/context";
import { getMyAccess, hasPlatform } from "@/lib/governance/access";
import { canUsePlatform } from "@/lib/governance/workspace";
import { ButtonLink } from "@/components/ui/Button";
import { ManageMain } from "@/components/manage/ManageFrame";
import { ManageGateState, ManageStatePanel } from "@/components/manage/ManageState";
import { PageTabs } from "@/components/manage/governance/PageTabs";
import { Notice } from "@/components/manage/governance/Notices";
import { getHeartbeat } from "@/lib/continuity/data";

export const metadata: Metadata = { title: { template: "%s · Centre de contrôle BDE", default: "Centre de contrôle BDE" } };

/**
 * /manage/plateforme — the BDE control center, for the BDE's president and
 * vice-president while their mandate runs: it opens with any of its platform
 * rights (platform.organizations.manage, platform.content.moderate,
 * platform.content.feature, from my_access), and the tabs show only the
 * pages those rights open. The pages below check their own right again, and
 * every function they call checks it in the database.
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
  const access = await getMyAccess();
  if (!canUsePlatform(access)) {
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
  const can = (key: string) => hasPlatform(access, key);
  const tabs = [
    { href: routes.managePlatform, label: "Vue d'ensemble", exact: true, show: true },
    { href: routes.managePlatformOrganizations, label: "Assos", show: can("platform.governance.view") },
    { href: routes.managePlatformCategories, label: "Catégories", show: can("platform.organizations.manage") },
    { href: routes.managePlatformModeration, label: "Modération", show: can("platform.content.moderate") },
    { href: routes.managePlatformFeatured, label: "À la une", show: can("platform.content.feature") },
    {
      href: routes.managePlatformEvents,
      label: "Événements",
      show: can("platform.content.moderate") || can("platform.content.feature"),
    },
    {
      href: routes.managePlatformRecruitment,
      label: "Recrutements",
      show: can("platform.content.moderate") || can("platform.organizations.manage"),
    },
    {
      href: routes.managePlatformCommunications,
      label: "Communication",
      show: can("platform.communications.broadcast") || can("platform.communications.monitor"),
    },
    {
      href: routes.managePlatformContinuity,
      label: "Continuité",
      show: can("platform.organizations.manage") || can("platform.operations.monitor"),
    },
    { href: routes.managePlatformHistory, label: "Historique", show: can("platform.audit.view") },
  ];
  // Measured on every visit, so a scheduler that stopped altogether is seen without any job running.
  const heartbeat = can("platform.operations.monitor") ? await getHeartbeat() : null;
  return (
    <ManageMain>
      <div data-accent="rose" className="flex flex-col gap-8">
        <PageTabs label="Centre de contrôle BDE" tabs={tabs.filter((t) => t.show)} />
        {heartbeat?.jobs_on_time === false && (
          <Notice
            tone="danger"
            icon="alert"
            title="Des tâches automatiques essentielles sont en retard."
            action={
              <ButtonLink href={routes.managePlatformOperations} size="sm" icon="arrow-right">
                Voir les opérations
              </ButtonLink>
            }
          >
            <p>Publications programmées, e-mails ou rappels peuvent attendre. Les droits, eux, s&apos;arrêtent toujours à la fin des mandats.</p>
          </Notice>
        )}
        {children}
      </div>
    </ManageMain>
  );
}
