import type { Metadata } from "next";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/auth/context";
import { getMyMfaStatus } from "@/lib/auth/mfa";
import { signOut } from "@/app/actions/auth";
import { PageHeader } from "@/components/layout/PageHeader";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { Button } from "@/components/ui/Button";
import { MfaManager } from "@/components/account/MfaManager";

export const metadata: Metadata = {
  title: "Sécurité",
  description: "Double authentification, façon de te connecter et déconnexion de tes appareils.",
};

/** How this session signed in, in words. */
function methodLabel(methods: string[]): string {
  if (methods.includes("oauth") || methods.includes("sso/saml")) return "Compte de l'école";
  if (methods.includes("otp") || methods.includes("magiclink") || methods.includes("email/signup")) {
    return "Code envoyé à ton adresse e-mail de l'école";
  }
  return "Adresse e-mail de l'école";
}

/**
 * Sécurité: two-factor authentication (optional for students; required by
 * the database for sensitive governance actions: handing out rights,
 * passations, BDE platform actions), how you sign in, and signing out
 * of this or every device. No account deletion here yet: it touches
 * applications, memberships and history, and comes with the privacy phase.
 */
export default async function AccountSecurityPage() {
  const user = await requireUser(routes.accountSecurity);
  const mfa = await getMyMfaStatus();

  return (
    <>
      <PageHeader
        variant="document"
        kicker="Mon espace"
        title="Sécurité"
        intro="Ton compte, bien fermé. La double authentification est conseillée à tout le monde, et obligatoire pour les actions sensibles d'une équipe d'asso (postes, droits, passations)."
        meta={user.email ? <span className="break-all">{user.email}</span> : undefined}
      />

      <div className="wrap grid gap-x-8 gap-y-16 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-16 lg:col-span-8">
          <section aria-labelledby="mfa-titre">
            <SectionHeader
              id="mfa-titre"
              index="01"
              kicker="Double authentification"
              title="Un code en plus de ton e-mail"
              description="Même si quelqu'un accède à ta boîte mail, il lui faudra aussi le code de ton téléphone."
            />
            <div className="mt-8">
              <MfaManager enabled={mfa.enabled} factorId={mfa.factorId} sessionAal2={user.aal === "aal2"} />
            </div>
          </section>

          <section aria-labelledby="acces-titre">
            <SectionHeader id="acces-titre" index="02" kicker="Accès" title="Ta connexion" />
            <dl className="mt-6 border-t border-line">
              <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-line py-4">
                <dt className="font-bold">Connexion</dt>
                <dd className="text-muted">{methodLabel(user.methods)}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 border-b border-line py-4">
                <dt className="font-bold">Mot de passe</dt>
                <dd className="text-muted">Aucun : un code t&apos;est envoyé à chaque connexion.</dd>
              </div>
            </dl>
            <div className="mt-8 flex flex-wrap gap-3">
              <form action={signOut}>
                <Button type="submit" variant="secondary" icon="logout">
                  Me déconnecter
                </Button>
              </form>
              <form action={signOut}>
                <input type="hidden" name="scope" value="global" />
                <Button type="submit" variant="ghost">
                  Me déconnecter de tous mes appareils
                </Button>
              </form>
            </div>
          </section>
        </div>

        <aside aria-label="À savoir" className="flex min-w-0 flex-col gap-6 lg:col-span-4 lg:col-start-9">
          <section className="border-t-2 border-fg pt-3">
            <h2 className="type-label text-muted">À savoir</h2>
            <ul className="mt-3 flex flex-col gap-3 type-small text-muted">
              <li>Le bureau ne te demandera jamais tes codes, ni par mail ni en message.</li>
              <li>
                Perdre ton application bloque la connexion : la récupération de compte n&apos;existe pas encore sur le
                site, garde-la précieusement.
              </li>
              <li>Supprimer ton compte n&apos;est pas encore possible ici : cela viendra avec les réglages de confidentialité.</li>
            </ul>
          </section>
        </aside>
      </div>
    </>
  );
}
