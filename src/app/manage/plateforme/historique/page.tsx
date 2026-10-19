import type { Metadata } from "next";
import { getGovernanceHistory } from "@/lib/governance/queries";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { AuditList } from "@/components/manage/governance/GovernanceBlocks";
import { Notice } from "@/components/manage/governance/Notices";

export const metadata: Metadata = { title: "Historique" };

/**
 * /manage/plateforme/historique — the governance history of the whole
 * platform (public.governance_history, platform.audit.view): every
 * creation, status change, invitation, position, delegation and passation.
 * Append-only in the database: no one can edit or delete a line from the site.
 */
export default async function PlatformHistoryPage() {
  const history = await getGovernanceHistory(null, 150);
  return (
    <div className="flex flex-col gap-10">
      <ManagePageHeader
        kicker="Centre de contrôle BDE"
        title="Historique"
        description={<p>Les 150 dernières actions de gouvernance, toutes assos confondues. Les candidatures n&apos;y figurent jamais.</p>}
      />
      <ManageSection title="Dernières actions">
        {history.ok ? (
          <AuditList events={history.data} showOrganization />
        ) : (
          <Notice tone="danger" icon="alert" title="L'historique n'a pas pu être chargé." />
        )}
      </ManageSection>
    </div>
  );
}
