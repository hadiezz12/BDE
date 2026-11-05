import { cx } from "@/lib/cx";

/**
 * Quiet status marker for dense contexts (admin tables, application lists):
 * a dot plus words. Never colour alone — the label always says the status.
 */
export type StatusTone = "ok" | "warn" | "danger" | "info" | "accent" | "neutral";

const TONE: Record<StatusTone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  info: "text-info",
  accent: "text-accent-text",
  neutral: "text-subtle",
};

export function StatusBadge({
  tone = "neutral",
  pulse,
  className,
  children,
}: {
  tone?: StatusTone;
  /** Live things only (an event happening now). */
  pulse?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // Wraps only when its column is too narrow (WCAG 1.4.10); otherwise one line.
    <span className={cx("inline-flex max-w-full items-center gap-1.5 type-label", TONE[tone], className)}>
      <span aria-hidden className="relative inline-flex size-2">
        {pulse && (
          <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60 motion-reduce:hidden" />
        )}
        <span className="relative size-2 rounded-full bg-current" />
      </span>
      {children}
    </span>
  );
}
