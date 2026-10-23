import { ManageSkeleton } from "@/components/manage/ManageSkeleton";

export default function PlatformFeaturedLoading() {
  return <ManageSkeleton label="Chargement de la une…" stats={2} rows={6} />;
}
