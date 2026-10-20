import "server-only";
import sharp from "sharp";

/**
 * Every association image is re-encoded by the server before it is stored:
 * the bytes are checked (not the file name or the browser's claimed type),
 * decoded with a pixel ceiling, turned upright, resized to what the site
 * needs, and written as WebP WITHOUT metadata (no camera model, no GPS
 * position, no comments). What reaches Storage is always a clean, bounded
 * image, whatever was uploaded.
 */

/** Largest file accepted from the browser. */
export const UPLOAD_MAX_BYTES = 12 * 1024 * 1024;

/** Decoding stops beyond this many pixels (a "decompression bomb" guard). */
const MAX_INPUT_PIXELS = 60_000_000;

export type MediaKind = "logo" | "cover" | "image";

/** Longest side kept per use (covers are wide and shown large; logos small). */
const MAX_SIZE: Record<MediaKind, { width: number; height: number }> = {
  logo: { width: 1024, height: 1024 },
  cover: { width: 2400, height: 1600 },
  image: { width: 2000, height: 2000 },
};

export type ImageCheck =
  | { ok: true; buffer: Buffer; width: number; height: number; bytes: number }
  | { ok: false; message: string };

/** JPEG, PNG, WebP, GIF (first frame) and AVIF, recognised by their first bytes. */
export function sniffImageType(bytes: Uint8Array): "jpeg" | "png" | "webp" | "gif" | "avif" | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "png";
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (bytes.length >= 6 && (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")) return "gif";
  if (bytes.length >= 12 && ascii(4, 8) === "ftyp" && /^(avif|avis)$/.test(ascii(8, 12))) return "avif";
  return null;
}

export async function prepareImage(input: Uint8Array, kind: MediaKind): Promise<ImageCheck> {
  if (input.byteLength === 0) return { ok: false, message: "Le fichier est vide." };
  if (input.byteLength > UPLOAD_MAX_BYTES) {
    return { ok: false, message: "Image trop lourde : 12 Mo au plus. Exporte-la plus petite, puis réessaie." };
  }
  if (!sniffImageType(input)) {
    return { ok: false, message: "Format non accepté : JPEG, PNG, WebP, GIF ou AVIF seulement (pas de SVG ni de HEIC)." };
  }
  try {
    const { width, height } = MAX_SIZE[kind];
    const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", animated: false })
      .rotate()
      .resize({ width, height, fit: "inside", withoutEnlargement: true })
      .webp({ quality: kind === "logo" ? 90 : 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    if (info.width < 32 || info.height < 32) {
      return { ok: false, message: "Image trop petite : 32 pixels de côté au moins." };
    }
    return { ok: true, buffer: data, width: info.width, height: info.height, bytes: data.byteLength };
  } catch {
    return { ok: false, message: "Cette image n'a pas pu être lue : elle est peut-être abîmée ou trop grande." };
  }
}

/** A member's photo, re-encoded square and without metadata for the public team. */
export async function preparePortrait(input: Uint8Array): Promise<Buffer | null> {
  if (!sniffImageType(input)) return null;
  try {
    return await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error", animated: false })
      .rotate()
      .resize({ width: 640, height: 640, fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch {
    return null;
  }
}
