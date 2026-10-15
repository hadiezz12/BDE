import { ManageSkeleton } from "@/components/manage/ManageSkeleton";

export default function ManageMediaLoading() {
  return <ManageSkeleton label="Chargement des images…" rows={6} />;
}
