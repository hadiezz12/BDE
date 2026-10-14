import type { Metadata, Viewport } from "next";
import { archivo, spaceMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Very Pink Club — BDE GEM Paris",
    template: "%s · Very Pink Club",
  },
  description:
    "Soirées, associations, recrutements et vie de campus du BDE de GEM Alpine Business School, campus de Paris.",
  applicationName: "Very Pink Club",
};

export const viewport: Viewport = {
  themeColor: "#0c0a0e",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={`${archivo.variable} ${spaceMono.variable}`}>
      <body data-surface="night" className="min-h-dvh">
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:bg-accent focus:px-4 focus:py-3 focus:text-accent-fg type-button"
        >
          Aller au contenu
        </a>
        {children}
      </body>
    </html>
  );
}
