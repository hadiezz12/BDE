import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "./Icon";

/**
 * The wordmark's sticker, as a label: flat fill, white keyline on night,
 * ink outline + offset shadow on paper. For short, loud facts only
 * ("Ce soir", "3 postes", "Complet"). Dense admin lists use StatusBadge.
 */
export type StickerTone = "accent" | "assoc" | "cream" | "blush" | "ink" | "ok" | "warn" | "danger" | "info";

const TONES: Record<StickerTone, { bg: string; fg: string }> = {
  accent: { bg: "var(--accent)", fg: "var(--accent-fg)" },
  assoc: { bg: "var(--assoc)", fg: "var(--assoc-fg)" },
  cream: { bg: "#fdf7e9", fg: "#0c0a0e" },
  blush: { bg: "#ffc6dc", fg: "#0c0a0e" },
  ink: { bg: "#0c0a0e", fg: "#f7f1f4" },
  ok: { bg: "#45f27a", fg: "#0c0a0e" },
  warn: { bg: "#ffb81c", fg: "#0c0a0e" },
  danger: { bg: "#ff6b7a", fg: "#0c0a0e" },
  info: { bg: "#12d8f0", fg: "#0c0a0e" },
};

interface StickerProps {
  tone?: StickerTone;
  /** Rotation in degrees; small values (-4…4) read as hand-placed. */
  tilt?: number;
  icon?: IconName;
  size?: "sm" | "md";
  className?: string;
  children: ReactNode;
}

export function Sticker({ tone = "accent", tilt = 0, icon, size = "md", className, children }: StickerProps) {
  const t = TONES[tone];
  const style = {
    "--sticker-bg": t.bg,
    "--sticker-fg": t.fg,
    "--tilt": `${tilt}deg`,
  } as CSSProperties;
  return (
    <span className={cx("sticker", size === "sm" && "text-[0.65rem]", className)} style={style}>
      {icon && <Icon name={icon} size={size === "sm" ? 12 : 14} strokeWidth={2.25} />}
      {children}
    </span>
  );
}
