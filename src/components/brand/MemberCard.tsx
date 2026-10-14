"use client";

import { useRef, type PointerEvent } from "react";
import { cx } from "@/lib/cx";
import { BrandMark } from "./BrandMark";

/**
 * The carte cotisante with the maquette's "effet 3D": it tilts toward the
 * pointer with a glare that follows it. Pure CSS transforms driven by two
 * custom properties; no tilt for touch-only devices or reduced motion.
 * Without a holder it is the offer card ("30 €"); with one, the member's card.
 */
export function MemberCard({
  season,
  holder,
  number,
  validUntilLabel,
  price = 30,
  className,
}: {
  season: string;
  holder?: string;
  number?: string;
  validUntilLabel?: string;
  price?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function onMove(e: PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--rx", `${(0.5 - y) * 14}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 18}deg`);
    el.style.setProperty("--gx", `${x * 100}%`);
    el.style.setProperty("--gy", `${y * 100}%`);
  }

  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  }

  return (
    <div className={cx("[perspective:1100px]", className)}>
      <div
        ref={ref}
        onPointerMove={onMove}
        onPointerLeave={onLeave}
        className="group relative aspect-[1.586] w-full overflow-hidden rounded-lg border-2 border-accent bg-[#100d13] p-[6%] text-[#f7f1f4] shadow-[0_0_0_1px_rgb(250_4_121/0.35),0_0_2.5rem_-0.5rem_rgb(250_4_121/0.55),0_30px_60px_-30px_rgb(0_0_0/0.9)] transition-transform duration-300 ease-out [transform:rotateX(var(--rx,0deg))_rotateY(var(--ry,0deg))] [transform-style:preserve-3d] motion-reduce:transition-none"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(circle at var(--gx,50%) var(--gy,50%), rgb(255 255 255 / 0.16), transparent 45%)",
          }}
        />
        <span aria-hidden className="halftone pointer-events-none absolute -bottom-1/3 -right-1/4 size-3/4 rounded-full opacity-40 [--dot:rgb(250_4_121/0.5)]" />

        <div className="relative flex h-full flex-col justify-between [transform:translateZ(30px)]">
          <div className="flex items-start justify-between gap-4">
            <BrandMark variant="panther" height={44} decorative />
            <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[#12d8f0]">
              Année {season}
            </p>
          </div>
          <div>
            <p className="neon text-[clamp(1.1rem,0.6rem+2.4vw,1.9rem)] font-black uppercase leading-none [font-stretch:118%]">
              Carte cotisante
            </p>
            <p className="mt-2 font-mono text-[0.62rem] uppercase tracking-[0.16em] text-[#b9aeb5]">
              Very Pink Club · GEM Alpine Business School
            </p>
          </div>
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-[#b9aeb5]">
                {holder ? (validUntilLabel ?? "Membre adhérent·e") : "Membre adhérent·e"}
              </p>
              {holder && <p className="mt-1 truncate text-[1.05rem] font-bold">{holder}</p>}
            </div>
            <p className="shrink-0 font-mono text-[0.95rem] font-bold text-[#12d8f0]">
              {number ?? `${price} €`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
