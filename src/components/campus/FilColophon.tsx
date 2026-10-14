import Link from "next/link";
import type { AssociationRef } from "@/lib/types";
import { routes } from "@/lib/routes";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";

/**
 * The fil's "ours": who writes it and how to get something in. A small note
 * printed on paper and stuck slightly askew on the night feed. Officers see
 * a direct line to their association's content desk.
 */
export function FilColophon({
  contactEmail,
  managed = [],
  className,
}: {
  /** The BDE's address — where brèves and corrections go. */
  contactEmail?: string;
  /** Associations the viewer manages (empty for students and visitors). */
  managed?: AssociationRef[];
  className?: string;
}) {
  return (
    <div
      data-surface="paper"
      className={cx("flex flex-col gap-3 border-2 border-fg p-5 shadow-sticker -rotate-[0.6deg]", className)}
    >
      <h3 className="type-card">Une info pour le fil&nbsp;?</h3>
      <p className="type-small text-muted">
        Le fil est écrit par les assos elles-mêmes. Une brève à proposer, une coquille à signaler&nbsp;: écris au bureau.
      </p>
      {contactEmail && (
        <a href={`mailto:${contactEmail}`} className="link type-meta break-all">
          {contactEmail}
        </a>
      )}
      {managed.length > 0 && (
        <div className="mt-1 flex flex-col gap-2 border-t border-line pt-3">
          <p className="type-small">Tes articles se publient depuis l&apos;espace asso&nbsp;:</p>
          <ul className="flex flex-col gap-1.5">
            {managed.map((a) => (
              <li key={a.id}>
                <Link
                  href={routes.manageContent(a.slug)}
                  className="group inline-flex items-center gap-1.5 type-label hover:text-accent-text"
                >
                  Écrire pour {a.shortName ?? a.name}
                  <Icon name="arrow-right" size={14} className="transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
