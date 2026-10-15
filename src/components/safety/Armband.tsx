import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";

/**
 * A pink "Référent·e VSS & VDH" armband, drawn as a sticker band (wordmark
 * keyline on night, ink outline on paper). NOT USED in Phase 1: the BDE says
 * its référent·es are identifiable on every event, not how. Only show this
 * once the bureau confirms they wear an armband like it. Decorative: the
 * heading next to it must say it.
 */
export function Armband({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cx("overflow-hidden py-5", className)}>
      <div className="-mx-6 flex -rotate-3 items-center justify-center gap-3 border-y-[3px] border-sticker-line bg-accent px-6 py-3.5 text-accent-fg shadow-sticker">
        <Icon name="shield" size={20} strokeWidth={2.25} className="shrink-0" />
        <span className="type-button whitespace-nowrap text-[0.95rem] tracking-[0.1em] sm:text-[1.05rem]">
          Référent·e VSS &amp; VDH
        </span>
        <Icon name="shield" size={20} strokeWidth={2.25} className="shrink-0" />
      </div>
    </div>
  );
}
