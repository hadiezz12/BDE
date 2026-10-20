// Unit tests for the association page rules: search, form parsing, links,
// addresses, completeness and the public mapping. Run with `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanQuery, normalizeSearch } from "./search.ts";
import {
  completeness,
  multiLine,
  parseAppearance,
  parseContact,
  parseIdentity,
  parsePillars,
  parsePresentation,
  parseSocialLink,
  singleLine,
  slugError,
  slugify,
} from "./validation.ts";
import { paragraphs, toAssociation } from "./model.ts";

const form = (entries) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) for (const x of [].concat(v)) f.append(k, x);
  return f;
};

test("search ignores accents, case, punctuation and extra spaces", () => {
  assert.equal(normalizeSearch("  Société   GÉNÉRALE!! "), "societe generale");
  assert.equal(normalizeSearch("l'Écho—des  Assos"), "l echo des assos");
  assert.equal(cleanQuery("   x".padEnd(200, "y")).length, 60);
  assert.equal(cleanQuery(["finance", "autre"]), "finance");
  assert.equal(cleanQuery(undefined), "");
});

test("text fields are trimmed; paragraphs keep one blank line; markup stays text", () => {
  assert.equal(singleLine("  Asso   des  arts "), "Asso des arts");
  assert.equal(singleLine("   "), null);
  assert.equal(multiLine("Un\r\n\r\n\r\n\r\nDeux  \r\nTrois"), "Un\n\nDeux\nTrois");
  assert.equal(multiLine("<script>alert(1)</script>"), "<script>alert(1)</script>");
  assert.deepEqual(paragraphs("Un\nsuite\n\nDeux"), ["Un suite", "Deux"]);
});

test("identity and presentation follow the database limits", () => {
  const ok = parseIdentity(form({ name: "Finance", short_name: "", kind_label: "Association", tagline: "Une ligne." }));
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.values.short_name, null);
  assert.ok(parseIdentity(form({ name: "" })).errors.name);
  assert.ok(parseIdentity(form({ name: "F", tagline: "x".repeat(141) })).errors.tagline);
  const year = parsePresentation(form({ description: "Assez long pour passer.", founded_year: "2999" }), new Date("2026-10-20"));
  assert.ok(year.errors.founded_year);
  assert.equal(parsePresentation(form({ description: "court" })).errors.description, "Présentation : 10 caractères au moins.");
});

test("key points need a title; empty ones are dropped", () => {
  const r = parsePillars(form({ pillar_1_title: "Un", pillar_1_detail: "Explication", pillar_2_title: "", pillar_2_detail: "" }));
  assert.deepEqual(r.values.pillars, [{ title: "Un", detail: "Explication" }]);
  assert.ok(parsePillars(form({ pillar_3_detail: "Sans titre" })).errors.pillar_3_title);
});

test("social links: handles become links, other platforms and schemes are refused", () => {
  assert.deepEqual(parseSocialLink("instagram", "@exemple.asso"), { url: "https://www.instagram.com/exemple.asso/" });
  assert.deepEqual(parseSocialLink("tiktok", "@exemple"), { url: "https://www.tiktok.com/@exemple" });
  assert.deepEqual(parseSocialLink("website", "exemple.fr/asso"), { url: "https://exemple.fr/asso" });
  assert.deepEqual(parseSocialLink("linkedin", "http://www.linkedin.com/company/x"), { url: "https://www.linkedin.com/company/x" });
  assert.ok(parseSocialLink("website", "javascript:alert(1)").error);
  assert.ok(parseSocialLink("website", "data:text/html,x").error);
  assert.ok(parseSocialLink("instagram", "https://evil.example/instagram.com/x").error);
  assert.ok(parseSocialLink("website", "https://user:pass@exemple.fr").error);
  assert.deepEqual(parseSocialLink("x", ""), { url: null });
  const c = parseContact(form({ contact_email: "Contact@Asso.example.test", social_instagram: "@asso", social_website: "" }));
  assert.equal(c.values.contact_email, "contact@asso.example.test");
  assert.deepEqual(c.values.social_links, [{ platform: "instagram", url: "https://www.instagram.com/asso/" }]);
  assert.ok(parseContact(form({ contact_email: "pas une adresse" })).errors.contact_email);
});

test("appearance: palette colours only, images from the library, focal point bounded", () => {
  const r = parseAppearance(form({ accent: "vert", logo_media_id: "a", cover_media_id: "b", focal_x: "120", focal_y: "33.4" }), ["a", "b"]);
  assert.deepEqual(r.errors, {});
  assert.equal(r.values.cover_focal, "100% 33%");
  assert.ok(parseAppearance(form({ accent: "#ff0000" }), []).errors.accent);
  assert.ok(parseAppearance(form({ accent: "rose", logo_media_id: "z" }), []).errors.logo_media_id);
});

test("addresses: accents and symbols become dashes; reserved words refused", () => {
  assert.equal(slugify("Société Générale & Co."), "societe-generale-et-co");
  assert.equal(slugify("  Arts--plastiques  "), "arts-plastiques");
  assert.equal(slugError("plateforme"), "Ce mot est réservé par le site.");
  assert.ok(slugError("Majuscules"));
  assert.equal(slugError("exemple-finance"), null);
});

const draft = {
  name: "Finance",
  short_name: null,
  accent: "bleu",
  kind_label: null,
  tagline: null,
  description: null,
  meeting_info: null,
  pillars: [],
  contact_email: null,
  social_links: [],
  founded_year: null,
  category_ids: [],
  logo_media_id: null,
  cover_media_id: null,
  cover_focal: null,
};

test("completeness: what publishing needs, and what only improves the page", () => {
  const empty = completeness(draft, { isBde: false, galleryCount: 0, teamCount: 0 });
  assert.equal(empty.publishable, false);
  assert.deepEqual(empty.items.filter((i) => i.required).map((i) => i.key), ["tagline", "description", "category_ids"]);
  const ready = completeness({ ...draft, tagline: "x", description: "y", category_ids: ["c"] }, { isBde: false, galleryCount: 0, teamCount: 1 });
  assert.equal(ready.publishable, true);
  assert.ok(ready.percent > empty.percent && ready.percent < 100);
});

test("the public mapping serves images through the site, and the BDE keeps its badge", () => {
  const a = toAssociation({
    id: "o1", slug: "bde", kind: "bde", name: "Very Pink Club", short_name: null, accent: "rose",
    kind_label: null, tagline: "Paris by night", description: "Un\n\nDeux", meeting_info: null,
    pillars: [{ title: "Point", detail: "" }], contact_email: null,
    social_links: [{ platform: "website", url: "https://exemple.fr/" }], founded_year: null, categories: [],
    logo: null, cover: { id: "m", path: "o1/m.webp", width: 2400, height: 1000, alt: null }, cover_focal: "50% 20%",
    gallery: [], team: [{ membership_id: "ms", name: "Alice", title: "Présidence", bio: null, photo: true }],
    first_published_at: null, published_at: null,
  });
  assert.equal(a.isBde, true);
  assert.equal(a.logo?.src, "/brand/vpc-badge.png");
  assert.equal(a.cover?.src, "/media/associations/o1/m.webp");
  assert.equal(a.cover?.focal, "50% 20%");
  assert.equal(a.team[0].avatar?.src, "/media/portraits/ms");
  assert.deepEqual(a.socials, [{ kind: "site", href: "https://exemple.fr/", label: "exemple.fr" }]);
  assert.deepEqual(a.description, ["Un", "Deux"]);
});

test("the preview reads draft images from the private route and shows no member photo", () => {
  const p = toAssociation(
    {
      id: "o2", slug: "exemple", kind: "association", name: "Exemple", short_name: "EX", accent: "vert",
      kind_label: "Association étudiante", tagline: "Ligne", description: null, meeting_info: null,
      pillars: [], contact_email: null, social_links: [], founded_year: 2020,
      categories: [{ slug: "sport", label: "Sport" }],
      logo: { id: "l", path: "o2/l.webp", width: 512, height: 512, alt: "Logo" }, cover: null, cover_focal: null,
      gallery: [{ media: { id: "g", path: "o2/g.webp", width: 800, height: 600, alt: null }, caption: "Finale" }, { media: null, caption: null }],
      team: [{ membership_id: "ms", name: "Alice", title: null, bio: "Une ligne.", photo: true }],
      first_published_at: null, published_at: null, revision: 3,
    },
    { preview: true },
  );
  assert.equal(p.isBde, false);
  assert.equal(p.logo?.src, "/media/apercu/associations/o2/l.webp");
  assert.equal(p.gallery.length, 1);
  assert.equal(p.gallery[0].src, "/media/apercu/associations/o2/g.webp");
  assert.equal(p.gallery[0].caption, "Finale");
  assert.equal(p.gallery[0].alt, "Finale");
  assert.equal(p.team[0].avatar, undefined);
  assert.equal(p.team[0].bio, "Une ligne.");
  assert.equal(p.kind, "Association étudiante");
  assert.equal(p.cover, undefined);
});

test("the site address is never guessed: https (or localhost) from SITE_URL only", async () => {
  const { siteUrl } = await import("../site-url.ts");
  const saved = { url: process.env.SITE_URL, env: process.env.NODE_ENV };
  try {
    process.env.SITE_URL = "";
    process.env.NODE_ENV = "production";
    assert.equal(siteUrl(), null);
    process.env.NODE_ENV = "development";
    assert.equal(siteUrl()?.origin, "http://localhost:3020");
    process.env.SITE_URL = "http://exemple.test";
    assert.equal(siteUrl(), null);
    process.env.SITE_URL = "https://exemple.test";
    assert.equal(siteUrl()?.origin, "https://exemple.test");
  } finally {
    process.env.SITE_URL = saved.url ?? "";
    process.env.NODE_ENV = saved.env;
  }
});
