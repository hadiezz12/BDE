"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cx } from "@/lib/cx";
import { Button } from "@/components/ui/Button";

/**
 * Sharing an article, the quiet way: the phone's own share sheet where the
 * browser has one (navigator.share: messages, Instagram, mail… whatever the
 * student uses), and "copy the link" everywhere. No social network buttons,
 * no third-party script. When the clipboard is refused (an old browser, a
 * page not served over https), the link is shown selected, to copy by hand.
 */
export function ShareArticle({ title, path, className }: { title: string; path: string; className?: string }) {
  const canShare = useSyncExternalStore(noSubscription, hasNativeShare, () => false);
  const [copied, setCopied] = useState(false);
  const [manualUrl, setManualUrl] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const manualRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (manualUrl) manualRef.current?.select();
  }, [manualUrl]);

  /** The address as the visitor reached the site (same host, same scheme). */
  const url = () => new URL(path, window.location.origin).toString();

  async function copy() {
    const href = url();
    try {
      await navigator.clipboard.writeText(href);
      setManualUrl(null);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 4000);
    } catch {
      setCopied(false);
      setManualUrl(href);
    }
  }

  async function share() {
    try {
      await navigator.share({ title, url: url() });
    } catch (error) {
      // Closing the share sheet is not an error; anything else falls back to copying.
      if (error instanceof DOMException && error.name === "AbortError") return;
      await copy();
    }
  }

  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {canShare && (
          <Button size="sm" variant="secondary" icon="share" iconPosition="start" onClick={share}>
            Partager
          </Button>
        )}
        <Button size="sm" variant="secondary" icon={copied ? "check" : "link"} iconPosition="start" onClick={copy}>
          Copier le lien
        </Button>
        <p role="status" className="type-small font-semibold text-ok">
          {copied ? "Lien copié." : ""}
        </p>
      </div>
      {manualUrl && (
        <label className="flex max-w-md flex-col gap-1.5">
          <span className="type-small text-muted">La copie automatique n&apos;a pas marché : copie ce lien.</span>
          <input
            ref={manualRef}
            readOnly
            value={manualUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="min-h-11 w-full rounded-sm border border-line-strong bg-raised px-3 type-meta text-fg"
          />
        </label>
      )}
    </div>
  );
}

function noSubscription() {
  return () => {};
}

function hasNativeShare(): boolean {
  return typeof navigator.share === "function";
}
