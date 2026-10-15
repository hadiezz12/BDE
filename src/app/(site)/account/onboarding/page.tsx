import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { routes } from "@/lib/routes";
import { requireUser } from "@/lib/auth/context";
import { safeNextPath } from "@/lib/auth/next-path";
import { getMyProfile, getProviderNameHint } from "@/lib/data/profile";
import { OnboardingForm } from "@/components/account/OnboardingForm";

export const metadata: Metadata = {
  title: "Bienvenue",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * First visit after signing in: how to call you, and your studies if you
 * like. Thirty seconds, once. Returning students never see it again.
 */
export default async function OnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  const next = safeNextPath((await searchParams).next);
  const user = await requireUser(routes.accountOnboarding);
  const profile = await getMyProfile();
  if (profile?.onboardingCompleted) redirect(next ?? routes.account);

  const hint = profile?.firstName || profile?.lastName ? null : await getProviderNameHint();

  return (
    <section aria-labelledby="bienvenue-titre" className="wrap grid gap-12 pt-10 sm:pt-16 lg:grid-cols-12 lg:gap-8">
      <div className="lg:col-span-5">
        <p className="type-label text-accent-text">Première connexion</p>
        <h1 id="bienvenue-titre" className="mt-4 max-w-[14ch] type-title">
          Bienvenue au Very Pink Club.
        </h1>
        <p className="mt-5 max-w-md type-lead text-muted">
          Dis-nous comment t&apos;appeler. Le reste est facultatif, et tu pourras tout changer plus tard.
        </p>
        {user.email && (
          <p className="mt-6 type-meta text-subtle">
            Connecté·e avec <span className="break-all">{user.email}</span>
          </p>
        )}
      </div>
      <div className="lg:col-span-7">
        <OnboardingForm
          next={next}
          initial={{
            firstName: profile?.firstName ?? hint?.firstName ?? "",
            lastName: profile?.lastName ?? hint?.lastName ?? "",
            displayName: profile?.displayName ?? null,
            program: profile?.program ?? null,
            studyYear: profile?.studyYear ?? null,
          }}
        />
      </div>
    </section>
  );
}
