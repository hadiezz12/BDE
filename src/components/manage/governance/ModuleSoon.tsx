import type { ManageContext } from "@/lib/data/manage";
import { getPermissionCatalog } from "@/lib/governance/queries";
import { Icon } from "@/components/ui/Icon";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ManagePageHeader } from "@/components/manage/ManagePageHeader";
import { canOpenSection, sectionByKey, type ManageSectionKey } from "@/components/manage/sections";
import { SectionDenied } from "./SectionDenied";

type ModuleKey = Extract<ManageSectionKey, "content" | "events" | "media" | "analytics" | "settings">;

const PURPOSE: Record<ModuleKey, string> = {
  content: "Les articles de l'asso : brouillons, relecture et publication dans le fil Campus.",
  events: "Les événements de l'asso : préparation, publication et inscriptions.",
  media: "La médiathèque de l'asso : photos et visuels.",
  analytics: "Les chiffres de fréquentation de l'asso.",
  settings: "La page publique de l'asso : nom, présentation, couleur, réseaux et contact.",
};

/**
 * A workspace module that arrives in a later phase. Its rights already
 * exist (positions can carry them today), so the page says what the module
 * will hold and which of the person's rights will apply: no demo screen, no
 * invented data, no button that does nothing.
 */
export async function ModuleSoon({ section, ctx }: { section: ModuleKey; ctx: ManageContext }) {
  const s = sectionByKey(section);
  if (!canOpenSection(section, ctx.membership.permissions)) return <SectionDenied section={section} ctx={ctx} />;
  const catalog = await getPermissionCatalog();
  const mine = catalog.filter((p) => s.requires.includes(p.key) && ctx.membership.permissions.includes(p.key));

  return (
    <div className="flex flex-col gap-8">
      <ManagePageHeader kicker={ctx.organization.shortName ?? ctx.organization.name} title={s.label} />
      <ManageEmpty as="h2" icon={s.icon} title="Ce module arrive bientôt">
        <p>{PURPOSE[section]}</p>
        <p>Tes postes te donneront déjà la main ici&nbsp;:</p>
        <ul className="flex flex-col gap-1">
          {mine.map((p) => (
            <li key={p.key} className="flex items-start gap-2">
              <Icon name="check" size={16} className="mt-0.5 shrink-0 text-ok" />
              <span>
                <span className="font-semibold text-fg">{p.label}</span> — {p.description}
              </span>
            </li>
          ))}
        </ul>
      </ManageEmpty>
    </div>
  );
}
