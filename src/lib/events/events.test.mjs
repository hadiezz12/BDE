// Unit tests for the events rules that live in the app: the public mapping
// and seat thresholds, the wizard's parser (Paris time, clock changes,
// links), the calendar's arithmetic, the agenda's URL filters, the calendar
// file, the participant CSV, the message words, the e-mail and the
// structured data. Run with `npm run test:unit` (Node strips the types).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeEventCursor,
  eventChecklist,
  eventStage,
  lastSeats,
  parseEventCursor,
  personalStates,
  seatsLeft,
  toEventItem,
} from "./model.ts";
import { CANCELLATION_CUTOFFS, cutoffLabel, parseEventStep, safeExternalUrl } from "./input.ts";
import { dayRole, dayStart, eventsOn, monthGrid, onDay, parseDayKey, rangeOf, weekStart } from "./calendar.ts";
import { agendaHref, agendaParams, agendaWindow, emptyAgendaTitle, isFiltered, parseAgendaFilters } from "./filters.ts";
import { buildIcs, foldLine, googleCalendarUrl, icsFileName, icsText } from "./ics.ts";
import { attendeesCsv, attendeesFileName, csvCell, toCsv } from "./csv.ts";
import { eventMessage, messageWhen } from "../../../supabase/functions/_shared/notifications/events.ts";
import { escapeHtml, renderNotificationEmail } from "../../../supabase/functions/_shared/notifications/email.ts";

// Event messages are essential (a registration in progress) and not confidential.
const renderEventEmail = (input) => renderNotificationEmail({ ...input, essential: true, confidential: false });
import { calendarInput, eventJsonLd, jsonLdScript, placeLine } from "./seo.ts";

const ORG = { id: "o1", slug: "exemple-finance", name: "Finance (exemple)", short_name: null, accent: "or", kind: "association", logo: null };

function card(over = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    slug: "atelier-exemple",
    series_key: null,
    title: "Atelier (exemple)",
    summary: "Un atelier.",
    category: { slug: "carriere", label: "Carrière" },
    cover: null,
    organization: ORG,
    coorganizers: [],
    starts_at: "2026-11-05T17:00:00.000Z",
    ends_at: "2026-11-05T19:00:00.000Z",
    timezone: "Europe/Paris",
    location: {
      type: "campus",
      venue: "Salle 101",
      address: null,
      city: "Paris",
      latitude: null,
      longitude: null,
      online_url: null,
      has_private_details: false,
    },
    status: "scheduled",
    cancelled_at: null,
    cancellation_reason: null,
    registration: {
      mode: "internal",
      state: "open",
      external_url: null,
      opens_at: null,
      closes_at: null,
      capacity: 20,
      confirmed: 5,
      waitlist_enabled: true,
      waitlist: 0,
      cancellation_cutoff_minutes: 120,
    },
    prominence: "normal",
    pinned: false,
    first_published_at: "2026-10-20T10:00:00.000Z",
    published_at: "2026-10-20T10:00:00.000Z",
    description: "Premier paragraphe.\n\nSecond paragraphe.",
    ...over,
  };
}

/* ---- Model ---------------------------------------------------------------------------- */

test("the last seats are 10 % of the capacity or less, at least one", () => {
  assert.equal(lastSeats({ capacity: 20, taken: 17 }), null);
  assert.equal(lastSeats({ capacity: 20, taken: 18 }), 2);
  assert.equal(lastSeats({ capacity: 20, taken: 20 }), null, "full is not 'last seats'");
  assert.equal(lastSeats({ capacity: 4, taken: 3 }), 1, "a small workshop still gets the warning");
  assert.equal(lastSeats({ capacity: undefined, taken: 300 }), null, "no limit, no warning");
  assert.equal(seatsLeft({ capacity: 10, taken: 12 }), 0, "never negative");
  assert.equal(seatsLeft({ capacity: undefined, taken: 3 }), null);
});

test("the public card maps to the UI event, paragraphs and venue included", () => {
  const e = toEventItem(card());
  assert.deepEqual(e.description, ["Premier paragraphe.", "Second paragraphe."]);
  assert.equal(e.venue.onCampus, true);
  assert.equal(e.registration.capacity, 20);
  assert.equal(e.registration.taken, 5);
  const unlimited = toEventItem(card({ registration: { ...card().registration, capacity: null } }));
  assert.equal(unlimited.registration.capacity, undefined, "null capacity means unlimited");
  const series = toEventItem(card({ series_key: "wei" }));
  assert.equal(series.emblem, "/brand/events/wei.png");
});

test("a student's marks: confirmed, waiting with the place, saved; cancelled ones ignored", () => {
  const reg = (id, status, position = null) => ({ registration: { status, position }, event: { id } });
  const map = personalStates({
    registrations: [reg("a", "confirmed"), reg("b", "waitlisted", 3), reg("c", "cancelled")],
    bookmarks: [{ id: "a" }, { id: "d" }],
  });
  assert.deepEqual(map.get("a"), { saved: true, registered: true });
  assert.deepEqual(map.get("b"), { waitlisted: true, position: 3 });
  assert.equal(map.get("c"), undefined);
  assert.deepEqual(map.get("d"), { saved: true });
});

test("the desk stage: moderation first, then cancellation, drafts, past, online", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const base = { hidden: null, status: "scheduled", publication: "published", ends_at: "2026-11-01T00:00:00Z" };
  assert.equal(eventStage(base, now), "live");
  assert.equal(eventStage({ ...base, hidden: { at: "x", reason: "y" } }, now), "hidden");
  assert.equal(eventStage({ ...base, status: "cancelled" }, now), "cancelled");
  assert.equal(eventStage({ ...base, publication: "draft" }, now), "draft");
  assert.equal(eventStage({ ...base, ends_at: "2026-10-01T00:00:00Z" }, now), "past");
  assert.equal(eventStage({ ...base, publication: "unpublished" }, now), "offline");
});

test("the checklist mirrors what publishing requires", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  const ready = {
    title: "Atelier",
    summary: "Un atelier.",
    starts_at: "2026-11-05T17:00:00Z",
    ends_at: "2026-11-05T19:00:00Z",
    location_type: "campus",
    venue_name: "Salle 101",
    registration_mode: "internal",
    external_url: null,
    cover_media_id: null,
  };
  const missing = (e) => eventChecklist(e, now).filter((c) => c.required && !c.ok).map((c) => c.label);
  assert.deepEqual(missing(ready), []);
  assert.ok(missing({ ...ready, summary: null }).includes("La phrase qui le présente"));
  assert.ok(missing({ ...ready, venue_name: null }).includes("Le nom du lieu"));
  assert.deepEqual(missing({ ...ready, location_type: "online", venue_name: null }), [], "online needs no venue");
  assert.ok(missing({ ...ready, registration_mode: "external" }).includes("La page d'inscription"));
  assert.ok(missing({ ...ready, ends_at: "2026-10-01T00:00:00Z" }).includes("Une fin à venir"));
  assert.equal(eventChecklist(ready, now).find((c) => c.step === "visuels").required, false, "an image is advised, not required");
});

test("the agenda cursor round-trips and refuses anything odd", () => {
  const c = { at: "2026-11-05T17:00:00+00:00", id: "11111111-1111-4111-8111-111111111111" };
  assert.deepEqual(parseEventCursor(encodeEventCursor(c)), c);
  assert.equal(parseEventCursor("2026-02-31T10:00:00Z~11111111-1111-4111-8111-111111111111"), null, "impossible date");
  assert.equal(parseEventCursor("2026-11-05T17:00:00Z~not-a-uuid"), null);
  assert.equal(parseEventCursor("a~b~c"), null);
  assert.equal(parseEventCursor(undefined), null);
});

/* ---- The wizard's parser ---------------------------------------------------------------- */

test("dates are Paris wall-clock times turned into exact instants", () => {
  const r = parseEventStep("lieu", {
    starts_date: "2026-11-05",
    starts_time: "18:00",
    ends_date: "2026-11-05",
    ends_time: "20:00",
    location_type: "campus",
    venue_name: " Salle   101 ",
  });
  assert.deepEqual(r.errors, {});
  assert.equal(r.patch.starts_at, "2026-11-05T17:00:00.000Z", "winter time: UTC+1");
  assert.equal(r.patch.venue_name, "Salle 101", "spaces collapsed");
  const summer = parseEventStep("lieu", { starts_date: "2026-06-05", starts_time: "18:00", ends_date: "2026-06-05", ends_time: "20:00", location_type: "campus" });
  assert.equal(summer.patch.starts_at, "2026-06-05T16:00:00.000Z", "summer time: UTC+2");
});

test("the hour that does not exist in spring is refused; the autumn one that repeats is noted", () => {
  const spring = parseEventStep("lieu", {
    starts_date: "2027-03-28",
    starts_time: "02:30",
    ends_date: "2027-03-28",
    ends_time: "05:00",
    location_type: "campus",
  });
  assert.match(spring.errors.starts, /n'existe pas/);
  const autumn = parseEventStep("lieu", {
    starts_date: "2026-10-25",
    starts_time: "02:30",
    ends_date: "2026-10-25",
    ends_time: "05:00",
    location_type: "campus",
  });
  assert.deepEqual(autumn.errors, {});
  assert.equal(autumn.patch.starts_at, "2026-10-25T00:30:00.000Z", "the first 02:30 (summer time)");
  assert.equal(autumn.notes.length, 1);
});

test("an end before the start, or more than 14 days, is refused", () => {
  const f = (ends_date, ends_time) =>
    parseEventStep("lieu", { starts_date: "2026-11-05", starts_time: "20:00", ends_date, ends_time, location_type: "external" }).errors.ends;
  assert.match(f("2026-11-05", "19:00"), /après le début/);
  assert.equal(f("2026-11-06", "05:00"), undefined, "a night out ending after midnight is fine");
  assert.match(f("2026-11-25", "20:00"), /14 jours/);
  assert.match(f("", ""), /fin/);
});

test("an online event keeps no venue; coordinates must be a real pair", () => {
  const online = parseEventStep("lieu", { location_type: "online", venue_name: "Salle", online_url: "meet.example.test/abc" });
  assert.equal(online.patch.venue_name, null);
  assert.equal(online.patch.online_url, "https://meet.example.test/abc");
  const coords = parseEventStep("lieu", { location_type: "external", latitude: "48,8566", longitude: "2.3522" });
  assert.equal(coords.patch.latitude, 48.8566);
  assert.ok(parseEventStep("lieu", { location_type: "external", latitude: "95", longitude: "2" }).errors.latitude);
  assert.ok(parseEventStep("lieu", { location_type: "external", latitude: "48.8", longitude: "" }).errors.latitude);
});

test("only https links with a real host are accepted", () => {
  assert.equal(safeExternalUrl("https://billetterie.example.test/x"), "https://billetterie.example.test/x");
  assert.equal(safeExternalUrl("billetterie.example.test"), "https://billetterie.example.test/");
  assert.equal(safeExternalUrl("http://billetterie.example.test"), null);
  assert.equal(safeExternalUrl("javascript:alert(1)"), null);
  assert.equal(safeExternalUrl("https://user:pass@example.test"), null);
  assert.equal(safeExternalUrl("https://localhost"), null);
  assert.equal(safeExternalUrl(""), null);
});

test("registration settings: capacity bounds, waiting list, window, cutoff, private details", () => {
  const ok = parseEventStep("inscriptions", {
    registration_mode: "internal",
    capacity_kind: "limited",
    capacity: "25",
    waitlist_enabled: "on",
    opens_date: "2026-10-26",
    opens_time: "12:00",
    closes_date: "2026-11-04",
    closes_time: "23:59",
    cancellation_cutoff_minutes: "120",
    access_details: "Code porte : 1234",
  });
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.patch.capacity, 25);
  assert.equal(ok.patch.waitlist_enabled, true);
  assert.equal(ok.patch.access_details, "Code porte : 1234");
  const unlimited = parseEventStep("inscriptions", { registration_mode: "internal", capacity_kind: "unlimited", capacity: "25", waitlist_enabled: "on", cancellation_cutoff_minutes: "0" });
  assert.equal(unlimited.patch.capacity, null, "unlimited: null");
  assert.equal(unlimited.patch.waitlist_enabled, false, "no waiting list without a limit");
  assert.ok(parseEventStep("inscriptions", { registration_mode: "internal", capacity_kind: "limited", capacity: "0" }).errors.capacity);
  assert.ok(parseEventStep("inscriptions", { registration_mode: "internal", capacity_kind: "limited", capacity: "2.5" }).errors.capacity);
  assert.ok(parseEventStep("inscriptions", { registration_mode: "internal", cancellation_cutoff_minutes: "45" }).errors.cancellation_cutoff_minutes);
  const reversed = parseEventStep("inscriptions", {
    registration_mode: "internal",
    opens_date: "2026-11-04",
    opens_time: "12:00",
    closes_date: "2026-11-01",
    closes_time: "12:00",
    cancellation_cutoff_minutes: "0",
  });
  assert.match(reversed.errors.closes, /après l'ouverture/);
  const none = parseEventStep("inscriptions", { registration_mode: "none", access_details: "secret", capacity_kind: "limited", capacity: "3" });
  assert.equal(none.patch.access_details, null, "no private details without internal registration");
  assert.equal(none.patch.capacity, null);
  assert.ok(parseEventStep("inscriptions", { registration_mode: "external", external_url: "http://x.test" }).errors.external_url);
  assert.ok(parseEventStep("inscriptions", { registration_mode: "paid" }).errors.registration_mode);
});

test("infos: series only for the BDE, three co-organizers at most", () => {
  const ids = ["a", "b", "c", "d"].map((x) => `${x}${x}${x}${x}${x}${x}${x}${x}-1111-4111-8111-111111111111`);
  assert.ok(parseEventStep("infos", { title: "T", coorganizer_ids: ids, coorganizers_present: "1" }).errors.coorganizer_ids);
  assert.equal(parseEventStep("infos", { title: "T", coorganizer_ids: ids.slice(0, 3), coorganizers_present: "1" }).patch.coorganizer_ids.length, 3);
  assert.equal("series_key" in parseEventStep("infos", { title: "T", series_key: "wei" }).patch, false, "ignored for an association");
  assert.ok(parseEventStep("infos", { title: "T", series_key: "nope" }, { isBde: true, seriesKeys: ["wei"] }).errors.series_key);
  assert.equal(parseEventStep("infos", { title: "T", series_key: "wei" }, { isBde: true, seriesKeys: ["wei"] }).patch.series_key, "wei");
  assert.equal(parseEventStep("infos", { title: "T\u0000itre" }).patch.title, "T itre", "control characters out");
});

test("cancellation cutoffs read as words", () => {
  assert.deepEqual([...CANCELLATION_CUTOFFS], [0, 60, 120, 360, 720, 1440, 2880]);
  assert.equal(cutoffLabel(0), "Jusqu'au début");
  assert.equal(cutoffLabel(120), "2 h avant");
  assert.equal(cutoffLabel(1440), "La veille (24 h avant)");
});

/* ---- Calendar --------------------------------------------------------------------------- */

test("months are whole weeks from Monday", () => {
  const weeks = monthGrid("2026-10");
  assert.equal(weeks.length, 5);
  assert.equal(weeks[0][0], "2026-09-28");
  assert.equal(weeks[4][6], "2026-11-01");
  assert.equal(weekStart("2026-10-25"), "2026-10-19", "a Sunday belongs to the week before");
  assert.equal(parseDayKey("2026-02-30"), null);
  assert.equal(parseDayKey("2026-10-25"), "2026-10-25");
});

test("Paris days last 23 or 25 hours on clock changes", () => {
  const len = (a, b) => (Date.parse(dayStart(b)) - Date.parse(dayStart(a))) / 3_600_000;
  assert.equal(len("2026-10-25", "2026-10-26"), 25);
  assert.equal(len("2027-03-28", "2027-03-29"), 23);
  assert.equal(len("2026-11-05", "2026-11-06"), 24);
  const r = rangeOf(["2026-10-19", "2026-10-25"]);
  assert.equal(r.from, "2026-10-18T22:00:00.000Z");
  assert.equal(r.to, "2026-10-25T23:00:00.000Z");
});

test("a night out belongs to its evening; a trip spans its days", () => {
  const night = { startsAt: "2026-10-30T21:00:00Z", endsAt: "2026-10-31T04:00:00Z" };
  assert.equal(dayRole(night, "2026-10-30"), "single");
  assert.equal(dayRole(night, "2026-10-31"), null);
  assert.equal(onDay(night, "2026-10-31"), true, "it does overlap the next day…");
  const trip = { startsAt: "2026-12-12T07:00:00Z", endsAt: "2026-12-14T17:00:00Z" };
  assert.deepEqual(
    ["2026-12-12", "2026-12-13", "2026-12-14", "2026-12-15"].map((d) => dayRole(trip, d)),
    ["start", "middle", "end", null],
  );
  assert.deepEqual(eventsOn([trip, night], "2026-10-30"), [night]);
});

/* ---- Agenda filters --------------------------------------------------------------------- */

test("filters come from the URL; unknown values are ignored", () => {
  const f = parseAgendaFilters({ quand: "weekend", categorie: "sport", lieu: "en-ligne", dispo: "ouvertes", q: "  tournoi  ", asso: "Bad Slug" });
  assert.equal(f.when, "weekend");
  assert.equal(f.category, "sport");
  assert.equal(f.place, "online");
  assert.equal(f.availability, "registration_open");
  assert.equal(f.q, "tournoi");
  assert.equal(f.association, null);
  assert.equal(parseAgendaFilters({ quand: "demain" }).when, "upcoming");
  assert.equal(parseAgendaFilters({ q: "a" }).q, "", "one letter is not a search");
  assert.equal(isFiltered(parseAgendaFilters({})), false);
});

test("chosen days win over the period, are swapped when reversed and capped at a year", () => {
  const f = parseAgendaFilters({ quand: "passes", du: "2026-12-10", au: "2026-11-01" });
  assert.equal(f.when, "range");
  assert.deepEqual([f.from, f.to], ["2026-11-01", "2026-12-10"]);
  const one = parseAgendaFilters({ au: "2026-11-05" });
  assert.deepEqual([one.from, one.to], ["2026-11-05", "2026-11-05"]);
  const long = parseAgendaFilters({ du: "2026-01-01", au: "2030-01-01" });
  assert.equal(long.to, "2027-01-01");
  assert.equal(agendaHref(f), "/events?du=2026-11-01&au=2026-12-10");
  assert.equal(agendaHref({ when: "past", category: "sport" }, "/events", "c"), "/events?quand=passes&categorie=sport&suite=c");
  assert.equal(agendaParams({}).toString(), "");
});

test("periods become exact instants, in Paris time", () => {
  const wednesday = new Date("2026-10-21T12:00:00Z");
  assert.deepEqual(agendaWindow({ when: "today" }, wednesday), {
    from: "2026-10-20T22:00:00.000Z",
    to: "2026-10-21T22:00:00.000Z",
    order: "asc",
  });
  const week = agendaWindow({ when: "week" }, wednesday);
  assert.equal(week.to, "2026-10-25T23:00:00.000Z", "to Sunday night, after the clock change");
  const weekend = agendaWindow({ when: "weekend" }, wednesday);
  assert.equal(weekend.from, "2026-10-23T16:00:00.000Z", "Friday 18h Paris");
  const saturday = new Date("2026-10-24T10:00:00Z");
  assert.equal(agendaWindow({ when: "weekend" }, saturday).from, saturday.toISOString(), "under way: from now");
  assert.equal(agendaWindow({ when: "past" }, wednesday).order, "desc");
  assert.equal(agendaWindow({ when: "range", from: "2026-11-01", to: "2026-11-01" }, wednesday).to, "2026-11-01T23:00:00.000Z");
});

test("empty agendas say what is empty", () => {
  assert.equal(emptyAgendaTitle(parseAgendaFilters({ quand: "weekend" })), "Rien de prévu ce week-end");
  assert.equal(emptyAgendaTitle(parseAgendaFilters({ q: "zzz" })), "Aucun événement ne correspond à ta recherche");
});

/* ---- Calendar file ---------------------------------------------------------------------- */

test("the .ics is RFC 5545: CRLF, escaped text, folded lines, UTC times, status", () => {
  const e = toEventItem(card({ title: "Atelier, finance; et plus", summary: "x".repeat(200) }));
  const ics = buildIcs(calendarInput(e, "https://site.example.test/events/atelier-exemple"), new Date("2026-10-23T10:00:00Z"));
  assert.ok(ics.includes("\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "only CRLF line ends");
  assert.ok(ics.includes("SUMMARY:Atelier\\, finance\\; et plus"));
  assert.ok(ics.includes("DTSTART:20261105T170000Z"));
  assert.ok(ics.includes("STATUS:CONFIRMED"));
  assert.ok(ics.includes("UID:event-11111111-1111-4111-8111-111111111111@very-pink-club"));
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, `line too long: ${line.slice(0, 20)}`);
  const cancelled = buildIcs(calendarInput(toEventItem(card({ status: "cancelled" })), "u"));
  assert.ok(cancelled.includes("STATUS:CANCELLED"));
  assert.ok(cancelled.includes("SUMMARY:Annulé : Atelier (exemple)"));
  assert.equal(icsText("a\nb"), "a\\nb");
  assert.ok(foldLine("é".repeat(60)).split("\r\n ").every((p) => new TextEncoder().encode(p).length <= 75), "never splits a character");
  assert.equal(icsFileName("Atelier!"), "atelier.ics");
  assert.equal(icsFileName("!!!"), "evenement.ics");
  assert.equal(icsFileName("atelier-exemple"), "atelier-exemple.ics");
  assert.ok(googleCalendarUrl(calendarInput(e, "u")).includes("dates=20261105T170000Z%2F20261105T190000Z"));
});

test("calendar entries carry public facts only", () => {
  const e = toEventItem(card({ location: { ...card().location, has_private_details: true } }));
  const input = calendarInput(e, "u");
  assert.equal(input.location, "Salle 101, Paris (campus)");
  assert.ok(!JSON.stringify(input).includes("Code"), "no private detail travels");
  assert.equal(placeLine({ type: "online", onCampus: false, hasPrivateDetails: true }), "En ligne");
});

/* ---- Participant CSV -------------------------------------------------------------------- */

test("CSV cells never run as formulas", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
  assert.equal(csvCell("+33 6"), "\"'+33 6\"");
  assert.equal(csvCell("-1"), "\"'-1\"");
  assert.equal(csvCell("@cmd"), "\"'@cmd\"");
  assert.equal(csvCell("\tx"), "\"'\tx\"");
  assert.equal(csvCell("Léa Exemple"), "\"Léa Exemple\"");
  assert.equal(csvCell(null), "\"\"");
  assert.equal(csvCell(3), "\"3\"");
  assert.ok(toCsv([["a"]]).startsWith("﻿"), "UTF-8 byte order mark for Excel");
});

test("the participant export: names, status, place, reference and dates only", () => {
  const csv = attendeesCsv([
    { name: "=Pirate", status: "confirmed", reference: "AB12CD34", created_at: "2026-10-23T08:05:00Z", confirmed_at: "2026-10-23T08:05:00Z", position: null },
    { name: "Léa", status: "waitlisted", reference: "ZX98YW76", created_at: "2026-10-23T09:00:00Z", confirmed_at: null, position: 2 },
  ]);
  const lines = csv.replace("﻿", "").trim().split("\r\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "\"Nom\";\"Statut\";\"Place en liste d'attente\";\"Référence\";\"Inscription le\";\"Place confirmée le\"");
  assert.ok(lines[1].startsWith("\"'=Pirate\";\"Inscrit·e\";\"\";\"AB12CD34\";\"23/10/2026 10:05\""), lines[1]);
  assert.ok(lines[2].includes("\"Liste d'attente\";\"2\""));
  assert.ok(!/@/.test(csv), "no e-mail address");
  assert.equal(attendeesFileName("Atelier exemple!", new Date("2026-10-23T22:30:00Z")), "participants-atelierexemple-2026-10-24.csv");
});

/* ---- Messages and e-mail ---------------------------------------------------------------- */

const PAYLOAD = {
  title: "Atelier (exemple)",
  slug: "atelier-exemple",
  organization: "Finance (exemple)",
  starts_at: "2026-11-05T17:00:00Z",
  venue: "Salle 101",
  city: "Paris",
  location_type: "campus",
};

test("every message kind has words, and none adds private details", () => {
  const kinds = [
    "event_registration_confirmed",
    "event_waitlisted",
    "event_promoted",
    "event_registration_cancelled",
    "event_registration_removed",
    "event_changed",
    "event_cancelled",
    "event_reminder",
  ];
  for (const k of kinds) {
    const m = eventMessage(k, PAYLOAD);
    assert.ok(m.title.includes("Atelier (exemple)"), k);
    assert.ok(m.body.length > 10, k);
  }
  assert.match(eventMessage("event_registration_confirmed", PAYLOAD).body, /^Jeudi 5 novembre à 18h · Salle 101, Paris\./);
  assert.match(eventMessage("event_cancelled", { ...PAYLOAD, reason: "Salle indisponible." }).body, /Raison donnée : Salle indisponible\./);
  const changed = eventMessage("event_changed", { ...PAYLOAD, dates_changed: true, previous_starts_at: "2026-11-04T17:00:00Z" });
  assert.match(changed.body, /Nouvelle date : jeudi 5 novembre à 18h \(au lieu du mercredi 4 novembre à 18h\)/);
  assert.equal(messageWhen("2026-06-05T16:30:00Z"), "vendredi 5 juin à 18h30");
});

test("the e-mail escapes everything and links only to the site's own pages", () => {
  const site = new URL("https://site.example.test");
  const mail = renderEventEmail({ kind: "event_reminder", payload: { ...PAYLOAD, title: "<script>x</script>" }, name: "Léa Exemple", site });
  assert.ok(!mail.html.includes("<script>x"), "no raw markup");
  assert.ok(mail.html.includes("&lt;script&gt;"));
  assert.ok(mail.html.includes("https://site.example.test/events/atelier-exemple"));
  assert.ok(mail.text.startsWith("Bonjour Léa,"));
  const noSite = renderEventEmail({ kind: "event_reminder", payload: PAYLOAD, name: null, site: null });
  assert.ok(!noSite.html.includes("href="), "no address known: no link");
  const odd = renderEventEmail({ kind: "event_reminder", payload: { ...PAYLOAD, slug: "../../evil" }, name: null, site });
  assert.ok(!odd.html.includes("evil"), "a slug the site would not write is never linked");
  const removed = renderEventEmail({ kind: "event_registration_removed", payload: PAYLOAD, name: null, site });
  assert.ok(!removed.html.includes("/events/atelier-exemple"), "a removed registration points to Mes événements only");
  assert.equal(escapeHtml(`a&b"'`), "a&amp;b&quot;&#39;");
});

/* ---- Structured data -------------------------------------------------------------------- */

test("schema.org Event: no offers, the real status, the real place", () => {
  const absolute = (p) => new URL(p, "https://site.example.test").toString();
  const ld = eventJsonLd(toEventItem(card()), { url: "u", absolute, organizerUrl: "o" });
  assert.equal(ld["@type"], "Event");
  assert.equal("offers" in ld, false);
  assert.equal(ld.eventStatus, "https://schema.org/EventScheduled");
  assert.deepEqual(ld.location, { "@type": "Place", name: "Salle 101", address: { "@type": "PostalAddress", addressLocality: "Paris" } });
  const cancelled = eventJsonLd(toEventItem(card({ status: "cancelled" })), { url: "u", absolute, organizerUrl: "o" });
  assert.equal(cancelled.eventStatus, "https://schema.org/EventCancelled");
  const online = eventJsonLd(toEventItem(card({ location: { ...card().location, type: "online", venue: null } })), { url: "u", absolute, organizerUrl: "o" });
  assert.deepEqual(online.location, { "@type": "VirtualLocation", url: "u" });
  assert.ok(!jsonLdScript({ a: "</script>" }).includes("</script>"));
});
