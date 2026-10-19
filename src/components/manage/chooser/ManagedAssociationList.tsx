import Link from "next/link";
import type { ManageEntry } from "@/lib/governance/workspace";
import { Icon } from "@/components/ui/Icon";
import { ManageEntryMark } from "@/components/manage/ManageEntryMark";

export interface ChooserEntry {
  entry: ManageEntry;
  /** Small line above the name ("BDE", "Association", "Plateforme"). */
  kicker: string;
  title: string;
  /** Real facts, already worded: "Mandat jusqu'au 31 août 2027", "1 invitation en attente". */
  facts: string[];
}

/**
 * The /manage chooser: one ruled line per workspace of the person, each in
 * its own accent (a tube of colour on the left edge), each one link. Every
 * workspace has its own address, so two can stay open in two tabs.
 */
export function ManagedAssociationList({ entries }: { entries: ChooserEntry[] }) {
  return (
    <ul className="overflow-hidden rounded-md border border-line bg-raised">
      {entries.map(({ entry, kicker, title, facts }) => (
        <li
          key={entry.key}
          data-accent={entry.accent}
          className="group relative border-b border-line last:border-b-0 hover:bg-bg/60"
        >
          <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-assoc" />
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 py-5 pl-5 pr-4 sm:gap-x-5 sm:pl-7 sm:pr-6">
            <ManageEntryMark entry={entry} size={52} />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="type-label text-[0.68rem] text-assoc-text">{kicker}</p>
              <h2 className="type-card text-[1.3rem]">
                <Link
                  href={entry.href}
                  className="after:absolute after:inset-0 after:content-[''] group-hover:text-assoc-text"
                >
                  {title}
                </Link>
              </h2>
              <p className="type-small text-muted">{entry.detail}</p>
              {facts.length > 0 && (
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 type-meta text-subtle">
                  {facts.map((f) => (
                    <span key={f}>{f}</span>
                  ))}
                </p>
              )}
            </div>
            <Icon
              name="arrow-right"
              size={20}
              className="text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-fg"
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
