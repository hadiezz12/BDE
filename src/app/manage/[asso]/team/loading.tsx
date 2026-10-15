import { ManageSkeleton } from "@/components/manage/ManageSkeleton";

export default function ManageTeamLoading() {
  return <ManageSkeleton label="Chargement de l'équipe…" stats={3} rows={8} />;
}
