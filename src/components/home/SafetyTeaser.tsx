import Link from "next/link";
import type { SafetyHotline } from "@/lib/types";
import { routes } from "@/lib/routes";
import { Icon } from "@/components/ui/Icon";

/**
 * The safety note, in amber — the one colour the site keeps for VSS / VDH.
 * Who to look for at a party, where to get help, and the emergency numbers
 * as real tel:/sms: links, so the home page is never more than one tap away
 * from them.
 */
export function SafetyTeaser({ emergency }: { emergency: SafetyHotline[] }) {
  return (
    <section aria-labelledby="pas-seul" className="wrap py-section">
      <div className="grid gap-8 rounded-md border-2 border-warn p-5 sm:p-8 lg:grid-cols-12 lg:items-start lg:gap-10 lg:p-10">
        <div className="flex flex-col items-start gap-4 lg:col-span-7">
          <p className="flex items-center gap-2 type-label text-warn">
            <Icon name="shield" size={16} />
            Sécurité · VSS / VDH
          </p>
          <h2 id="pas-seul" className="type-section">
            En soirée ou ailleurs, tu n&apos;es pas seul·e.
          </h2>
          <p className="max-w-2xl text-muted">
            Violences sexistes et sexuelles, harcèlement, discriminations : à chaque soirée du VPC, des référent·es
            formé·es au brassard rose tournent toute la nuit. Et tu peux prévenir la cellule du BDE sans donner ton nom.
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href={routes.safety}
              className="inline-flex min-h-11 items-center gap-2 rounded-sm border-2 border-warn px-4 type-button text-warn transition-colors hover:bg-warn hover:text-on-inverse"
            >
              Trouver de l&apos;aide
              <Icon name="arrow-right" size={18} />
            </Link>
            <Link
              href={`${routes.safety}#alerte`}
              className="inline-flex items-center gap-1.5 type-label text-fg hover:text-warn"
            >
              Signaler anonymement
              <Icon name="arrow-right" size={14} />
            </Link>
          </div>
        </div>

        {emergency.length > 0 && (
          <div className="lg:col-span-5">
            <h3 className="flex items-center gap-2 type-label text-warn">
              <Icon name="alert" size={16} />
              Danger immédiat
            </h3>
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {emergency.map((h) => (
                <li key={h.id}>
                  <a
                    href={h.href}
                    className="group flex min-h-14 items-center gap-4 py-2.5 hover:text-warn"
                  >
                    <span className="type-numeral w-[4.5rem] shrink-0 text-[2.6rem] text-warn">{h.number}</span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-bold leading-snug">{h.name}</span>
                      <span className="type-small text-muted">{h.actionLabel}</span>
                    </span>
                    <Icon
                      name={h.href.startsWith("sms:") ? "mail" : "phone"}
                      size={20}
                      className="shrink-0 text-warn"
                    />
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-3 type-small text-muted">Gratuits, 24 h/24, depuis n&apos;importe quel téléphone.</p>
          </div>
        )}
      </div>
    </section>
  );
}
