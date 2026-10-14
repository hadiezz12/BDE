import type { AccentKey } from "./types";

/**
 * Association accents are a closed palette taken from the BDE's neon event
 * emblems. An association picks a key; the matching CSS custom properties live
 * in globals.css under [data-accent="…"], each pre-checked for WCAG AA on the
 * night, paper and studio surfaces. Components never receive raw hex values.
 */
export const ACCENTS: Record<AccentKey, { label: string; swatch: string }> = {
  rose: { label: "Rose panthère", swatch: "#FA0479" },
  cyan: { label: "Cyan WEI", swatch: "#12D8F0" },
  violet: { label: "Violet Boo", swatch: "#B14CF0" },
  vert: { label: "Vert désintégration", swatch: "#3BE36B" },
  or: { label: "Or apéro", swatch: "#F5BC12" },
  bleu: { label: "Bleu barathon", swatch: "#3D8BFF" },
  orange: { label: "Orange listes", swatch: "#FF8A1F" },
  corail: { label: "Corail", swatch: "#FF5A5F" },
};

export const ACCENT_KEYS = Object.keys(ACCENTS) as AccentKey[];
