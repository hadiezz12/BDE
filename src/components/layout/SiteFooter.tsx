import Link from "next/link";
import { routes } from "@/lib/routes";
import { BrandMark } from "@/components/brand/BrandMark";
import { Icon } from "@/components/ui/Icon";

const EXPLORE = [
  { href: routes.events, label: "Les 8 événements" },
  { href: routes.associations, label: "Les associations" },
  { href: routes.recruitment, label: "Recrutements" },
  { href: routes.campus, label: "Campus — le fil" },
  { href: routes.search, label: "Rechercher" },
];

/** The BDE's page, where the carte cotisante is presented (#carte). */
const BDE_SLUG = "very-pink-club";

/**
 * The night ends on paper: a cream sticker sheet with the real wordmark
 * (it was drawn for light backgrounds — black outline, white keyline).
 * Copy is the maquette's own footer: no address, room, hours or social
 * handle that the bureau has not given.
 */
export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer data-surface="paper" className="grain relative overflow-hidden">
      <div className="wrap grid gap-12 pb-10 pt-14 lg:grid-cols-12 lg:gap-8 lg:pt-20">
        <div className="flex items-start gap-6 lg:col-span-5">
          <BrandMark variant="wordmark" height={176} className="-ml-2 w-auto rotate-[-4deg] max-sm:h-32" />
          <div className="flex flex-col gap-4 pt-2">
            <p className="type-section max-w-[14ch]">Paris by night, version très rose.</p>
            <p className="max-w-xs text-muted">
              Very Pink Club — le bureau des étudiants de GEM Alpine Business School.
            </p>
          </div>
        </div>

        <nav aria-label="Pied de page" className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-7 lg:pl-8">
          <div>
            <h2 className="mb-4 type-label text-accent-text">Explorer</h2>
            <ul className="flex flex-col gap-2.5">
              {EXPLORE.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="font-semibold hover:text-accent-text">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-4 type-label text-accent-text">Le bureau</h2>
            <ul className="flex flex-col gap-2.5">
              <li>
                <Link href={routes.association(BDE_SLUG)} className="font-semibold hover:text-accent-text">
                  Le Very Pink Club
                </Link>
              </li>
              <li>
                <Link href={`${routes.association(BDE_SLUG)}#carte`} className="font-semibold hover:text-accent-text">
                  Carte cotisante · 30&nbsp;€
                </Link>
              </li>
              <li className="max-w-[24ch] pt-1 type-small text-muted">
                Permanence sur le campus et sur place pendant tous les événements. Pendant la campagne des listes, on
                répond au plus vite via nos réseaux.
              </li>
            </ul>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <h2 className="mb-4 type-label text-warn">Sécurité · VSS / VDH</h2>
            <ul className="flex flex-col gap-2.5">
              <li>
                <Link href={routes.safety} className="font-semibold hover:text-warn">
                  Nos engagements
                </Link>
              </li>
              <li>
                <Link href={`${routes.safety}#alerte`} className="inline-flex items-center gap-2 font-bold text-warn hover:underline">
                  <Icon name="shield" size={18} /> Déposer une alerte
                </Link>
              </li>
              <li className="type-small text-muted">
                Danger immédiat : appelle le <strong className="text-fg">112</strong>.
              </li>
            </ul>
          </div>
        </nav>
      </div>

      <div className="wrap">
        <div className="flex flex-col gap-6 border-t-2 border-fg py-6 lg:flex-row lg:items-end lg:justify-between">
          <span aria-hidden />
          <p className="type-meta text-muted">
            © {year} Very Pink Club — BDE · GEM Alpine Business School — Paris
          </p>
        </div>
      </div>
    </footer>
  );
}
