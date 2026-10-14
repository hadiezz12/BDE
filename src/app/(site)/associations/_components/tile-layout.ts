/**
 * Where each association tile sits on the index's poster wall. Not a uniform
 * grid: the rhythm changes with the screen.
 *
 *  - phone   (2 cols)  : groups of three — one full-width poster, two halves.
 *  - tablet  (6 cols)  : groups of five — two halves, then three thirds.
 *  - desktop (12 cols) : rows of three with asymmetric spans (5·4·3, 3·5·4,
 *                        4·3·5), so the big poster moves along each row.
 *
 * Classes are spelled out in full so Tailwind sees them.
 */

const PHONE = { 1: "col-span-1", 2: "col-span-2" } as const;
const TABLET = { 2: "sm:col-span-2", 3: "sm:col-span-3" } as const;
const DESKTOP = { 3: "lg:col-span-3", 4: "lg:col-span-4", 5: "lg:col-span-5" } as const;

const DESKTOP_ROWS: (3 | 4 | 5)[][] = [
  [5, 4, 3],
  [3, 5, 4],
  [4, 3, 5],
];

/** Position in its group and the size of that group (the last one may be short). */
function slot(index: number, total: number, size: number) {
  const start = index - (index % size);
  return { pos: index % size, count: Math.min(size, total - start), group: start / size };
}

function phoneSpan(index: number, total: number): 1 | 2 {
  const { pos, count } = slot(index, total, 3);
  if (count === 1) return 2;
  if (count === 2) return 1; // two halves rather than a full poster and an orphan
  return pos === 0 ? 2 : 1;
}

function tabletSpan(index: number, total: number): 2 | 3 {
  const { pos, count } = slot(index, total, 5);
  const pattern: Record<number, (2 | 3)[]> = {
    1: [3],
    2: [3, 3],
    3: [2, 2, 2],
    4: [3, 3, 3, 3],
    5: [3, 3, 2, 2, 2],
  };
  return pattern[count][pos];
}

function desktopSpan(index: number, total: number): 3 | 4 | 5 {
  const { pos, count, group } = slot(index, total, 3);
  if (count === 1) return 5;
  if (count === 2) return group % 2 === 0 ? ([5, 4] as const)[pos] : ([4, 5] as const)[pos];
  return DESKTOP_ROWS[group % DESKTOP_ROWS.length][pos];
}

export function tileLayout(index: number, total: number): { className: string; sizes: string } {
  const phone = phoneSpan(index, total);
  const tablet = tabletSpan(index, total);
  const desktop = desktopSpan(index, total);
  return {
    className: `${PHONE[phone]} ${TABLET[tablet]} ${DESKTOP[desktop]}`,
    sizes: `(min-width: 1024px) ${Math.round((desktop / 12) * 100)}vw, (min-width: 640px) ${tablet === 3 ? 50 : 33}vw, ${phone === 2 ? 100 : 50}vw`,
  };
}

/** Grid classes shared by the page and its loading skeleton. */
export const TILE_GRID =
  "grid grid-cols-2 gap-x-3 gap-y-10 sm:grid-cols-6 sm:gap-x-5 sm:gap-y-12 lg:grid-cols-12 lg:gap-x-6 lg:gap-y-16";
