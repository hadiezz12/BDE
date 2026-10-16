/**
 * Colour theme of the public site. "dark" is the club's night surface (the
 * maquette, and the default); "light" is the same site by day. The visitor's
 * choice lives in a cookie so the server renders the right colours on the
 * first paint, without a flash. Paper and studio surfaces are light in both.
 */
export type Theme = "dark" | "light";

export const THEME_COOKIE = "vpc-theme";

/** Browser chrome colour (address bar on phones), matching the page background. */
export const THEME_COLOR: Record<Theme, string> = {
  dark: "#0c0a0e",
  light: "#fdf9fb",
};

export function parseTheme(value: string | undefined | null): Theme {
  return value === "light" ? "light" : "dark";
}
