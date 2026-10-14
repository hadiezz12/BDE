import Link from "next/link";
import type { DemoRole } from "@/lib/types";
import { routes } from "@/lib/routes";
import { BrandMark } from "@/components/brand/BrandMark";
import { Icon } from "@/components/ui/Icon";
import { DemoRoleSwitcher } from "./DemoRoleSwitcher";

const EXPLORE = [
  { href: routes.events, label: "L'agenda" },
  { href: routes.associations, label: "Les associations" },
  { href: routes.recruitment, label: "Recrutements ouverts" },
  { href: routes.campus, label: "Campus — le fil" },
  { href: routes.search, label: "Rechercher" },
];

/**
 * The night ends on paper: a cream sticker sheet with the real wordmark
 * (it was drawn for light backgrounds — black outline, white keyline).
 */
export function SiteFooter({ role }: { role: DemoRole }) {
  const year = new Date().getFullYear();
  return (
    <footer data-surface="paper" className="grain relative overflow-hidden">
      <div className="wrap grid gap-12 pb-10 pt-14 lg:grid-cols-12 lg:gap-8 lg:pt-20">
        <div className="flex items-start gap-6 lg:col-span-5">
          <BrandMark variant="wordmark" height={176} className="-ml-2 w-auto rotate-[-4deg] max-sm:h-32" />
          <div className="flex flex-col gap-4 pt-2">
            <p className="type-section max-w-[14ch]">Paris by night, version très rose.</p>
            <p className="max-w-xs text-muted">
              Le bureau des étudiants de GEM Alpine Business School, campus de Paris. Permanence au local B-12, mardi et
              jeudi de 12h30 à 14h.
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
                <Link href={routes.association("very-pink-club")} className="font-semibold hover:text-accent-text">
                  Le Very Pink Club
                </Link>
              </li>
              <li>
                <Link href={`${routes.association("very-pink-club")}#carte`} className="font-semibold hover:text-accent-text">
                  Carte cotisante · 30 €
                </Link>
              </li>
              <li>
                <a href="https://www.instagram.com/" className="inline-flex items-center gap-2 font-semibold hover:text-accent-text">
                  <Icon name="instagram" size={18} /> Instagram
                </a>
              </li>
              <li>
                <a href="https://www.tiktok.com/" className="inline-flex items-center gap-2 font-semibold hover:text-accent-text">
                  <Icon name="tiktok" size={18} /> TikTok
                </a>
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
          <DemoRoleSwitcher current={role} />
          <p className="type-meta text-muted">
            © {year} Very Pink Club — BDE GEM Alpine Business School · campus de Paris
          </p>
        </div>
      </div>
    </footer>
  );
}
