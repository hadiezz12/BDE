import { cx } from "@/lib/cx";
import { NeonText } from "@/components/brand/NeonText";

/**
 * The club's own line, set as the page's only h1: the first half in ink, the
 * second half as the maquette's flickering neon tube.
 *  - flicker : the home page (power-on stutter, then rare flickers)
 *  - off     : the loading state — the tube is unlit until the page arrives,
 *              so the page "switches the sign on" instead of blinking twice.
 */
export function HomeHeadline({
  id,
  state = "flicker",
  className,
}: {
  id?: string;
  state?: "flicker" | "lit" | "off";
  className?: string;
}) {
  return (
    <h1 id={id} className={cx("type-hero break-words", className)}>
      Paris by night,
      <br />
      {state === "off" ? (
        <span className="text-subtle">version très rose.</span>
      ) : (
        <NeonText flicker={state === "flicker"}>version très rose.</NeonText>
      )}
    </h1>
  );
}
