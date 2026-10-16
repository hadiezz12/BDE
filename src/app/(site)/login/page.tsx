import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { getAuthContext } from "@/lib/auth/context";
import { AUTH_MESSAGES, parseAuthProblem } from "@/lib/auth/messages";
import { safeNextPath, withNext } from "@/lib/auth/next-path";
import { ssoProvider } from "@/lib/auth/sso";
import { testAccountsEnabled } from "@/lib/auth/test-accounts";
import { startSchoolSignIn } from "@/app/actions/auth";
import { BrandMark } from "@/components/brand/BrandMark";
import { NeonText } from "@/components/brand/NeonText";
import { Sticker } from "@/components/ui/Sticker";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { SignInFlow } from "@/components/auth/SignInFlow";
import { TestAccountSignIn } from "@/components/auth/TestAccountSignIn";

export const metadata: Metadata = {
  title: "Connexion",
  description: "Connecte-toi avec ton adresse e-mail de l'école pour retrouver ton espace, tes soirées et tes candidatures.",
  robots: { index: false, follow: true },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Sign-in. The brand side (the panther checks you in), then the way in: the
 * school's own sign-in when it is configured, and the school e-mail with a
 * code in every case. Already signed in? Straight to where you were going.
 */
export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const ctx = await getAuthContext();
  if (ctx.status === "authenticated") redirect(next ?? routes.account);
  if (ctx.status === "mfa_required") redirect(withNext(routes.loginVerification, next));

  const problem = parseAuthProblem(params.error);
  const signedOut = params["signed-out"] === "1";
  const sso = ssoProvider();

  return (
    <div className="wrap grid gap-12 pb-section pt-10 sm:pt-16 lg:grid-cols-12 lg:gap-8">
      {/* Brand side: the door of the club. */}
      <div className="lg:col-span-6 xl:col-span-7">
        <p className="type-label text-accent-text">Connexion · étudiant·es GEM Paris</p>
        <h1 className="mt-4 type-display">
          Montre patte <NeonText flicker>rose</NeonText>.
        </h1>
        <p className="mt-6 max-w-xl type-lead text-muted">
          Ton adresse e-mail de l&apos;école suffit. De l&apos;autre côté : ton espace, tes soirées, tes candidatures et ta
          carte cotisante. Sans compte, tout le reste du site reste ouvert.
        </p>
        <div aria-hidden className="relative mt-14 hidden w-fit lg:block">
          <BrandMark variant="panther" height={280} decorative className="-rotate-6" />
          <Sticker tone="cream" tilt={-5} className="absolute -right-6 bottom-6">
            Avec ton mail GEM
          </Sticker>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:col-span-6 xl:col-span-5">
        {signedOut && !problem && (
          <p role="status" className="flex gap-3 rounded-sm border-2 border-line-strong p-4 leading-snug">
            <Icon name="logout" size={20} className="mt-0.5 shrink-0 text-muted" />
            <span>
              <strong>Tu es déconnecté·e.</strong> À bientôt sur le dancefloor.
            </span>
          </p>
        )}
        {problem && (
          <p role="alert" className="flex gap-3 rounded-sm border-2 border-danger/60 bg-danger/10 p-4 leading-snug">
            <Icon name="alert" size={20} className="mt-0.5 shrink-0 text-danger" />
            <span>{AUTH_MESSAGES[problem]}</span>
          </p>
        )}

        <section aria-labelledby="connexion-titre" className="rounded-md border border-line-strong bg-raised p-5 sm:p-8">
          <h2 id="connexion-titre" className="type-section">
            Se connecter
          </h2>

          {sso && (
            <>
              <form action={startSchoolSignIn} className="mt-6">
                {next && <input type="hidden" name="next" value={next} />}
                <Button type="submit" size="lg" block icon="arrow-right">
                  Continuer avec ton compte de l&apos;école
                </Button>
              </form>
              <p className="my-6 flex items-center gap-4 type-label text-subtle before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">
                ou par e-mail
              </p>
            </>
          )}

          <SignInFlow next={next} className={sso ? undefined : "mt-6"} />
        </section>

        <p className="type-small text-muted">
          Les comptes sont réservés aux étudiant·es de GEM Alpine Business School. Se connecter ne donne aucun droit sur
          les associations : chaque bureau gérera les siens.
        </p>

        {testAccountsEnabled() && <TestAccountSignIn next={next} />}
      </div>
    </div>
  );
}
