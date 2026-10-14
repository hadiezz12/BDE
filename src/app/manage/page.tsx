import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { getSession } from "@/lib/demo-session";
import { getManageNavCounts, getManagedAssociations } from "@/lib/data/manage";
import { getTasks } from "@/lib/data/users";
import { ManageMain } from "@/components/manage/ManageFrame";
import { ManageGateState } from "@/components/manage/ManageState";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import {
  ManagedAssociationList,
  type ManagedAssociationEntry,
} from "@/components/manage/chooser/ManagedAssociationList";

// The manage layout's "%s · Espace assos" template only reaches child segments,
// not this page of the same segment: name the workspace here.
export const metadata: Metadata = { title: "Tes associations · Espace assos" };

/**
 * /manage — the door of the association workspace.
 *  - visitor                     → log in first (same gate as the workspace)
 *  - logged in, manages nothing  → how one gets onto a bureau
 *  - manages exactly one         → straight to it
 *  - manages several             → pick one (each with what is waiting there)
 * The manage layout has no <main>: this page brings its own ManageMain.
 */
export default async function ManageChooserPage() {
  const [session, managed] = await Promise.all([getSession(), getManagedAssociations()]);

  if (!session.user) {
    return (
      <ManageMain>
        <ManageGateState reason="login" />
      </ManageMain>
    );
  }
  if (managed.length === 0) {
    return (
      <ManageMain>
        <ManageGateState reason="none" />
      </ManageMain>
    );
  }
  if (managed.length === 1) redirect(routes.manageHome(managed[0].slug));

  const user = session.user;
  const entries: ManagedAssociationEntry[] = await Promise.all(
    managed.map(async (association) => {
      const [tasks, counts] = await Promise.all([getTasks(association.id), getManageNavCounts(association.id)]);
      const urgent = tasks.filter((t) => t.priority === "haute").length;
      const facts = [
        tasks.length
          ? `${plural(tasks.length, "tâche")}${urgent ? ` dont ${plural(urgent, "urgente")}` : ""}`
          : "Rien sur la liste",
        counts.recruitment?.label,
        counts.content && plural(counts.content.count, "article en brouillon", "articles en brouillon"),
        counts.events && plural(counts.events.count, "événement en brouillon", "événements en brouillon"),
      ].filter((f): f is string => Boolean(f));
      return {
        association,
        role: user.memberships.find((m) => m.associationId === association.id)?.role,
        facts,
      };
    }),
  );

  return (
    <ManageMain>
      <div className="flex flex-col gap-8">
        <ManagePageHeader
          kicker="Espace assos"
          title="Tes associations"
          description={
            <p>
              Salut {user.firstName}, tu es au bureau de {plural(managed.length, "association")}. Chacune a sa propre
              adresse&nbsp;: tu peux les garder ouvertes côte à côte, dans plusieurs onglets.
            </p>
          }
        />
        <ManagedAssociationList entries={entries} />
      </div>
    </ManageMain>
  );
}
