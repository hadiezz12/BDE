import { ManageSkeleton } from "@/components/manage/ManageSkeleton";

export default function ManageAnalyticsLoading() {
  return <ManageSkeleton label="Calcul des statistiques…" stats={4} rows={6} />;
}
