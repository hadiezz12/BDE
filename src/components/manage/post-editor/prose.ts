import { cx } from "@/lib/cx";

/**
 * The editing surface's typography, mirroring the public article
 * (src/components/posts/RichText.tsx) element by element: ~18px on a 40rem
 * measure, two levels of subheads, quotes ruled in the association's colour,
 * square and numbered lists with coloured markers, the dotted divider. The
 * editor renders plain HTML elements, so they are styled from the editing
 * root down. Also: the empty-text and empty-subhead prompts (Placeholder),
 * and the outline of a selected block (an image, a divider).
 */
export const PROSE = cx(
  "min-h-[14rem] max-w-[40rem] text-[1.0625rem] leading-[1.75] outline-none sm:text-[1.125rem]",
  "[&>*+*]:mt-5",
  // Subheads.
  "[&>h2]:mt-11 [&_h2]:text-[1.55rem] [&_h2]:font-extrabold [&_h2]:leading-[1.15] [&_h2]:[font-stretch:92%] sm:[&_h2]:text-[1.75rem]",
  "[&>h3]:mt-8 [&_h3]:text-[1.2rem] [&_h3]:font-extrabold [&_h3]:leading-snug [&_h3]:[font-stretch:96%]",
  // Inline marks.
  "[&_strong]:font-bold",
  "[&_a]:font-semibold [&_a]:text-fg [&_a]:underline [&_a]:decoration-assoc [&_a]:decoration-2 [&_a]:underline-offset-[0.18em]",
  // Lists.
  "[&_ul]:flex [&_ul]:list-[square] [&_ul]:flex-col [&_ul]:gap-2 [&_ul]:pl-6",
  "[&_ol]:flex [&_ol]:list-decimal [&_ol]:flex-col [&_ol]:gap-2 [&_ol]:pl-6",
  "[&_li]:pl-1 [&_li]:marker:text-assoc-text [&_ol>li]:marker:font-bold [&_li>*+*]:mt-2",
  // Quotes.
  "[&_blockquote]:border-l-4 [&_blockquote]:border-assoc [&_blockquote]:py-1 [&_blockquote]:pl-5 [&_blockquote]:text-[1.2rem] [&_blockquote]:font-semibold [&_blockquote]:leading-[1.6] [&_blockquote]:[font-stretch:96%] [&_blockquote>*+*]:mt-4",
  // Divider.
  "[&_hr]:mx-auto [&_hr]:my-4 [&_hr]:h-2 [&_hr]:w-24 [&_hr]:border-0 [&_hr]:bg-[radial-gradient(circle,var(--fg)_1.5px,transparent_2px)] [&_hr]:bg-[length:12px_8px] [&_hr]:bg-repeat-x",
  // A block selected as a whole (divider; images draw their own outline).
  "[&_hr.ProseMirror-selectednode]:outline-2 [&_hr.ProseMirror-selectednode]:outline-offset-4 [&_hr.ProseMirror-selectednode]:outline-[var(--focus)]",
  // Prompts in an empty text and an empty subhead.
  "[&_p.is-editor-empty:first-child]:before:pointer-events-none [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:h-0 [&_p.is-editor-empty:first-child]:before:text-subtle [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]",
  "[&_:is(h2,h3).is-empty]:before:pointer-events-none [&_:is(h2,h3).is-empty]:before:float-left [&_:is(h2,h3).is-empty]:before:h-0 [&_:is(h2,h3).is-empty]:before:text-subtle [&_:is(h2,h3).is-empty]:before:content-[attr(data-placeholder)]",
);
