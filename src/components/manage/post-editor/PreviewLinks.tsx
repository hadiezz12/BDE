"use client";

import type { MouseEvent } from "react";
import { buttonClass, type ButtonSize, type ButtonVariant } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * Opens the private preview in a new tab. The preview shows the saved
 * version: with changes still pending, the tab opens at once (a popup
 * blocker would refuse it later) and loads the preview once they are
 * saved, so what it shows is what was just typed.
 */
export function PreviewLink({
  href,
  label,
  icon = "eye",
  unsaved,
  save,
  variant = "secondary",
  size = "sm",
  className,
}: {
  href: string;
  label: string;
  icon?: IconName;
  unsaved: boolean;
  save: () => Promise<boolean>;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (!unsaved || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    const tab = window.open("", "_blank");
    void save().then(() => {
      if (tab) tab.location.href = href;
      else window.open(href, "_blank", "noopener");
    });
  }
  return (
    <a href={href} target="_blank" rel="noopener" onClick={open} className={buttonClass({ variant, size, className })}>
      <Icon name={icon} size={18} />
      {label}
      <span className="sr-only"> (nouvel onglet)</span>
    </a>
  );
}
