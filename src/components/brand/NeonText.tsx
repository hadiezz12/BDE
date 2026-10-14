import type { CSSProperties, ElementType, ReactNode } from "react";
import { cx } from "@/lib/cx";

/**
 * Neon-tube lettering — the maquette's "effet néon clignotant". Use for one
 * lit word per screen at most (the hero, a "ce soir"), never for body copy.
 * The flicker respects prefers-reduced-motion (globals.css).
 */
const TONES = {
  pink: "#fa0479",
  cyan: "#12d8f0",
  green: "#45f27a",
  amber: "#ffb81c",
  assoc: "var(--assoc)",
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
  return (
    <Tag className={cx("neon", flicker && "neon-flicker", className)} style={{ "--neon": TONES[tone] } as CSSProperties}>
      {children}
    </Tag>
  );
}
