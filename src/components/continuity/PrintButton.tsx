"use client";

import { Button } from "@/components/ui/Button";

/** Opens the browser's print dialog (save as PDF from there). */
export function PrintButton({ label = "Imprimer ou enregistrer en PDF" }: { label?: string }) {
  return (
    <Button type="button" variant="secondary" size="sm" icon="file" onClick={() => window.print()} className="print:hidden">
      {label}
    </Button>
  );
}
