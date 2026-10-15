/**
 * Server-side validation of what a student types about themselves. The
 * database checks the same limits (constraints on public.profiles); this
 * runs first so the form can say which field is wrong, in French.
 *
 * Only these fields exist. The browser never sends an id: the server writes
 * to the profile of the signed-in user, whoever the form claims to be.
 *
 * No path-alias imports: the unit tests load this file with plain Node.
 */

export const NAME_MAX = 60;
export const PROGRAM_MAX = 80;
export const STUDY_YEARS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export interface ProfileInput {
  firstName: string;
  lastName: string;
  displayName: string | null;
  program: string | null;
  studyYear: number | null;
}

export type ProfileField = keyof ProfileInput;
export type ProfileErrors = Partial<Record<ProfileField, string>>;

export type ProfileValidation =
  | { ok: true; values: ProfileInput }
  | { ok: false; errors: ProfileErrors };

type Source = { get(name: string): FormDataEntryValue | null };

/** Trims, collapses inner spaces and rejects control characters. */
function clean(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

const CONTROL = /[\u0000-\u001f\u007f]/;

function checkText(value: string, max: number, label: string, required: boolean): string | undefined {
  if (!value) return required ? `Indique ${label}.` : undefined;
  if (value.length > max) return `${max} caractères maximum.`;
  if (CONTROL.test(value)) return "Ce champ contient des caractères non autorisés.";
  return undefined;
}

export function validateProfileInput(form: Source): ProfileValidation {
  const firstName = clean(form.get("firstName"));
  const lastName = clean(form.get("lastName"));
  const displayName = clean(form.get("displayName"));
  const program = clean(form.get("program"));
  const yearRaw = clean(form.get("studyYear"));

  const errors: ProfileErrors = {};
  const first = checkText(firstName, NAME_MAX, "ton prénom", true);
  if (first) errors.firstName = first;
  const last = checkText(lastName, NAME_MAX, "ton nom", true);
  if (last) errors.lastName = last;
  const display = checkText(displayName, NAME_MAX, "", false);
  if (display) errors.displayName = display;
  const prog = checkText(program, PROGRAM_MAX, "", false);
  if (prog) errors.program = prog;

  let studyYear: number | null = null;
  if (yearRaw) {
    const n = Number(yearRaw);
    if (!Number.isInteger(n) || !(STUDY_YEARS as readonly number[]).includes(n)) {
      errors.studyYear = "Choisis une année dans la liste.";
    } else {
      studyYear = n;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    values: {
      firstName,
      lastName,
      displayName: displayName || null,
      program: program || null,
      studyYear,
    },
  };
}

/** Accepted avatar uploads (the bucket enforces the same list and 2 MB). */
export const AVATAR_TYPES = ["image/webp", "image/png", "image/jpeg"] as const;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** "<user id>/<uuid>.<webp|png|jpg>", inside the given user's folder only. */
export function isOwnAvatarPath(path: string, userId: string): boolean {
  return new RegExp(
    `^${userId}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(webp|png|jpg)$`,
  ).test(path);
}

/** "1re année", "2e année"… */
export function studyYearLabel(year: number): string {
  return year === 1 ? "1re année" : `${year}e année`;
}

/**
 * The image type from the file's first bytes, never from its name or the
 * browser's claim: "webp", "png", "jpg", or null for anything else.
 */
export function sniffImage(bytes: Uint8Array): "webp" | "png" | "jpg" | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp";
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  ) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

export const AVATAR_CONTENT_TYPE = { webp: "image/webp", png: "image/png", jpg: "image/jpeg" } as const;
