"use client";

import { usePathname } from "next/navigation";
import { routes } from "@/lib/routes";
import { ButtonLink } from "@/components/ui/Button";
import { MemberCard } from "@/components/brand/MemberCard";

/**
 * What a visitor sees on any /account page: no personal data, just the way
 * in. The login link carries ?next= so they land back on the page they
 * asked for. Client only to read the current path (a layout cannot).
 */
export function AccountGate({ season }: { season: string }) {
  const pathname = usePathname();
  const next = pathname && pathname !== routes.login ? `?next=${encodeURIComponent(pathname)}` : "";

  return (
    <section aria-labelledby="account-gate-title" className="wrap grid gap-12 py-section lg:grid-cols-12 lg:items-center lg:gap-8">
      <div className="lg:col-span-6 xl:col-span-7">
        <p className="type-label text-accent-text">Mon espace · réservé aux étudiant·es GEM Paris</p>
        <h1 id="account-gate-title" className="mt-4 type-title max-w-[18ch]">
          C&apos;est ton espace. Encore faut-il entrer.
        </h1>
        <p className="mt-5 max-w-xl type-lead text-muted">
          Connecte-toi avec ton adresse de l&apos;école pour retrouver ta carte cotisante, tes billets, les soirées
          que tu as enregistrées, tes candidatures et tes notifications.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href={`${routes.login}${next}`} icon="arrow-right">
            Se connecter
          </ButtonLink>
          <ButtonLink href={routes.events} variant="secondary">
            Voir l&apos;agenda
          </ButtonLink>
        </div>
        <p className="mt-6 type-small text-subtle">
          Pas besoin de compte pour l&apos;agenda, les assos et les recrutements : tout ça reste ouvert.
        </p>
      </div>

      {/* The card waiting on the other side of the door. Decorative. */}
      <div aria-hidden className="mx-auto w-full max-w-[26rem] lg:col-span-6 lg:max-w-none xl:col-span-5">
        <MemberCard season={season} className="-rotate-3" />
      </div>
    </section>
  );
}
