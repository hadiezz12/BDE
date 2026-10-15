import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { getAuthContext } from "@/lib/auth/context";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { signOut } from "@/app/actions/auth";
import { Icon } from "@/components/ui/Icon";
import { SecondFactorForm } from "@/components/auth/SecondFactorForm";

export const metadata: Metadata = {
  title: "Deuxième étape",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Second factor at sign-in, for students who turned it on. Until the code is
 * verified the session counts as signed out: no account page opens, and the
 * database returns nothing of theirs (restrictive RLS on aal1).
 */
export default async function SecondFactorPage({ searchParams }: { searchParams: SearchParams }) {
  const next = safeNextPath((await searchParams).next);
  const ctx = await getAuthContext();
  if (ctx.status === "anonymous") redirect(withNext(routes.login, next));
  if (ctx.status === "authenticated") redirect(next ?? routes.account);

  return (
    <div className="wrap grid gap-12 pb-section pt-10 sm:pt-16 lg:grid-cols-12 lg:gap-8">
      <div className="lg:col-span-6 xl:col-span-7">
        <p className="type-label text-accent-text">Connexion · deuxième étape</p>
        <h1 className="mt-4 type-display">Encore un code.</h1>
        <p className="mt-6 max-w-xl type-lead text-muted">
          Tu as activé la double authentification : le code de ton application prouve que c&apos;est bien toi, même si
          quelqu&apos;un avait accès à ta boîte mail.
        </p>
      </div>

      <div className="flex flex-col gap-6 lg:col-span-6 xl:col-span-5">
        <section aria-labelledby="code-titre" className="rounded-md border border-line-strong bg-raised p-5 sm:p-8">
          <h2 id="code-titre" className="type-section">
            Ton code
          </h2>
          <div className="mt-6">
            <SecondFactorForm next={next} />
          </div>
        </section>

        <div className="flex gap-3 type-small text-muted">
          <Icon name="info" size={18} className="mt-0.5 shrink-0" />
          <p>
            Plus accès à ton application ? Sans elle, la connexion ne peut pas aboutir, et la récupération de compte
            n&apos;existe pas encore sur le site. Préviens le bureau du Very Pink Club.
          </p>
        </div>
        <form action={signOut}>
          <button type="submit" className="type-small font-bold underline underline-offset-4 hover:text-accent-text">
            Ce n&apos;est pas mon compte · me déconnecter
          </button>
        </form>
      </div>
    </div>
  );
}
