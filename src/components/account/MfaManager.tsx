"use client";

import { useActionState, useState, useTransition } from "react";
import {
  confirmTotpEnrollment,
  removeTotpFactor,
  startTotpEnrollment,
  type EnrollmentStart,
  type MfaState,
} from "@/app/actions/account";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { StatusBadge } from "@/components/ui/StatusBadge";

/**
 * Two-factor authentication with an authenticator app (TOTP). Setting it up
 * counts only once a first code from the app is verified; the QR code and
 * the key are shown on this screen only, never stored or logged by us.
 * Removing it needs a session that passed the second factor.
 */
export function MfaManager({
  enabled,
  factorId,
  sessionAal2,
}: {
  enabled: boolean;
  factorId: string | null;
  sessionAal2: boolean;
}) {
  const [setup, setSetup] = useState<EnrollmentStart | null>(null);
  const [starting, startTransition] = useTransition();
  const [confirmed, confirm, confirming] = useActionState<MfaState, FormData>(confirmTotpEnrollment, { status: "idle" });
  const [removed, remove, removing] = useActionState<MfaState, FormData>(removeTotpFactor, { status: "idle" });

  const isOn = (enabled && removed.status !== "removed") || confirmed.status === "enabled";

  if (isOn) {
    return (
      <div className="flex flex-col gap-5">
        <p className="flex flex-wrap items-center gap-3">
          <StatusBadge tone="ok">Activée</StatusBadge>
          <span className="text-muted">Chaque connexion te demande aussi le code de ton application.</span>
        </p>
        {confirmed.status === "enabled" && (
          <p role="status" className="flex gap-3 rounded-sm border-2 border-ok/60 bg-ok/10 p-4 leading-snug">
            <Icon name="check" size={20} className="mt-0.5 shrink-0 text-ok" />
            <span>
              <strong>C&apos;est activé.</strong> Garde ton application : sans elle, tu ne pourras plus terminer une
              connexion.
            </span>
          </p>
        )}
        {(factorId || removed.status === "error") && (
          <form action={remove} className="flex flex-col gap-3">
            <input type="hidden" name="factorId" value={factorId ?? ""} />
            {!sessionAal2 && (
              <p className="type-small text-muted">
                Pour la retirer, reconnecte-toi d&apos;abord avec le code de ton application.
              </p>
            )}
            {removed.status === "error" && (
              <p role="alert" className="type-small font-semibold text-danger">
                {removed.message}
              </p>
            )}
            <div>
              <Button type="submit" variant="danger" disabled={removing || !sessionAal2} aria-disabled={removing || !sessionAal2}>
                {removing ? "Retrait…" : "Retirer la double authentification"}
              </Button>
            </div>
          </form>
        )}
      </div>
    );
  }

  if (setup?.status === "ready") {
    return (
      <div className="flex flex-col gap-6">
        <ol className="flex flex-col gap-6">
          <li className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
            {/* The QR code comes from Supabase Auth as an image (data URL): never injected as HTML. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimize */}
            <img
              src={setup.qrCode}
              alt="QR code à scanner avec ton application d'authentification"
              width={176}
              height={176}
              className="rounded-sm border border-line bg-white p-2"
            />
            <div className="flex flex-col gap-3">
              <p className="font-bold">1. Scanne ce QR code avec ton application d&apos;authentification.</p>
              <p className="type-small text-muted">
                Une application comme celles de Google, Microsoft, 1Password ou Bitwarden. Sur ton téléphone, sans
                pouvoir scanner ? Entre plutôt cette clé à la main :
              </p>
              <p className="break-all rounded-sm border border-line bg-sunken px-3 py-2 font-mono text-[0.9375rem] tracking-wider select-all">
                {setup.secret}
              </p>
            </div>
          </li>
          <li>
            <form action={confirm} className="flex flex-col gap-4" noValidate>
              <input type="hidden" name="factorId" value={setup.factorId} />
              <Field
                label="2. Entre le code à 6 chiffres affiché par l'application"
                error={confirmed.status === "error" ? confirmed.message : undefined}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    name="code"
                    required
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="123456"
                    aria-describedby={describedBy}
                    aria-invalid={invalid || undefined}
                    className="max-w-[14rem] font-mono text-[1.375rem] tracking-[0.4em]"
                  />
                )}
              </Field>
              <div className="flex flex-wrap gap-3">
                <Button type="submit" icon="check" disabled={confirming} aria-disabled={confirming}>
                  {confirming ? "Vérification…" : "Activer"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setSetup(null)}>
                  Annuler
                </Button>
              </div>
            </form>
          </li>
        </ol>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="flex flex-wrap items-center gap-3">
        <StatusBadge tone="neutral">Désactivée</StatusBadge>
        <span className="text-muted">Protège ton compte avec une application d&apos;authentification.</span>
      </p>
      {setup?.status === "error" && (
        <p role="alert" className="type-small font-semibold text-danger">
          {setup.message}
        </p>
      )}
      <div>
        <Button
          type="button"
          icon="lock"
          disabled={starting}
          aria-disabled={starting}
          onClick={() => startTransition(async () => setSetup(await startTotpEnrollment()))}
        >
          {starting ? "Préparation…" : "Configurer une application"}
        </Button>
      </div>
    </div>
  );
}
