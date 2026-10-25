/**
 * Application documents (CV, portfolio…): which files a question takes, and
 * what a file really is, from its first bytes — never from its name or the
 * type the browser claims. The upload route refuses a file whose content
 * does not match (a renamed .exe, a Word file with macros…). Pure module:
 * the unit tests load it with plain Node.
 *
 * There is no malware scanner on this platform: these checks keep out
 * executable and macro formats, they do not prove a PDF harmless. Files are
 * only ever handed back to their own candidate, as downloads.
 */

import type { DocumentKind } from "../types";

export const DOCUMENT_MIME: Record<string, DocumentKind> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/jpeg": "image",
  "image/png": "image",
};

export const KIND_LABEL: Record<DocumentKind, string> = { pdf: "PDF", docx: "Word (.docx)", image: "image (JPEG ou PNG)" };

/** The file input's accept attribute for these kinds. */
export function acceptFor(kinds: DocumentKind[]): string {
  const out: string[] = [];
  if (kinds.includes("pdf")) out.push(".pdf", "application/pdf");
  if (kinds.includes("docx")) out.push(".docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  if (kinds.includes("image")) out.push(".jpg", ".jpeg", ".png", "image/jpeg", "image/png");
  return out.join(",");
}

/** "PDF ou Word (.docx)". */
export function kindsLine(kinds: DocumentKind[]): string {
  const names = kinds.map((k) => KIND_LABEL[k]);
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} ou ${names[names.length - 1]}` : (names[0] ?? "");
  return `${list.charAt(0).toUpperCase()}${list.slice(1)}`;
}

/** "PDF ou Word (.docx), 5 Mo au plus". */
export function formatsLine(kinds: DocumentKind[], maxMb: number): string {
  return `${kindsLine(kinds)}, ${maxMb} Mo au plus`;
}

export function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / (1024 * 1024)).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} Mo`;
}

const startsWith = (bytes: Uint8Array, sig: number[]) => sig.every((b, i) => bytes[i] === b);

/** Latin-1 view of the bytes, to find the zip entry names a .docx must (and must not) carry. */
function ascii(bytes: Uint8Array): string {
  let s = "";
  const n = Math.min(bytes.length, 4 * 1024 * 1024);
  for (let i = 0; i < n; i += 8192) s += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, n)));
  return s;
}

/**
 * What the bytes are, as a MIME type the database accepts, or null (anything
 * else: executables, archives, macro documents, HTML, SVG…).
 */
export function sniffDocument(bytes: Uint8Array): string | null {
  if (bytes.length < 8) return null;
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // A zip: a Word document only if it has its parts, and never one with
    // macros, embedded objects or ActiveX controls (entry names are stored
    // uncompressed in the zip headers).
    const names = ascii(bytes);
    if (!names.includes("[Content_Types].xml") || !names.includes("word/document.xml")) return null;
    if (/vbaProject|vbaData|word\/embeddings\/|word\/activeX\//i.test(names)) return null;
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return null;
}

/** A file name safe to show and to put in a download header (no path, no control characters). */
export function safeFileName(name: string, mime: string): string {
  const ext = DOCUMENT_MIME[mime] === "docx" ? ".docx" : mime === "application/pdf" ? ".pdf" : mime === "image/png" ? ".png" : ".jpg";
  const base = name
    .split(/[/\\]/)
    .pop()!
    .replace(/[\u0000-\u001f\u007f"<>|:*?]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.[a-z0-9]{1,5}$/i, "")
    .slice(0, 100)
    .trim();
  return `${base || "document"}${ext}`;
}

/** Content-Disposition for a download: ASCII fallback plus the UTF-8 name (RFC 6266). */
export function attachmentHeader(name: string): string {
  const fallback = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]|["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
