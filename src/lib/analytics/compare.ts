/**
 * Changes between two periods and rates (Phase 13, brief §21–22), written
 * once so every tile, table and export says the same thing:
 *   - previous 0 and current > 0: "new activity", never "+Infinity %";
 *   - both 0: "no activity, before either";
 *   - a hidden or missing value on either side: not comparable;
 *   - a rate whose denominator is 0: no rate ("—"), never 0 % or 100 %.
 * A change is a difference, not a cause: the words never say why.
 * Pure module (relative imports with extensions only): the unit tests load it with plain Node.
 */

export type Change =
  | { kind: "none" }
  | { kind: "same_zero" }
  | { kind: "new"; delta: number }
  | { kind: "flat" }
  | { kind: "up" | "down"; delta: number; pct: number };

export function change(current: number | null | undefined, previous: number | null | undefined): Change {
  if (current == null || previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) return { kind: "none" };
  if (previous === 0) return current === 0 ? { kind: "same_zero" } : { kind: "new", delta: current };
  if (current === previous) return { kind: "flat" };
  const delta = current - previous;
  return { kind: delta > 0 ? "up" : "down", delta, pct: delta / previous };
}

const pctFmt = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const pctFmt1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const intFmt = new Intl.NumberFormat("fr-FR");

export function formatCount(n: number | null | undefined): string {
  return n == null ? "—" : intFmt.format(n);
}

/** "+20 %", "−8 %" (a true minus sign), with one decimal under 10 %. */
export function formatPctChange(pct: number): string {
  const v = Math.abs(pct * 100);
  const s = (v < 10 ? pctFmt1 : pctFmt).format(v);
  return `${pct > 0 ? "+" : "−"}${s} %`;
}

/** The words under a tile ("+20 % (100 avant)"); null when there is nothing to say. */
export function describeChange(c: Change, previous: number | null | undefined): string | null {
  switch (c.kind) {
    case "none":
      return null;
    case "same_zero":
      return "Aucune activité, ni avant";
    case "new":
      return "Nouvelle activité (0 avant)";
    case "flat":
      return `Stable (${formatCount(previous)} avant)`;
    default:
      return `${formatPctChange(c.pct)} (${formatCount(previous)} avant)`;
  }
}

/** A share between 0 and 1, or null when the denominator is 0 or a side is hidden. */
export function rate(numerator: number | null | undefined, denominator: number | null | undefined): number | null {
  if (numerator == null || denominator == null || !Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator <= 0) return null;
  return numerator / denominator;
}

/** "42 %", "—" when there is no rate. Never rounds a non-zero share to 0 % or a partial one to 100 %. */
export function formatRate(r: number | null): string {
  if (r == null) return "—";
  const v = r * 100;
  if (v > 0 && v < 1) return "< 1 %";
  if (v < 100 && v > 99) return "> 99 %";
  return `${pctFmt.format(v)} %`;
}

/** Hours as "3 h", "1,5 j" beyond 48 hours. */
export function formatHours(h: number | null | undefined): string {
  if (h == null) return "—";
  if (h < 1) return "< 1 h";
  if (h < 48) return `${pctFmt1.format(h)} h`;
  return `${pctFmt1.format(h / 24)} j`;
}
