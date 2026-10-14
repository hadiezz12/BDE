import Link from "next/link";
import type { AssociationRef } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { AssociationLogo } from "./AssociationLogo";

/**
 * Logo + name (+ kind) lockup, used wherever content is attributed to an
 * association: event cards, posts, recruitment rows, admin header.
 */
export function AssociationIdentity({
  association,
  size = "md",
  showKind,
  link = true,
  className,
}: {
  association: AssociationRef;
  size?: "sm" | "md" | "lg";
  showKind?: boolean;
  /** Turn off inside an already-linked card to avoid nested links. */
  link?: boolean;
  className?: string;
}) {
  const logoSize = size === "sm" ? 22 : size === "lg" ? 56 : 32;
  const name = (
    <span className="flex min-w-0 flex-col">
      <span
        className={cx(
          "truncate font-bold leading-tight",
          size === "sm" && "text-[0.85rem]",
          size === "lg" && "type-card text-[1.35rem]",
        )}
      >
        {association.name}
      </span>
      {showKind && <span className="truncate type-meta text-subtle">{association.kind}</span>}
    </span>
  );
  const body = (
    <>
      <AssociationLogo association={association} size={logoSize} />
      {name}
    </>
  );
  const cls = cx("inline-flex min-w-0 items-center gap-2.5", className);
  return link ? (
    <Link href={routes.association(association.slug)} className={cx(cls, "hover:text-assoc-text")} data-accent={association.accent}>
      {body}
    </Link>
  ) : (
    <span className={cls} data-accent={association.accent}>
      {body}
    </span>
  );
}
