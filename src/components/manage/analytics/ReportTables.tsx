import type { Cell } from "@/lib/analytics/csv";
import { ManageSection } from "@/components/manage/ManagePageHeader";

/**
 * The printable report's tables: the same rows as the CSV (one source for
 * both), grouped by section. A hidden value reads "masqué" with its reason.
 */
export function ReportTables({ rows }: { rows: Cell[][] }) {
  const groups = new Map<string, Cell[][]>();
  for (const r of rows) {
    const key = String(r[0] ?? "");
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  if (groups.size === 0) return <p className="text-muted">Aucune section choisie.</p>;
  return (
    <div className="flex flex-col gap-10">
      {[...groups.entries()].map(([section, list]) => (
        <ManageSection key={section} title={section}>
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full min-w-[40rem] border-collapse text-left type-small print:min-w-0">
              <thead>
                <tr className="border-b-2 border-fg">
                  {["Indicateur", "Détail", "Valeur", "Période comparée", "Nature", "Remarque"].map((h) => (
                    <th key={h} scope="col" className="py-2 pr-3 type-label text-[0.68rem]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {list.map((r, i) => (
                  <tr key={i} className="break-inside-avoid border-b border-line align-top">
                    <th scope="row" className="py-2 pr-3 font-semibold">
                      {r[1]}
                    </th>
                    <td className="py-2 pr-3 text-muted">{r[2]}</td>
                    <td className="py-2 pr-3 type-meta font-bold">{typeof r[3] === "number" ? r[3].toLocaleString("fr-FR") : r[3]}</td>
                    <td className="py-2 pr-3 type-meta">{typeof r[4] === "number" ? r[4].toLocaleString("fr-FR") : r[4]}</td>
                    <td className="py-2 pr-3 text-muted">
                      {r[5]} · {r[6]}
                    </td>
                    <td className="py-2 text-muted">{r[7]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ManageSection>
      ))}
    </div>
  );
}
