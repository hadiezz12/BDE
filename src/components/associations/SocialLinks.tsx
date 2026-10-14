import type { SocialLink } from "@/lib/types";
import { cx } from "@/lib/cx";
import { Icon, type IconName } from "@/components/ui/Icon";

/**
 * An association's accounts and contact address, with the house icons.
 *
 *  - list  : ruled rows, platform + handle — the profile's side column.
 *  - icons : square 44 px buttons — tight spots (footer of a tile, a header).
 *
 * External links open in a new tab (rel="noopener noreferrer") and say so to
 * assistive tech; the mail address is a plain mailto: link. Accent colour
 * comes from the nearest data-accent ancestor.
 */
const PLATFORM: Record<SocialLink["kind"], { name: string; icon: IconName }> = {
  instagram: { name: "Instagram", icon: "instagram" },
  tiktok: { name: "TikTok", icon: "tiktok" },
  linkedin: { name: "LinkedIn", icon: "linkedin" },
  site: { name: "Site web", icon: "globe" },
  mail: { name: "E-mail", icon: "mail" },
};

const NEW_TAB = "s'ouvre dans un nouvel onglet";

function isExternal(href: string) {
  return /^https?:\/\//i.test(href);
}

export function SocialLinks({
  socials,
  email,
  variant = "list",
  label = "Réseaux et contact",
  className,
}: {
  socials: SocialLink[];
  /** Contact address, appended as a mailto: entry (e.g. association.contactEmail). */
  email?: string;
  variant?: "list" | "icons";
  /** Accessible name of the list. */
  label?: string;
  className?: string;
}) {
  const links: SocialLink[] = [...socials];
  if (email && !links.some((l) => l.kind === "mail")) {
    links.push({ kind: "mail", href: `mailto:${email}`, label: email });
  }
  if (!links.length) return null;

  if (variant === "icons") {
    return (
      <ul aria-label={label} className={cx("flex flex-wrap gap-2", className)}>
        {links.map((l) => {
          const p = PLATFORM[l.kind];
          const external = isExternal(l.href);
          return (
            <li key={l.href}>
              <a
                href={l.href}
                {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                aria-label={`${p.name} : ${l.label}${external ? ` (${NEW_TAB})` : ""}`}
                className="inline-grid size-11 place-items-center rounded-sm border-2 border-line-strong text-fg transition-colors hover:border-assoc hover:text-assoc-text"
              >
                <Icon name={p.icon} size={20} />
              </a>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <ul aria-label={label} className={cx("flex flex-col border-b border-line", className)}>
      {links.map((l) => {
        const p = PLATFORM[l.kind];
        const external = isExternal(l.href);
        return (
          <li key={l.href}>
            <a
              href={l.href}
              {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="group flex min-h-14 items-center gap-3.5 border-t border-line py-2.5 transition-colors hover:text-assoc-text"
            >
              <Icon name={p.icon} size={22} className="shrink-0 text-assoc-text" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="font-bold leading-tight">{p.name}</span>
                <span className="type-meta text-muted [overflow-wrap:anywhere]">{l.label}</span>
              </span>
              <Icon
                name={external ? "arrow-up-right" : "arrow-right"}
                size={16}
                className={cx(
                  "shrink-0 text-subtle transition-transform group-hover:text-assoc-text",
                  external ? "group-hover:-translate-y-0.5 group-hover:translate-x-0.5" : "group-hover:translate-x-0.5",
                )}
              />
              {external && <span className="sr-only">({NEW_TAB})</span>}
            </a>
          </li>
        );
      })}
    </ul>
  );
}
