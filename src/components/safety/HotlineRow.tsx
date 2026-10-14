import type { SafetyHotline } from "@/lib/types";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/ui/Icon";

/**
 * A national number as a row: the number itself huge and condensed (it is
 * what people need to remember), then who answers, when, and one explicit
 * action. Amber because this is safety; no glow, nothing flashing.
 */
export function HotlineRow({
  hotline,
  size = "md",
  headingLevel = 3,
}: {
  hotline: SafetyHotline;
  size?: "lg" | "md";
  headingLevel?: 3 | 4;
}) {
  const H = headingLevel === 4 ? "h4" : "h3";
  const isNumber = /^\d+$/.test(hotline.number);
  const isWeb = hotline.href.startsWith("http");
  return (
    <div className="grid grid-cols-[5.75rem_minmax(0,1fr)] gap-x-4 gap-y-4 py-5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-x-6 sm:gap-y-3">
      {isNumber ? (
        <p
          className={cx(
            "whitespace-nowrap type-numeral text-warn",
            size === "lg" ? "text-[3.5rem] sm:text-[4.5rem]" : "text-[2.75rem] sm:text-[3.5rem]",
          )}
        >
          {hotline.number}
        </p>
      ) : (
        <span aria-hidden className="pt-1 text-warn">
          <Icon name="globe" size={40} />
        </span>
      )}
      <div className="flex min-w-0 flex-col gap-1.5">
        <H className="text-[1.05rem] font-bold leading-snug">{hotline.name}</H>
        {!isNumber && <p className="break-all type-meta text-fg">{hotline.number}</p>}
        <p className="type-small text-muted">{hotline.detail}</p>
      </div>
      {/* Phones: the action gets its own full row; from sm it sits under the text. */}
      <a
        href={hotline.href}
        className="col-span-2 inline-flex min-h-11 w-fit items-center gap-2 rounded-sm border-2 border-warn px-4 type-button text-warn transition-colors hover:bg-warn/10 sm:col-span-1 sm:col-start-2"
      >
        <Icon name={isWeb ? "external" : "phone"} size={17} />
        {hotline.actionLabel}
      </a>
    </div>
  );
}
