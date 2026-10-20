import Image from "next/image";
import type { AssociationRef } from "@/lib/types";
import { cx } from "@/lib/cx";
import { isPrivateMedia } from "@/lib/media-url";

/**
 * An association's mark. Uploaded logos sit on a neutral disc; without one we
 * draw a monogram sticker in the association's accent — never an empty grey
 * circle. Decorative by default: the name is always printed next to it.
 */
export function AssociationLogo({
  association,
  size = 48,
  ring,
  className,
}: {
  association: Pick<AssociationRef, "name" | "shortName" | "accent" | "logo">;
  size?: number;
  /** Neon ring in the accent, like the BDE event emblems. */
  ring?: boolean;
  className?: string;
}) {
  const { logo, accent } = association;
  const letters = monogram(association.shortName ?? association.name);
  return (
    <span
      aria-hidden
      data-accent={accent}
      className={cx(
        "relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full",
        logo ? "bg-ink" : "bg-assoc text-assoc-fg",
        ring ? "shadow-assoc-glow ring-2 ring-assoc" : "ring-1 ring-line-strong",
        className,
      )}
      style={{ width: size, height: size }}
    >
      {logo ? (
        <Image src={logo.src} alt="" fill unoptimized={isPrivateMedia(logo.src)} sizes={`${size}px`} className="object-contain p-[6%]" />
      ) : (
        <span
          className="font-black uppercase leading-none"
          style={{ fontSize: size * (letters.length > 2 ? 0.3 : 0.4), fontStretch: "70%", letterSpacing: "-0.02em" }}
        >
          {letters}
        </span>
      )}
    </span>
  );
}

/** Initials: "Club Photo" → "CP", "Studio 21" → "S21", "Escalade" → "ES" (made-up examples). */
function monogram(name: string): string {
  const cleaned = name.replace(/^(GEM|Le|La|Les)\s+/i, "");
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 2);
  const digits = words.find((w) => /^\d+$/.test(w));
  if (digits) return `${words[0][0]}${digits}`;
  return words
    .slice(0, 2)
    .map((w) => w[0])
    .join("");
}
