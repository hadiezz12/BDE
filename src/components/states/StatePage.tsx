import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { BrandMark } from "@/components/brand/BrandMark";
import { NeonText } from "@/components/brand/NeonText";

/**
 * Full-page states (404, error, access denied, expired, missing). The code is
 * a neon sign — flickering for "broken", steady for "closed" — and the
 * panther badge sits beside it. Copy is specific and always offers a way on.
 */
export type StateTone = "pink" | "amber" | "cyan";

export function StatePage({
  code,
  kicker,
  title,
  children,
  actions,
  tone = "pink",
  flicker,
  className,
}: {
  /** Short sign text: "404", "Oups", "Clos", "Privé". */
  code: string;
  kicker?: string;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  tone?: StateTone;
  /** Broken things flicker; deliberate closures stay steady. */
  flicker?: boolean;
  className?: string;
}) {
  return (
    <section className={cx("wrap grid items-center gap-10 py-section lg:grid-cols-12", className)}>
      <div className="lg:col-span-7">
        <NeonText
          as="p"
          tone={tone === "amber" ? "amber" : tone === "cyan" ? "cyan" : "pink"}
          flicker={flicker}
          className="type-numeral text-[clamp(6rem,4rem+14vw,15rem)]"
        >
          {code}
        </NeonText>
        {kicker && <p className="mt-6 type-label text-muted">{kicker}</p>}
        <h1 className="mt-3 type-title max-w-2xl">{title}</h1>
        {children && <div className="mt-5 max-w-xl text-muted type-lead">{children}</div>}
        {actions && <div className="mt-8 flex flex-wrap gap-3">{actions}</div>}
      </div>
      <div aria-hidden className="relative hidden justify-self-center lg:col-span-5 lg:block">
        <span className="absolute inset-[12%] rounded-full bg-accent/25 blur-3xl" />
        <BrandMark variant="badge" height={340} decorative className="relative -rotate-6 opacity-90" />
      </div>
    </section>
  );
}
