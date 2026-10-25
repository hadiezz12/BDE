/**
 * The participant list as a spreadsheet file (CSV), safe to open in Excel,
 * LibreOffice or Google Sheets: UTF-8 with a byte order mark (accents
 * survive Excel), semicolons (the French Excel default), every cell quoted,
 * and any cell that a spreadsheet would read as a formula (= + - @, tab,
 * carriage return) neutralised with a leading apostrophe — a name typed as
 * "=HYPERLINK(…)" stays text. Names, statuses, references and dates only:
 * the database export never returns an e-mail. Pure module.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell: text kept as text, never evaluated. */
export function csvCell(value: string | number | null | undefined): string {
  let text = value === null || value === undefined ? "" : String(value);
  text = text.replace(/\r\n?/g, "\n");
  if (FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(rows: (string | number | null | undefined)[][], separator = ";"): string {
  return "﻿" + rows.map((r) => r.map(csvCell).join(separator)).join("\r\n") + "\r\n";
}

const parisDateTime = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "23/10/2026 19:05" (Paris time), or empty. */
export function csvDate(iso: string | null | undefined): string {
  return iso ? parisDateTime.format(new Date(iso)).replace(",", "") : "";
}

export interface ExportRow {
  name: string;
  status: "confirmed" | "waitlisted";
  reference: string;
  created_at: string;
  confirmed_at: string | null;
  position: number | null;
}

export function attendeesCsv(rows: ExportRow[]): string {
  return toCsv([
    ["Nom", "Statut", "Place en liste d'attente", "Référence", "Inscription le", "Place confirmée le"],
    ...rows.map((r) => [
      r.name,
      r.status === "confirmed" ? "Inscrit·e" : "Liste d'attente",
      r.status === "waitlisted" ? r.position : null,
      r.reference,
      csvDate(r.created_at),
      csvDate(r.confirmed_at),
    ]),
  ]);
}

/** "participants-atelier-finance-2026-10-23.csv" */
export function attendeesFileName(slugOrId: string, now = new Date()): string {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(now);
  return `participants-${slugOrId.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60) || "evenement"}-${day}.csv`;
}
