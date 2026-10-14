import Link from "next/link";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";
import { MANAGE_SECTIONS, type ManageSectionKey } from "@/components/manage/sections";

/**
 * Index of the workspace sections at the foot of the home page: a ruled
 * table of contents (icon, name, one real fact in mono), not a grid of
 * cards. `facts` comes from the page's data; a section without one just
 * shows its name.
 */
export function QuickLinks({
  asso,
  facts,
  highlight = [],
}: {
  asso: string;
  facts: Partial<Record<ManageSectionKey, string>>;
  /** Sections whose fact needs the bureau's attention (shown in the accent). */
  highlight?: ManageSectionKey[];
}) {
  const sections = MANAGE_SECTIONS.filter((s) => s.key !== "home");
  return (
    <ul className="grid border-b border-line sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-4">
      {sections.map((s) => {
        const fact = facts[s.key];
        return (
          <li key={s.key} className="border-t border-line">
            <Link
              href={s.href(asso)}
              className="group flex min-h-14 items-center gap-3 rounded-sm py-2.5 hover:text-assoc-text"
            >
              <Icon name={s.icon} size={18} className="shrink-0 text-subtle group-hover:text-assoc-text" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-bold">{s.label}</span>
                {fact && (
                  <span
                    className={cx(
                      "type-meta",
                      highlight.includes(s.key) ? "font-bold text-assoc-text" : "text-subtle",
                    )}
                  >
                    {fact}
                  </span>
                )}
              </span>
              <Icon
                name="chevron-right"
                size={16}
                className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
