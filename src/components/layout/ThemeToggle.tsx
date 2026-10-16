"use client";

import { useSyncExternalStore } from "react";
import { parseTheme, THEME_COLOR, THEME_COOKIE, type Theme } from "@/lib/theme";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";

/**
 * Light / dark switch. The theme is the data-theme attribute on <html>, set by
 * the server from the cookie; switching rewrites both, so every toggle on the
 * page (header, mobile sheet) follows through the attribute.
 *  - icon : square header button (sun by night, moon by day)
 *  - row  : full-width row with a switch, for the mobile account sheet
 */
export function ThemeToggle({ variant = "icon", className }: { variant?: "icon" | "row"; className?: string }) {
  const theme = useSyncExternalStore(subscribe, readTheme, () => null);
  const light = theme === "light";
  const toggle = () => applyTheme(light ? "dark" : "light");

  if (variant === "row") {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={theme === null ? undefined : light}
        onClick={toggle}
        className={cx("flex min-h-12 w-full items-center gap-3 rounded-sm px-2 font-bold hover:bg-fg/8", className)}
      >
        <Icon name="sun" size={20} className="text-muted" />
        Mode clair
        <span
          aria-hidden
          className="relative ml-auto h-6 w-11 shrink-0 rounded-full border-2 border-line-strong bg-sunken transition-colors light:border-fg light:bg-accent"
        >
          <span className="absolute left-0.5 top-0.5 size-4 rounded-full bg-fg transition-transform light:translate-x-5" />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={theme === null ? undefined : light}
      onClick={toggle}
      title="Mode clair"
      className={cx("inline-flex size-11 items-center justify-center rounded-sm hover:bg-fg/8", className)}
    >
      <Icon name="sun" size={21} className="light:hidden" />
      <Icon name="moon" size={20} className="hidden light:block" />
      <span className="sr-only">Mode clair</span>
    </button>
  );
}

function readTheme(): Theme {
  return parseTheme(document.documentElement.dataset.theme);
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[theme]);
}
