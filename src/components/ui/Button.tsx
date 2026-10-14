import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "./Icon";

/**
 * Buttons are squared-off, heavy, uppercase — obvious controls. On paper they
 * get the sticker treatment (ink outline + offset shadow on hover); on night
 * the hover is a neon halo. Colours come from surface tokens, so the same
 * variant works on every surface. Pills are reserved for stickers.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "assoc" | "inverse" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "group/btn relative inline-flex shrink-0 items-center justify-center gap-2 rounded-sm border-2 type-button select-none " +
  "transition-[transform,box-shadow,background-color,border-color,color] duration-150 ease-out " +
  "disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45";

const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-fg border-btn-line " +
    "hover:-translate-y-px hover:shadow-press active:translate-y-0 active:shadow-none",
  assoc:
    "bg-assoc text-assoc-fg border-btn-line " +
    "hover:-translate-y-px hover:shadow-assoc-press active:translate-y-0 active:shadow-none",
  secondary: "bg-transparent text-fg border-line-strong hover:border-fg hover:bg-fg/5",
  ghost: "bg-transparent text-fg border-transparent hover:bg-fg/8",
  inverse: "bg-inverse text-on-inverse border-inverse hover:-translate-y-px active:translate-y-0",
  danger: "bg-transparent text-danger border-current hover:bg-danger/10",
};

const sizes: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-[0.75rem]",
  md: "min-h-11 px-5",
  lg: "min-h-14 px-7 text-[0.95rem]",
};

interface StyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconPosition?: "start" | "end";
  /** Stretch to the container width (mobile CTAs). */
  block?: boolean;
  className?: string;
  children?: ReactNode;
}

export function buttonClass({
  variant = "primary",
  size = "md",
  block,
  className,
}: Pick<StyleProps, "variant" | "size" | "block" | "className">) {
  return cx(base, variants[variant], sizes[size], block && "w-full", className);
}

function Content({ icon, iconPosition = "end", children }: Pick<StyleProps, "icon" | "iconPosition" | "children">) {
  const glyph = icon ? (
    <Icon
      name={icon}
      size={18}
      className={cx(
        "transition-transform duration-150",
        iconPosition === "end" && (icon.startsWith("arrow") ? "group-hover/btn:translate-x-0.5" : ""),
      )}
    />
  ) : null;
  return (
    <>
      {iconPosition === "start" && glyph}
      {children}
      {iconPosition === "end" && glyph}
    </>
  );
}

export function Button({
  variant,
  size,
  icon,
  iconPosition,
  block,
  className,
  children,
  type = "button",
  ...rest
}: StyleProps & Omit<ComponentProps<"button">, "className" | "children">) {
  return (
    <button type={type} className={buttonClass({ variant, size, block, className })} {...rest}>
      <Content icon={icon} iconPosition={iconPosition}>
        {children}
      </Content>
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  icon,
  iconPosition,
  block,
  className,
  children,
  ...rest
}: StyleProps & Omit<ComponentProps<typeof Link>, "className" | "children">) {
  return (
    <Link className={buttonClass({ variant, size, block, className })} {...rest}>
      <Content icon={icon} iconPosition={iconPosition}>
        {children}
      </Content>
    </Link>
  );
}
