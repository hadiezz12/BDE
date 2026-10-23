/**
 * The article body format: a small, fixed subset of the editor's JSON
 * document (Tiptap / ProseMirror), never HTML. Pure module (no path-alias
 * imports): the unit tests load it with plain Node.
 *
 * Three layers keep it safe:
 *   1. the editor only knows these nodes and marks, so pasting from another
 *      site keeps text and basic structure and drops everything else;
 *   2. the server normalizes what it receives with normalizeDocument()
 *      (unknown keys dropped, unsafe links unlinked, images only as library
 *      references) before saving;
 *   3. the database refuses anything else (private.valid_post_body), and the
 *      site renders the document itself, element by element (RichText), so
 *      no stored string is ever interpreted as markup.
 */

export type Mark = { type: "bold" } | { type: "italic" } | { type: "link"; attrs: { href: string } };

export type TextNode = { type: "text"; text: string; marks?: Mark[] };
export type HardBreak = { type: "hardBreak" };
export type InlineNode = TextNode | HardBreak;

export interface ImageNode {
  type: "image";
  attrs: { mediaId: string; alt: string | null; caption: string | null };
}

export type BlockNode =
  | { type: "paragraph"; content?: InlineNode[] }
  | { type: "heading"; attrs: { level: 2 | 3 }; content?: InlineNode[] }
  | { type: "bulletList" | "orderedList"; content: ListItem[] }
  | { type: "blockquote"; content: BlockNode[] }
  | { type: "horizontalRule" }
  | ImageNode;

export interface ListItem {
  type: "listItem";
  content: BlockNode[];
}

export interface PostDocument {
  type: "doc";
  content: BlockNode[];
}

export const EMPTY_DOCUMENT: PostDocument = { type: "doc", content: [] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Links the site accepts: web pages, e-mail, or a page of the site. Same rule as the database. */
export function isSafeHref(href: unknown): href is string {
  return (
    typeof href === "string" &&
    href.length <= 2000 &&
    // Case matters, as in the database check: schemes in lower case.
    /^(https?:\/\/[^\s]+|mailto:[^\s]+|\/[a-z0-9][^\s]*)$/.test(href) &&
    !/^https?:\/\/[^/]*@/i.test(href)
  );
}

/** An address as typed → a safe link, or null ("ton-asso.fr" becomes https://ton-asso.fr). */
export function toSafeHref(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^(https?|mailto):/i.test(v)) return null;
  const withScheme = v.replace(/^(https?|mailto):/i, (scheme) => scheme.toLowerCase());
  const candidate = /^(https?:\/\/|mailto:|\/)/.test(withScheme) ? withScheme : `https://${withScheme}`;
  return isSafeHref(candidate) ? candidate : null;
}

/** Whether a link leaves the site (opens in a new tab, says so). */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

const LIMITS = { text: 20000, alt: 200, caption: 200, depth: 6, blocks: 2000 };

type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  // Control characters (except tabs and line ends) never belong in text.
  const v = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
  return v.length > max ? v.slice(0, max) : v;
}

function cleanLine(value: unknown, max: number): string | null {
  const v = cleanText(value, max);
  if (v === null) return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
}

function normalizeMarks(marks: unknown): Mark[] | undefined {
  if (!Array.isArray(marks)) return undefined;
  const out: Mark[] = [];
  for (const m of marks) {
    if (!m || typeof m !== "object") continue;
    const type = (m as { type?: unknown }).type;
    if (type === "bold" || type === "italic") {
      if (!out.some((x) => x.type === type)) out.push({ type });
    } else if (type === "link") {
      const href = (m as { attrs?: { href?: unknown } }).attrs?.href;
      // An unsafe link is dropped; its text stays.
      if (isSafeHref(href) && !out.some((x) => x.type === "link")) out.push({ type: "link", attrs: { href } });
    }
  }
  return out.length ? out : undefined;
}

function normalizeInline(nodes: unknown): InlineNode[] {
  if (!Array.isArray(nodes)) return [];
  const out: InlineNode[] = [];
  for (const n of nodes) {
    if (!n || typeof n !== "object") continue;
    const type = (n as { type?: unknown }).type;
    if (type === "text") {
      const text = cleanText((n as { text?: unknown }).text, LIMITS.text);
      if (!text) continue;
      const marks = normalizeMarks((n as { marks?: unknown }).marks);
      out.push(marks ? { type: "text", text, marks } : { type: "text", text });
    } else if (type === "hardBreak") {
      out.push({ type: "hardBreak" });
    }
  }
  return out;
}

function normalizeBlocks(nodes: unknown, depth: number, counter: { n: number }): Result<BlockNode[]> {
  if (!Array.isArray(nodes)) return { ok: true, value: [] };
  if (depth > LIMITS.depth) return { ok: false, reason: "too_deep" };
  const out: BlockNode[] = [];
  for (const n of nodes) {
    if (++counter.n > LIMITS.blocks) return { ok: false, reason: "too_long" };
    if (!n || typeof n !== "object") continue;
    const node = n as { type?: unknown; attrs?: Record<string, unknown>; content?: unknown };
    switch (node.type) {
      case "paragraph": {
        const content = normalizeInline(node.content);
        out.push(content.length ? { type: "paragraph", content } : { type: "paragraph" });
        break;
      }
      case "heading": {
        const raw = Number(node.attrs?.level);
        const level: 2 | 3 = raw >= 3 ? 3 : 2;
        const content = normalizeInline(node.content);
        if (content.length) out.push({ type: "heading", attrs: { level }, content });
        break;
      }
      case "bulletList":
      case "orderedList": {
        const items: ListItem[] = [];
        for (const item of Array.isArray(node.content) ? node.content : []) {
          if (!item || typeof item !== "object" || (item as { type?: unknown }).type !== "listItem") continue;
          const inner = normalizeBlocks((item as { content?: unknown }).content, depth + 1, counter);
          if (!inner.ok) return inner;
          items.push({ type: "listItem", content: inner.value.length ? inner.value : [{ type: "paragraph" }] });
        }
        if (items.length) out.push({ type: node.type, content: items });
        break;
      }
      case "blockquote": {
        const inner = normalizeBlocks(node.content, depth + 1, counter);
        if (!inner.ok) return inner;
        if (inner.value.length) out.push({ type: "blockquote", content: inner.value });
        break;
      }
      case "horizontalRule":
        out.push({ type: "horizontalRule" });
        break;
      case "image": {
        const mediaId = node.attrs?.mediaId;
        // Only a reference to the association's library: never an outside URL.
        if (typeof mediaId === "string" && UUID.test(mediaId)) {
          out.push({
            type: "image",
            attrs: {
              mediaId,
              alt: cleanLine(node.attrs?.alt, LIMITS.alt),
              caption: cleanLine(node.attrs?.caption, LIMITS.caption),
            },
          });
        }
        break;
      }
      default:
        // Anything else (script, iframe, raw HTML…) is dropped.
        break;
    }
  }
  return { ok: true, value: out };
}

/** Any input → a document the site can store and render, or a reason to refuse it. */
export function normalizeDocument(input: unknown): Result<PostDocument> {
  if (!input || typeof input !== "object" || (input as { type?: unknown }).type !== "doc") {
    return { ok: false, reason: "not_a_document" };
  }
  const blocks = normalizeBlocks((input as { content?: unknown }).content, 0, { n: 0 });
  if (!blocks.ok) return blocks;
  // Trailing empty paragraphs (the editor's last line) carry nothing.
  const content = [...blocks.value];
  while (content.length && content[content.length - 1].type === "paragraph" && !("content" in content[content.length - 1])) {
    content.pop();
  }
  const doc: PostDocument = { type: "doc", content };
  if (JSON.stringify(doc).length > 180000) return { ok: false, reason: "too_long" };
  return { ok: true, value: doc };
}

function walk(nodes: readonly (BlockNode | ListItem)[], visit: (n: BlockNode | ListItem) => void) {
  for (const n of nodes) {
    visit(n);
    if ("content" in n && Array.isArray(n.content) && n.type !== "paragraph" && n.type !== "heading") {
      walk(n.content as (BlockNode | ListItem)[], visit);
    }
  }
}

/** The plain text of a document (search, reading time, previews). */
export function documentText(doc: PostDocument): string {
  const parts: string[] = [];
  walk(doc.content, (n) => {
    if ((n.type === "paragraph" || n.type === "heading") && n.content) {
      parts.push(n.content.map((c) => (c.type === "text" ? c.text : " ")).join(""));
    }
  });
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/** Every image the document uses, in order. */
export function documentImages(doc: PostDocument): ImageNode[] {
  const out: ImageNode[] = [];
  walk(doc.content, (n) => {
    if (n.type === "image") out.push(n);
  });
  return out;
}

export function readingMinutes(intro: string | null | undefined, doc: PostDocument): number {
  const words = `${intro ?? ""} ${documentText(doc)}`.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** The headings, for a long article's table of contents (and the heading-order check). */
export function documentHeadings(doc: PostDocument): { level: 2 | 3; text: string }[] {
  return doc.content
    .filter((n): n is Extract<BlockNode, { type: "heading" }> => n.type === "heading")
    .map((n) => ({ level: n.attrs.level, text: (n.content ?? []).map((c) => (c.type === "text" ? c.text : " ")).join("") }));
}

export interface QualityNote {
  key: string;
  message: string;
}

/**
 * Small editorial reminders, never a score: what readers will miss, in the
 * editor's words. Nothing here blocks saving.
 */
export function qualityNotes(input: {
  kind: string;
  title: string;
  intro: string | null;
  doc: PostDocument;
  hasCover: boolean;
}): QualityNote[] {
  const notes: QualityNote[] = [];
  const text = documentText(input.doc);
  if (input.title.trim().length > 90) {
    notes.push({ key: "title", message: "Le titre est long : sur téléphone, il tiendra sur quatre lignes ou plus." });
  }
  if (!input.intro) notes.push({ key: "intro", message: "Pas d'introduction : c'est elle qui s'affiche dans le fil." });
  if (!input.hasCover && input.kind !== "breve") {
    notes.push({ key: "cover", message: "Pas d'image de couverture : le fil affichera une affiche à la couleur de l'asso." });
  }
  const noAlt = documentImages(input.doc).filter((i) => !i.attrs.alt).length;
  if (noAlt > 0) {
    notes.push({
      key: "alt",
      message: noAlt === 1 ? "Une image n'a pas de description." : `${noAlt} images n'ont pas de description.`,
    });
  }
  if ((input.kind === "article" || input.kind === "recap") && text.length < 200) {
    notes.push({ key: "short", message: "Le texte est très court pour un article : une annonce ou une brève irait peut-être mieux." });
  }
  const headings = documentHeadings(input.doc);
  if (headings.length && headings[0].level === 3) {
    notes.push({ key: "headings", message: "Le premier intertitre est un petit intertitre : commence par un grand." });
  }
  return notes;
}

/** A tag as typed → its stored form ("Week-end d'intégration" → "week-end-d-integration"), or null. */
export function normalizeTag(raw: string): string | null {
  const t = raw
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    // Ligatures spelled out, as the database's fold_accents does.
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  return t.length >= 2 ? t : null;
}
