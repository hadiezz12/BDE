"use client";

import { useRef, useState, type FormEvent } from "react";
import { toSafeHref } from "@/lib/posts/document";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Field";
import { DialogHeader, useInitialFocus } from "./DialogHeader";

const EMAIL = /^[^\s@/:]+@[^\s@/]+\.[a-z]{2,}$/i;

/** An address as typed → the link stored, or null: "asso.fr" → https://asso.fr, "bde@ecole.fr" → mailto:. */
export function linkFromInput(raw: string): string | null {
  const v = raw.trim();
  return EMAIL.test(v) ? toSafeHref(`mailto:${v}`) : toSafeHref(v);
}

export interface LinkRequest {
  /** The link under the cursor, when editing one. */
  href: string | null;
  /** Text is selected (or a link is being edited): the link goes on it, no text to ask for. */
  onText: boolean;
}

/**
 * Adds, changes or removes a link. Only web pages, e-mail addresses and
 * pages of the site are accepted (the same rule as the server's); the
 * address is shown as it will be stored before it is applied.
 */
export function LinkDialog({
  request,
  onClose,
  onApply,
  onRemove,
}: {
  request: LinkRequest | null;
  onClose: () => void;
  onApply: (href: string, text: string | null) => void;
  onRemove: () => void;
}) {
  return (
    <Dialog open={request !== null} onClose={onClose} label={request?.href ? "Modifier le lien" : "Ajouter un lien"} surface="studio">
      {request && (
        // Remounted for each request: the fields start from the link being edited.
        <LinkForm key={request.href ?? "new"} request={request} onClose={onClose} onApply={onApply} onRemove={onRemove} />
      )}
    </Dialog>
  );
}

function LinkForm({
  request,
  onClose,
  onApply,
  onRemove,
}: {
  request: LinkRequest;
  onClose: () => void;
  onApply: (href: string, text: string | null) => void;
  onRemove: () => void;
}) {
  const [address, setAddress] = useState(request.href ?? "");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>();
  const addressRef = useRef<HTMLInputElement>(null);
  useInitialFocus(addressRef);
  const href = address.trim() ? linkFromInput(address) : null;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!href) {
      setError(
        address.trim()
          ? "Cette adresse n'est pas acceptée : un site (https://…), une adresse e-mail ou une page du site (/…)."
          : "Indique l'adresse du lien.",
      );
      return;
    }
    onApply(href, request.onText ? null : text.trim() || null);
  }

  return (
    <>
      <DialogHeader title={request.href ? "Modifier le lien" : "Ajouter un lien"} onClose={onClose} />
      <form onSubmit={submit} noValidate className="flex flex-col gap-5 px-5 py-5 sm:px-6">
        <Field
          label="Adresse"
          error={error}
          hint={
            href && href !== address.trim() ? (
              <>
                Le lien mènera à <span className="break-all font-mono text-fg">{href}</span>
              </>
            ) : (
              "Un site (https://…), une adresse e-mail, ou une page du site comme /associations/…"
            )
          }
        >
          {({ id, describedBy, invalid }) => (
            <Input
              ref={addressRef}
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid}
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setError(undefined);
              }}
              inputMode="url"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              maxLength={2000}
              placeholder="Ex : https://site-de-ton-asso.fr"
            />
          )}
        </Field>
        {!request.onText && (
          <Field label="Texte du lien" optional hint="Les mots sur lesquels on clique. Sans texte, l'adresse s'affiche.">
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={200}
                autoComplete="off"
              />
            )}
          </Field>
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Button type="submit" icon="check" iconPosition="start">
            {request.href ? "Mettre à jour" : "Ajouter le lien"}
          </Button>
          {request.href && (
            <Button type="button" variant="danger" icon="close" iconPosition="start" onClick={onRemove}>
              Retirer le lien
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            Annuler
          </Button>
        </div>
      </form>
    </>
  );
}
