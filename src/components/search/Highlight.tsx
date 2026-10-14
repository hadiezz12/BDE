import { Fragment } from "react";
import { normaliseQuery } from "@/lib/search";

/** Same folding as the search itself: accents and case ignored. */
const fold = (ch: string) => ch.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Marks the query words inside a result title the way the search matched
 * them ("evenement" lights up "Événement"). Server-safe, no hooks. The marks
 * are underlined in the row's association accent, never colour alone.
 */
export function Highlight({ text, query }: { text: string; query: string }) {
  const words = normaliseQuery(query).split(/\s+/).filter(Boolean);
  if (!words.length) return text;

  // Folded copy of the text, with each folded code unit pointing back to its source character.
  const chars = Array.from(text);
  let folded = "";
  const owner: number[] = [];
  chars.forEach((ch, i) => {
    const f = fold(ch);
    for (let k = 0; k < f.length; k++) owner.push(i);
    folded += f;
  });

  const marked = new Array<boolean>(chars.length).fill(false);
  for (const w of words) {
    for (let at = folded.indexOf(w); at !== -1; at = folded.indexOf(w, at + 1)) {
      for (let k = at; k < at + w.length; k++) marked[owner[k]] = true;
    }
  }
  if (!marked.some(Boolean)) return text;

  const runs: { text: string; mark: boolean }[] = [];
  chars.forEach((ch, i) => {
    const last = runs[runs.length - 1];
    if (last && last.mark === marked[i]) last.text += ch;
    else runs.push({ text: ch, mark: marked[i] });
  });

  return (
    <>
      {runs.map((r, i) =>
        r.mark ? (
          <mark
            key={i}
            className="bg-transparent text-assoc-text underline decoration-assoc decoration-2 underline-offset-[0.2em]"
          >
            {r.text}
          </mark>
        ) : (
          <Fragment key={i}>{r.text}</Fragment>
        ),
      )}
    </>
  );
}
