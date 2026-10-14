"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Button } from "@/components/ui/Button";
import { DemoNotice } from "./DemoNotice";

/**
 * PHASE 1 form wrapper: submitting keeps everything the person typed and
 * shows the demo notice under the form instead of sending anything.
 * Use like a <form>; put the submit Button inside.
 */
export function DemoForm({
  notice,
  children,
  className,
  ...rest
}: Omit<ComponentProps<"form">, "onSubmit" | "action" | "children"> & {
  /** Overrides "rien n'est envoyé pour l'instant." */
  notice?: ReactNode;
  children: ReactNode;
}) {
  const [submits, setSubmits] = useState(0);
  return (
    <form
      {...rest}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        setSubmits((n) => n + 1);
      }}
    >
      {children}
      <div role="status" className={cx(submits > 0 && "mt-4")}>
        {/* Re-keyed on every submit so screen readers announce it again. */}
        {submits > 0 && <DemoNotice key={submits}>{notice}</DemoNotice>}
      </div>
    </form>
  );
}

/**
 * PHASE 1 action button ("Publier", "Exporter", "Relancer") that does nothing
 * but say so, inline, right under itself.
 */
export function DemoActionButton({
  notice,
  wrapperClassName,
  onClick,
  ...button
}: ComponentProps<typeof Button> & {
  /** Overrides "rien n'est envoyé pour l'instant." */
  notice?: ReactNode;
  wrapperClassName?: string;
}) {
  const [clicks, setClicks] = useState(0);
  return (
    <div className={cx("inline-flex max-w-full flex-col items-start gap-2", wrapperClassName)}>
      <Button
        {...button}
        onClick={(e) => {
          onClick?.(e);
          setClicks((n) => n + 1);
        }}
      />
      <div role="status" className={cx("max-w-sm", clicks === 0 && "sr-only")}>
        {clicks > 0 && <DemoNotice key={clicks}>{notice}</DemoNotice>}
      </div>
    </div>
  );
}
