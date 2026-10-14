"use client";

import { Button, type ButtonSize, type ButtonVariant } from "@/components/ui/Button";
import { useApply } from "./ApplyProvider";

/** Opens the campaign's apply dialog, optionally with a role preselected. */
export function ApplyTrigger({
  positionId,
  variant = "assoc",
  size = "md",
  block,
  className,
  children,
}: {
  positionId?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const openApply = useApply();
  return (
    <Button
      variant={variant}
      size={size}
      block={block}
      icon="arrow-right"
      aria-haspopup="dialog"
      className={className}
      onClick={() => openApply(positionId)}
    >
      {children}
    </Button>
  );
}
