// Unit tests for the fil's RSS document: escaping, dates and the item shape.
// Run with `npm run test:unit` (Node's built-in runner strips the types).
import { test } from "node:test";
import assert from "node:assert/strict";
import { campusRssXml, escapeXml, rssDate } from "./rss-feed.ts";

const channel = {
  title: "Le fil du campus — Very Pink Club",
  url: "https://example.test/campus",
  selfUrl: "https://example.test/campus/rss",
  description: "Le fil.",
  items: [
    {
      id: "0b6e2c1e-5d3a-4f1e-9a51-2f6f1c2b9a01",
      title: "Tournoi <inter-assos> & \"finale\"",
      url: "https://example.test/campus/tournoi-inter-assos",
      publishedAt: "2026-10-21T09:21:20.123456+00:00",
      description: "Les résultats\u0007 du tournoi.",
      categories: ["Sport", "", "Récap"],
      creator: "Asso test 1",
    },
    {
      id: "5c1d8e2a-0f3b-4c6d-8e9f-a1b2c3d4e5f6",
      title: "Brève",
      url: "https://example.test/campus/breve",
      publishedAt: "2026-10-20T08:00:00Z",
      description: "",
      categories: ["Brève"],
      creator: "Julie Exemple pour Asso test 2",
    },
  ],
};

test("escapeXml escapes markup and drops characters XML 1.0 forbids", () => {
  assert.equal(escapeXml(`<a href="x">Tom & Jerry's</a>`), "&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&apos;s&lt;/a&gt;");
  assert.equal(escapeXml("a\u0000b\u0008c\u000Bd\u001Fe\tf\ng"), "abcde\tf\ng");
});

test("rssDate writes RFC 822 dates in GMT", () => {
  assert.equal(rssDate("2026-10-21T09:21:20.123456+00:00"), "Wed, 21 Oct 2026 09:21:20 GMT");
  assert.equal(rssDate("2026-10-21T11:00:00+02:00"), "Wed, 21 Oct 2026 09:00:00 GMT");
});

test("campusRssXml builds an RSS 2.0 channel with escaped items", () => {
  const xml = campusRssXml(channel, new Date("2026-10-22T00:00:00Z"));
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"'));
  assert.match(xml, /<atom:link href="https:\/\/example\.test\/campus\/rss" rel="self" type="application\/rss\+xml" \/>/);
  assert.match(xml, /<title>Tournoi &lt;inter-assos&gt; &amp; &quot;finale&quot;<\/title>/);
  assert.match(xml, /<guid isPermaLink="false">urn:uuid:0b6e2c1e-5d3a-4f1e-9a51-2f6f1c2b9a01<\/guid>/);
  assert.match(xml, /<pubDate>Wed, 21 Oct 2026 09:21:20 GMT<\/pubDate>/);
  assert.match(xml, /<description>Les résultats du tournoi\.<\/description>/);
  // Empty categories are skipped; the newest item dates the channel.
  assert.equal((xml.match(/<category>/g) ?? []).length, 3);
  assert.match(xml, /<lastBuildDate>Wed, 21 Oct 2026 09:21:20 GMT<\/lastBuildDate>/);
  // An item without introduction has no description.
  const breve = xml.slice(xml.lastIndexOf("<item>"));
  assert.doesNotMatch(breve, /<description>/);
  assert.match(breve, /<dc:creator>Julie Exemple pour Asso test 2<\/dc:creator>/);
});

test("an empty fil still gives a valid channel, dated now", () => {
  const xml = campusRssXml({ ...channel, items: [] }, new Date("2026-10-22T10:00:00Z"));
  assert.doesNotMatch(xml, /<item>/);
  assert.match(xml, /<lastBuildDate>Thu, 22 Oct 2026 10:00:00 GMT<\/lastBuildDate>/);
  assert.ok(xml.trimEnd().endsWith("</rss>"));
});
