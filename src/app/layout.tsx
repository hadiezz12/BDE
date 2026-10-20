import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { parseTheme, THEME_COLOR, THEME_COOKIE } from "@/lib/theme";
import { siteUrl } from "@/lib/site-url";
import { archivo, spaceMono } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  // Absolute links in Open Graph and canonical tags: SITE_URL, once the BDE has its domain.
  metadataBase: siteUrl() ?? undefined,
  title: {
    default: "Very Pink Club — BDE GEM Paris",
    template: "%s · Very Pink Club",
  },
  description:
    "Soirées, associations, recrutements et vie de campus du BDE de GEM Alpine Business School, campus de Paris.",
  applicationName: "Very Pink Club",
};

async function currentTheme() {
  return parseTheme((await cookies()).get(THEME_COOKIE)?.value);
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await currentTheme();
  return { themeColor: THEME_COLOR[theme], colorScheme: theme === "light" ? "light" : "dark" };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // The night surface by default; the visitor's light choice comes from the cookie (lib/theme).
  const theme = await currentTheme();
  return (
    <html lang="fr" data-theme={theme} className={`${archivo.variable} ${spaceMono.variable}`}>
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
