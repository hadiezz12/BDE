import { signOut } from "@/app/actions/auth";
import { Button } from "@/components/ui/Button";

/**
 * Signed in, but the account has no profile row (the signup trigger did not
 * run). Rare, logged on the server, and never papered over with guesses.
 */
export function AccountUnavailable() {
  return (
    <section aria-labelledby="compte-indispo-titre" className="wrap py-section">
      <p className="type-label text-accent-text">Mon espace</p>
      <h1 id="compte-indispo-titre" className="mt-4 max-w-[20ch] type-title">
        Ton compte n&apos;est pas encore prêt.
      </h1>
      <p className="mt-5 max-w-xl type-lead text-muted">
        Ta connexion a bien marché, mais ton espace n&apos;a pas pu être créé. Déconnecte-toi puis reconnecte-toi ; si
        ça recommence, préviens le bureau du Very Pink Club.
      </p>
      <form action={signOut} className="mt-8">
        <Button type="submit" variant="secondary" icon="logout">
          Me déconnecter
        </Button>
      </form>
    </section>
  );
}
