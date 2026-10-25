/**
 * "Ajouter à mon agenda": an iCalendar file (RFC 5545) and the Google /
 * Outlook "new event" links. Public information only: never the private
 * joining details, never anything about the student. Times are exact UTC
 * instants (…Z), which every calendar shows in its own zone. Pure module.
 */

export interface CalendarEventInput {
  id: string;
  title: string;
  summary: string;
  startsAt: string;
  endsAt: string;
  /** Public place line ("Salle X, adresse, ville" or "En ligne"). */
  location: string;
  /** The event's page (absolute when the site has its address). */
  url: string;
  cancelled: boolean;
  /** When the event last changed (lets calendars update an imported copy). */
  updatedAt?: string;
}

/** 20261024T160000Z */
export function icsInstant(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 text escaping: backslash, semicolon, comma, line breaks. */
export function icsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Lines longer than 75 octets are folded (CRLF + space), never inside a UTF-8 character. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const out: string[] = [];
  let current = "";
  let size = 0;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (size + bytes > limit) {
      out.push(current);
      current = "";
      size = 0;
    }
    current += ch;
    size += bytes;
  }
  out.push(current);
  return out.join("\r\n ");
}

export function buildIcs(e: CalendarEventInput, now = new Date()): string {
  const description = [e.summary, e.url].filter(Boolean).join("\n\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Very Pink Club//Agenda du campus//FR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:event-${e.id}@very-pink-club`,
    `DTSTAMP:${icsInstant(now.toISOString())}`,
    ...(e.updatedAt ? [`LAST-MODIFIED:${icsInstant(e.updatedAt)}`] : []),
    `DTSTART:${icsInstant(e.startsAt)}`,
    `DTEND:${icsInstant(e.endsAt)}`,
    `SUMMARY:${icsText(e.title)}`,
    `DESCRIPTION:${icsText(description)}`,
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    `URL:${e.url}`,
    `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

/** Google Calendar's "create event" page, prefilled (the student saves it themselves). */
export function googleCalendarUrl(e: CalendarEventInput): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${icsInstant(e.startsAt)}/${icsInstant(e.endsAt)}`,
    details: [e.summary, e.url].filter(Boolean).join("\n\n"),
    location: e.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Outlook (web) "new event" page, prefilled. */
export function outlookCalendarUrl(e: CalendarEventInput): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: e.title,
    startdt: new Date(e.startsAt).toISOString(),
    enddt: new Date(e.endsAt).toISOString(),
    body: [e.summary, e.url].filter(Boolean).join("\n\n"),
    location: e.location,
  });
  return `https://outlook.live.com/calendar/0/action/compose?${params.toString()}`;
}

/** A file name for the download: "soiree-de-rentree.ics". */
export function icsFileName(slug: string): string {
  return `${slug.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60) || "evenement"}.ics`;
}
