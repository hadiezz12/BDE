import { Archivo, Space_Mono } from "next/font/google";

/** Archivo with its width axis: expanded for display, condensed for posters. */
export const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

/** Metadata voice: times, counts, codes. Kept from the maquette. */
export const spaceMono = Space_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "700"],
  variable: "--font-space-mono",
  display: "swap",
});
