import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

/** The "see everything" link on the right of a home block's ruled head. */
export function SectionLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="group inline-flex min-h-9 items-center gap-1.5 rounded-sm px-1 type-small font-semibold text-muted hover:text-fg"
    >
      {children}
      <Icon name="arrow-right" size={16} className="transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
