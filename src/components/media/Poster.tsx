import type { CSSProperties } from "react";
import Image from "next/image";
import type { AccentKey } from "@/lib/types";

/**
 * Designed stand-in for a missing photo: a screen-printed gig poster in the
 * association's accent, or — for BDE signature events — the event's neon
 * emblem lit up on black. Decorative: the surrounding card names the thing.
 */
export function Poster({
  title,
  accent,
  kicker,
  emblem,
}: {
  title: string;
  accent: AccentKey;
  kicker?: string;
  emblem?: string;
}) {
  if (emblem) {
    return (
      <div aria-hidden className="absolute inset-0 grid place-items-center bg-[#08070a] [container-type:size]">
        <span
          className="absolute size-[70cqmin] rounded-full opacity-70 blur-2xl"
          style={{ background: "radial-gradient(circle, var(--assoc) 0%, transparent 65%)" }}
        />
        <Image
          src={emblem}
          alt=""
          width={154}
          height={154}
          className="relative size-[58cqmin] max-w-none drop-shadow-[0_0_18px_var(--assoc)]"
        />
      </div>
    );
  }

  // Deterministic variant from the title, so a card always gets the same poster.
  const seed = [...title].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7);
  const filled = seed % 2 === 0;
  const words = title.split(/\s+/).slice(0, 3);

  return (
    <div
      aria-hidden
      className="grain absolute inset-0 flex flex-col justify-between overflow-hidden p-[6cqi] [container-type:inline-size]"
      style={{
        backgroundColor: filled ? "var(--assoc)" : "#0c0a0e",
        color: filled ? "var(--assoc-fg)" : "var(--assoc)",
      }}
      data-accent={accent}
    >
      <span
        className="halftone absolute -right-[10%] -top-[10%] size-[70%] rounded-full opacity-60"
        style={{ "--dot": filled ? "rgb(12 10 14 / 0.28)" : "var(--assoc)", "--dot-gap": "8px" } as CSSProperties}
      />
      {kicker && <span className="relative type-label">{kicker}</span>}
      <span
        className="relative mt-auto block break-words uppercase"
        style={{ fontWeight: 900, fontStretch: "62%", fontSize: "clamp(1.25rem, 17cqi, 9rem)", lineHeight: 0.84 }}
      >
        {words.join(" ")}
      </span>
    </div>
  );
}
