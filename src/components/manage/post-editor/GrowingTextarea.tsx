"use client";

import { useLayoutEffect, useRef, type ComponentProps } from "react";
import { cx } from "@/lib/cx";

/**
 * A one-paragraph field that grows with its text instead of scrolling (the
 * title and the introduction): line breaks are not part of either, so
 * Entrée moves on to the next field (`onEnter`) and pasted line breaks
 * become spaces.
 */
export function GrowingTextarea({
  value,
  onValue,
  onEnter,
  className,
  ...rest
}: Omit<ComponentProps<"textarea">, "value" | "onChange" | "rows"> & {
  value: string;
  onValue: (value: string) => void;
  onEnter?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  // Width changes (rotation, sidebar) re-wrap the text: measure again.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      onChange={(e) => onValue(e.target.value.replace(/[\r\n]+/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onEnter?.();
        }
      }}
      className={cx("block w-full resize-none overflow-hidden bg-transparent [field-sizing:content]", className)}
      {...rest}
    />
  );
}
