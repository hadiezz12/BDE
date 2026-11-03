// Unit tests of the search URL state (Phase 12) and the request limiter of
// /api/search: every parameter is validated, nothing malformed reaches the
// database, the URL is canonical (shareable), and the limiter stays bounded.
// Run with `npm run test:unit` (Node's built-in runner strips the types).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MAX_PAGE, parseSearchState, searchArgs, searchHref, searchQuery, searchSlug } from "./query.ts";
import { clientKey, createRateLimiter } from "../rate-limit.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

test("the query is cleaned: spaces collapsed, control characters dropped, 80 characters at most", () => {
  assert.equal(searchQuery("  finance   soirée  "), "finance soirée");
  assert.equal(searchQuery(["first", "second"]), "first");
  assert.equal(searchQuery(undefined), "");
  assert.equal(searchQuery("a\u0000b\nc\td"), "a b c d");
  assert.equal(searchQuery("x".repeat(500)).length, 80);
  // Markup and SQL are only text: kept as typed, the database takes them as words.
  assert.equal(searchQuery("<script>alert(1)</script>"), "<script>alert(1)</script>");
  assert.equal(searchQuery("'); drop table posts; --"), "'); drop table posts; --");
});

test("slugs are slugs or nothing", () => {
  assert.equal(searchSlug("exemple-finance"), "exemple-finance");
  for (const bad of ["Finance", "../admin", "a--b", "-a", "a b", "a'", "x".repeat(81), ""]) {
    assert.equal(searchSlug(bad), null, bad);
  }
});

test("unknown or foreign parameters are dropped, never passed on", () => {
  const s = parseSearchState({
    q: "finance",
    type: "drop table",
    quand: "semaine",
    statut: "ouvert",
    categorie: "Sport' or 1=1",
    asso: "exemple-finance",
    page: "-3",
    tri: "random",
  });
  assert.equal(s.tab, "tout", "an unknown type is the default tab");
  assert.equal(s.when, null, "a time window belongs to events only");
  assert.equal(s.status, null, "a status belongs to recruitment only");
  assert.equal(s.category, null, "no category across every type, and never a malformed one");
  assert.equal(s.association, "exemple-finance");
  assert.equal(s.page, 1);
  assert.equal(s.sort, "relevance");

  const events = parseSearchState({ type: "evenements", quand: "weekend", lieu: "en-ligne", statut: "ouvert", categorie: "sport" });
  assert.deepEqual([events.tab, events.when, events.place, events.status, events.category], ["evenements", "weekend", "online", null, "sport"]);

  const recruitment = parseSearchState({ type: "recrutement", statut: "fin-proche", quand: "semaine" });
  assert.deepEqual([recruitment.status, recruitment.when], ["closing", null]);

  assert.equal(parseSearchState({ page: "9999" }).page, MAX_PAGE, "pages stop where the database stops");
  assert.equal(parseSearchState({ page: "2abc" }).page, 2);
});

test("the URL is canonical: defaults omitted, same order, filters reset the page, tabs drop foreign filters", () => {
  const s = parseSearchState({ q: "finance", type: "evenements", quand: "semaine", page: "3" });
  assert.equal(searchHref(s), "/search?q=finance&type=evenements&quand=semaine");
  assert.equal(searchHref(s, { page: 3 }), "/search?q=finance&type=evenements&quand=semaine&page=3");
  assert.equal(searchHref(s, { tab: "articles" }), "/search?q=finance&type=articles", "a new tab keeps the query, not the events' filters");
  assert.equal(searchHref(parseSearchState({})), "/search");
  assert.equal(searchHref(parseSearchState({ q: "a&b=c d" })), "/search?q=a%26b%3Dc+d", "the query is encoded");
  // Round trip.
  const href = searchHref(parseSearchState({ q: "soirée", type: "recrutement", statut: "ouvert", asso: "exemple-sports", page: "2" }), { page: 2 });
  const back = parseSearchState(Object.fromEntries(new URL(href, "http://x.invalid").searchParams));
  assert.equal(searchHref(back, { page: back.page }), href);
});

test("the database arguments follow the tab, and only its own filters", () => {
  const all = searchArgs(parseSearchState({ q: "finance", asso: "exemple-finance" }), { perType: 4, limit: 24 });
  assert.equal(all.p_type, null);
  assert.equal(all.p_organization, "exemple-finance");
  assert.equal(all.p_per_type, 4);
  const events = searchArgs(parseSearchState({ q: "x y", type: "evenements", quand: "passes", lieu: "campus", page: "2" }));
  assert.deepEqual(
    [events.p_type, events.p_when, events.p_place, events.p_status, events.p_offset, events.p_limit],
    ["event", "past", "campus", null, 12, 12],
  );
  const positions = searchArgs(parseSearchState({ type: "recrutement", statut: "ouvert", categorie: "sport" }), { type: "position" });
  assert.deepEqual([positions.p_type, positions.p_status, positions.p_category, positions.p_q], ["position", "open", null, null]);
  assert.equal(searchArgs(parseSearchState({ type: "articles", tri: "date" })).p_sort, null, "date order needs a query to differ");
  assert.equal(searchArgs(parseSearchState({ q: "x y", type: "articles", tri: "date" })).p_sort, "date");
});

test("the filters the page offers are the ones the database accepts", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/20261103073045_create_campus_search.sql"), "utf8");
  for (const v of ["'upcoming', 'today', 'week', 'weekend', 'past'", "'open', 'upcoming', 'closing', 'closed'", "'campus', 'external', 'online'"]) {
    assert.ok(sql.includes(v), v);
  }
});

test("the limiter lets a person through, stops a flood, then lets it try again", () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });
  assert.deepEqual([1, 2, 3, 4].map(() => limiter.hit("a", 0)), [true, true, true, false]);
  assert.equal(limiter.hit("b", 0), true, "each client counts on its own");
  assert.equal(limiter.retryAfter("a", 500), 1);
  assert.equal(limiter.hit("a", 1000), true, "a new window starts");
  assert.equal(limiter.retryAfter("a", 1000), 0);
});

test("the limiter's memory stays bounded", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 10 });
  for (let i = 0; i < 1000; i++) limiter.hit(`k${i}`, 0);
  assert.equal(limiter.hit("k999", 0), false, "the latest clients are still counted");
});

test("the client key comes from the proxy headers, short", () => {
  assert.equal(clientKey(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(clientKey(new Headers({ "x-real-ip": "198.51.100.2", "x-forwarded-for": "203.0.113.7" })), "198.51.100.2");
  assert.equal(clientKey(new Headers()), "unknown");
  assert.equal(clientKey(new Headers({ "x-real-ip": "x".repeat(500) })).length, 64);
});
