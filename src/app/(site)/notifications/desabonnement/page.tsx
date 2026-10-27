import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { peekUnsubscribeToken } from "@/lib/notifications/data";
import { PageHeader } from "@/components/layout/PageHeader";
import { UnsubscribeForm } from "@/components/notifications/UnsubscribeForm";

export const metadata: Metadata = {
  title: "Se désabonner",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * /notifications/desabonnement?t=<token> — where an e-mail's "Ne plus
 * recevoir ces e-mails" link leads. No sign-in: the token (made for one
 * person and one topic, valid 90 days, used once) is the proof. The page
 * only reads it and asks; the button turns the e-mails off. Nothing here
 * says who the link belongs to. Essential messages have no such link.
 */
export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).t;
  const token = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const peek = await peekUnsubscribeToken(token);

  return (
    <>
      <PageHeader variant="document" kicker="Notifications" title="Se désabonner des e-mails" />
      <div className="wrap">
        <div className="flex max-w-2xl flex-col gap-6">
          {peek.status === "valid" && peek.label ? (
            <>
              <p className="type-lead">
                Ce lien arrête les e-mails « {peek.label} ». Les autres e-mails, et tout ce qui concerne une démarche en cours ou la
                sécurité de ton compte, continuent.
              </p>
              <UnsubscribeForm token={token} label={peek.label} />
            </>
          ) : peek.status === "used" ? (
            <p className="type-lead">C&apos;est déjà fait : tu ne reçois plus{peek.label ? ` « ${peek.label} »` : " ces e-mails"} par e-mail.</p>
          ) : peek.status === "expired" ? (
            <p className="type-lead">Ce lien a expiré (il reste valable 90 jours). Tu peux changer ce réglage depuis ton espace.</p>
          ) : (
            <p className="type-lead">Ce lien n&apos;est pas valable. Il a peut-être été coupé en deux par ta messagerie : tu peux aussi changer ce réglage depuis ton espace.</p>
          )}
          <p className="text-muted">
            Tous tes choix sont dans{" "}
            <Link href={routes.accountNotificationSettings} className="link font-bold">
              Mon espace › Notifications › Réglages
            </Link>{" "}
            (il faut être connecté·e).
          </p>
        </div>
      </div>
    </>
  );
}
