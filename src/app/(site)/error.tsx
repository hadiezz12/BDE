"use client";

import { useEffect } from "react";
import { StatePage } from "@/components/states/StatePage";
import { Button, ButtonLink } from "@/components/ui/Button";
import { routes } from "@/lib/routes";

/** Runtime error inside the public shell — header and footer stay usable. */
export default function SiteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <StatePage
      code="Oups"
      flicker
      kicker={error.digest ? `Erreur · réf. ${error.digest}` : "Erreur"}
      title="Un câble a sauté pendant le chargement."
      actions={
        <>
          <Button onClick={reset} icon="arrow-right">
            Réessayer
          </Button>
          <ButtonLink href={routes.home} variant="secondary">
            Retour à l&apos;accueil
          </ButtonLink>
        </>
      }
    >
      Ce n&apos;est pas toi. Réessaie dans un instant ; si ça continue, préviens le bureau en permanence au local B-12.
    </StatePage>
  );
}
