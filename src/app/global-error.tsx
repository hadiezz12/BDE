"use client";

import { archivo, spaceMono } from "./fonts";
import "./globals.css";

/** Last-resort boundary when the root layout itself fails. Kept dependency-free. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr" className={`${archivo.variable} ${spaceMono.variable}`}>
      <body data-surface="night" className="grid min-h-dvh place-items-center p-6">
        <main className="max-w-lg">
          <p className="neon type-numeral text-[8rem]">Oups</p>
          <h1 className="mt-4 type-title">Le site ne répond plus.</h1>
          <p className="mt-4 text-muted">Recharge la page dans un instant. Si le problème persiste, écris au bureau.</p>
          <button type="button" onClick={reset} className="mt-8 min-h-11 rounded-sm bg-accent px-5 type-button text-accent-fg">
            Recharger
          </button>
        </main>
      </body>
    </html>
  );
}
