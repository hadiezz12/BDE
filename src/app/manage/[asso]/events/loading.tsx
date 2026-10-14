import { ManageSkeleton } from "@/components/manage/ManageSkeleton";

export default function ManageEventsLoading() {
  return <ManageSkeleton label="Chargement des événements…" stats={3} rows={7} />;
}
