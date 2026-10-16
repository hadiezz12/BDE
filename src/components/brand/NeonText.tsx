import type { CSSProperties, ElementType, ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * Neon-tube lettering — the maquette's "effet néon clignotant". Use for one
 * lit word per screen at most (the hero, a "ce soir"), never for body copy.
 * Each tone is a pair: the tube's light by night, its printed ink by day and
 * on paper (AA on light surfaces). The flicker respects prefers-reduced-motion
 * (globals.css).
 */
const TONES = {
  pink: { lit: "#fa0479", ink: "#e1006a" },
  cyan: { lit: "#12d8f0", ink: "#00697f" },
  green: { lit: "#45f27a", ink: "#0b7336" },
  amber: { lit: "#ffb81c", ink: "#8a5a00" },
  assoc: { lit: "var(--assoc)", ink: "var(--assoc-text)" },
} as const;

export function NeonText({
  as: Tag = "span",
  tone = "pink",
  flicker,
  className,
  children,
}: {
  as?: ElementType;
  tone?: keyof typeof TONES;
  flicker?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { lit, ink } = TONES[tone];
  return (
    <Tag className={cx("neon", flicker && "neon-flicker", className)} style={{ "--neon": lit, "--neon-ink": ink } as CSSProperties}>
      {children}
    </Tag>
  );
}
