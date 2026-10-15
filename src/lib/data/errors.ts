import type { PostgrestError } from "@supabase/supabase-js";

/**
 * The boundary between database errors and the interface.
 *
 * A data loader that gets an error from Supabase throws `toDataError(error)`.
 * The UI only ever sees a kind and a French sentence written for the person
 * using the site; the Postgres detail (constraint names, SQL, the values that
 * clashed) stays on the server. A loader that knows better words for its
 * case passes them: `toDataError(error, { conflict: "Tu es déjà membre de
 * cette association." })`.
 *
 * Log with `logDataError`, never with the raw error: PostgrestError.details
 * and .hint can contain the submitted values (emails, answers, names).
 */

export type DataErrorKind = "not_found" | "conflict" | "invalid" | "forbidden" | "unavailable" | "unexpected";

const DEFAULT_MESSAGE: Record<DataErrorKind, string> = {
  not_found: "Cet élément n'existe pas ou n'est plus disponible.",
  conflict: "Cet élément existe déjà.",
  invalid: "Certaines informations ne sont pas valides.",
  forbidden: "Tu n'as pas les droits pour faire ça.",
  unavailable: "Le service est momentanément indisponible. Réessaie dans un instant.",
  unexpected: "Une erreur inattendue est survenue. Réessaie, et préviens le BDE si ça continue.",
};

type ErrorLike = Pick<PostgrestError, "code" | "message">;

export class DataError extends Error {
  readonly kind: DataErrorKind;
  /** Safe to show as is. */
  readonly userMessage: string;
  /** SQLSTATE or PostgREST code, for logs only. */
  readonly code: string | undefined;

  constructor(kind: DataErrorKind, userMessage: string, code?: string) {
    super(`DataError(${kind}${code ? `, ${code}` : ""})`);
    this.name = "DataError";
    this.kind = kind;
    this.userMessage = userMessage;
    this.code = code;
  }
}

export function toDataError(
  error: ErrorLike | null | undefined,
  messages: Partial<Record<DataErrorKind, string>> = {},
): DataError {
  const kind = classify(error);
  return new DataError(kind, messages[kind] ?? DEFAULT_MESSAGE[kind], error?.code || undefined);
}

/**
 * Server-side log line for a failed data operation. Records where it happened
 * and the error code, nothing the user typed.
 */
export function logDataError(where: string, error: ErrorLike | DataError | null | undefined): void {
  const code = error?.code || undefined;
  const kind = error instanceof DataError ? error.kind : classify(error);
  console.error(`[data] ${where} failed`, { kind, code });
}

function classify(error: ErrorLike | null | undefined): DataErrorKind {
  const code = error?.code ?? "";
  switch (code) {
    case "PGRST116": // .single() found no row (or several)
      return "not_found";
    case "23505": // unique_violation
      return "conflict";
    case "23502": // not_null_violation
    case "23503": // foreign_key_violation
    case "23514": // check_violation
    case "22001": // string_data_right_truncation
    case "22P02": // invalid_text_representation (a malformed uuid, for one)
      return "invalid";
    case "42501": // insufficient_privilege, including row level security refusals
    case "PGRST301": // JWT could not be decoded
    case "PGRST302": // anonymous access disabled
    case "PGRST303": // JWT claims rejected
      return "forbidden";
  }
  if (code.startsWith("08") || code === "57P01" || code === "53300") return "unavailable"; // connection, shutdown, too many connections
  if (!code && /fetch failed|network|timeout/i.test(error?.message ?? "")) return "unavailable";
  return "unexpected";
}
