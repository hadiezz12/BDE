// Unit tests for the publishing rules: the article body format and its links,
// campus time, the desk's statuses, the public mapping, feed links and what
// the editor saves. Run with `npm run test:unit` (Node's built-in runner
// strips the types).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  EMPTY_DOCUMENT,
  documentHeadings,
  documentImages,
  documentText,
  isExternalHref,
  isSafeHref,
  normalizeDocument,
  normalizeTag,
  qualityNotes,
  readingMinutes,
  toSafeHref,
} from "./document.ts";
import { formatScheduled, instantToParisLocal, parisLocalToInstant } from "./schedule.ts";
import { BDE_BADGE } from "../associations/model.ts";

import {
  DESK_VIEWS,
  SCHEDULE_ERROR_LABEL,
  STAGE_LABEL,
  STAGE_TONE,
  encodeFeedCursor,
  feedQuery,
  feedSlug,
  inView,
  matchesDeskSearch,
  parseFeedCursor,
  postStage,
  toPostArticle,
  toPostItem,
} from "./model.ts";
import { POST_LIMITS, normalizePostContent } from "./content.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const migrations = fs
  .readdirSync(path.join(root, "supabase/migrations"))
  // Phase 6 onwards: the publishing migrations.
  .filter((f) => f.endsWith(".sql") && f >= "20261021")
  .map((f) => fs.readFileSync(path.join(root, "supabase/migrations", f), "utf8"))
  .join("\n");

/** The body of a SQL function, as the last migration defining it wrote it. */
function sqlFunction(name) {
  const start = migrations.lastIndexOf(`create or replace function ${name}(`);
  assert.ok(start >= 0, `${name} is defined in the migrations`);
  return migrations.slice(start, migrations.indexOf("$$;", start));
}

// Fictional identifiers (lower-case uuids, as the database writes them).
const ORG = "4b6e1f0a-2c3d-4e5f-8a9b-0c1d2e3f4a5b";
const POST = "5e1d7c3a-9b2f-4c8e-a6d4-1f0e2b3c4d5e";
const MEDIA = "0b9f6a2e-3c4d-4e5f-8a9b-0c1d2e3f4a5b";
const MEDIA_2 = "7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d";
const REV_LIVE = "1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
const REV_WORK = "9f8e7d6c-5b4a-4f3e-9d2c-1b0a9f8e7d6c";

// ---- Body builders ----------------------------------------------------------------------

const t = (text, marks) => (marks ? { type: "text", text, marks } : { type: "text", text });
const p = (...content) =>
  content.length ? { type: "paragraph", content: content.map((c) => (typeof c === "string" ? t(c) : c)) } : { type: "paragraph" };
const h = (level, text) => ({ type: "heading", attrs: { level }, content: [t(text)] });
const img = (mediaId, alt = null, caption = null) => ({ type: "image", attrs: { mediaId, alt, caption } });
const doc = (...content) => ({ type: "doc", content });
const link = (href) => ({ type: "link", attrs: { href } });

/** Normalizes and expects success. */
function clean(input) {
  const r = normalizeDocument(input);
  assert.equal(r.ok, true, r.reason);
  return r.value;
}

/** Every object of a JSON value, depth first. */
function* objects(value) {
  if (Array.isArray(value)) {
    for (const v of value) yield* objects(v);
  } else if (value && typeof value === "object") {
    yield value;
    for (const v of Object.values(value)) yield* objects(v);
  }
}

// ---- document.ts: the body format ----------------------------------------------------------

test("unknown nodes are dropped (script, iframe, code, raw HTML…); their neighbours stay", () => {
  const value = clean(
    doc(
      p("Avant"),
      { type: "script", content: [t("alert(1)")] },
      { type: "iframe", attrs: { src: "https://evil.example" } },
      { type: "codeBlock", content: [t("rm -rf /")] },
      { type: "html", content: "<b>gras</b>" },
      { type: "table", content: [{ type: "tableRow", content: [] }] },
      null,
      "texte nu",
      42,
      p("Après", { type: "mention", attrs: { id: "x" } }, { type: "image", attrs: { mediaId: MEDIA } }, " fin"),
    ),
  );
  assert.deepEqual(value, doc(p("Avant"), p("Après", " fin")));
});

test("unknown attributes, keys and marks are dropped; known ones are kept once", () => {
  const value = clean({
    type: "doc",
    attrs: { onload: "alert(1)" },
    content: [
      {
        type: "paragraph",
        attrs: { class: "x", style: "color:red" },
        content: [
          {
            type: "text",
            text: "Gras",
            style: "x",
            marks: [{ type: "bold", attrs: { x: 1 } }, { type: "bold" }, { type: "underline" }, { type: "italic" }, { type: "textStyle" }],
          },
        ],
      },
      { type: "heading", attrs: { level: 2, id: "titre", onclick: "alert(1)" }, content: [t("Titre")] },
      { type: "orderedList", attrs: { start: 3 }, content: [{ type: "listItem", attrs: { checked: true }, content: [p("Un")] }] },
      { type: "horizontalRule", attrs: { class: "x" }, content: [t("x")] },
      { type: "paragraph", content: [t("a"), { type: "hardBreak", attrs: { class: "x" } }, t("b")] },
    ],
  });
  assert.deepEqual(
    value,
    doc(
      p(t("Gras", [{ type: "bold" }, { type: "italic" }])),
      h(2, "Titre"),
      { type: "orderedList", content: [{ type: "listItem", content: [p("Un")] }] },
      { type: "horizontalRule" },
      p("a", { type: "hardBreak" }, "b"),
    ),
  );
});

test("unsafe links are unlinked and their text stays", () => {
  const unsafe = [
    "javascript:alert(1)",
    "JAVASCRIPT:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "exemple.fr/page",
    "//evil.example/x",
    "http://user:pass@exemple.fr/",
    "https://exemple.fr@evil.example/",
    "HTTPS://exemple.fr",
    "https://exemple.fr/a b",
    "/",
    `https://exemple.fr/${"x".repeat(2000)}`,
    42,
    null,
  ];
  for (const href of unsafe) {
    assert.deepEqual(clean(doc(p(t("lien", [link(href)])))), doc(p("lien")), String(href));
  }
  // Only the unsafe mark goes; the other marks stay.
  assert.deepEqual(clean(doc(p(t("lien", [{ type: "bold" }, link("javascript:x")])))), doc(p(t("lien", [{ type: "bold" }]))));
});

test("safe links keep only their address, one link per text", () => {
  const value = clean(
    doc(
      p(t("site", [{ type: "link", attrs: { href: "https://exemple.fr/page?x=1#a", target: "_blank", rel: "noopener", class: "x" } }])),
      p(t("mail", [link("mailto:bde@exemple.fr")])),
      p(t("page", [link("/associations/exemple-finance")])),
      p(t("deux", [link("javascript:x"), link("https://exemple.fr/a"), link("https://exemple.fr/b")])),
    ),
  );
  assert.deepEqual(
    value,
    doc(
      p(t("site", [link("https://exemple.fr/page?x=1#a")])),
      p(t("mail", [link("mailto:bde@exemple.fr")])),
      p(t("page", [link("/associations/exemple-finance")])),
      p(t("deux", [link("https://exemple.fr/a")])),
    ),
  );
});

test("headings are level 2 or 3 only; empty headings are dropped", () => {
  const levels = clean(doc(...[1, 2, 3, 4, 6, "3", 2.5, undefined].map((level) => h(level, `Niveau ${level}`)))).content.map(
    (n) => n.attrs.level,
  );
  assert.deepEqual(levels, [2, 2, 3, 3, 3, 3, 2, 2]);
  assert.deepEqual(
    clean(doc({ type: "heading", attrs: { level: 2 }, content: [] }, { type: "heading", attrs: { level: 2 }, content: [{ type: "mention" }] }, p("x"))),
    doc(p("x")),
  );
});

test("images: only a library reference (uuid); alt and caption one clean line or null", () => {
  const value = clean(
    doc(
      { type: "image", attrs: { mediaId: MEDIA, alt: "  Le   bureau\n au complet ", caption: " Photo\u0000 : BDE\u0007 ", src: "https://evil.example/x.png", onerror: "alert(1)" } },
      { type: "image", attrs: { mediaId: MEDIA_2, alt: "   ", caption: 42 } },
      { type: "image", attrs: { mediaId: "https://evil.example/x.png", alt: "x" } },
      { type: "image", attrs: { mediaId: MEDIA.toUpperCase() } },
      { type: "image", attrs: { mediaId: `${MEDIA} ` } },
      { type: "image", attrs: { src: "https://evil.example/x.png" } },
      { type: "image" },
      { type: "image", attrs: { mediaId: MEDIA, alt: "a".repeat(250), caption: "\u0001\u001f" } },
    ),
  );
  assert.deepEqual(
    value,
    doc(img(MEDIA, "Le bureau au complet", "Photo : BDE"), img(MEDIA_2), img(MEDIA, "a".repeat(200), null)),
  );
});

test("text: control characters out (tabs and line ends stay), 20 000 characters per run", () => {
  const value = clean(doc(p(t("Bon\u0000jour\u0008\u007f")), p(t("a\tb\nc")), p(t("\u0000\u001f")), p(t("x".repeat(25000))), p(t(42), t(""), "fin")));
  assert.deepEqual(value.content.slice(0, 3), [p("Bonjour"), p("a\tb\nc"), p()]);
  assert.equal(value.content[3].content[0].text.length, 20000);
  assert.deepEqual(value.content[4], p("fin"));
});

test("lists: list items only, an empty item keeps an empty line, an empty list is dropped", () => {
  const value = clean(
    doc(
      {
        type: "bulletList",
        content: [{ type: "listItem", content: [p("Un")] }, p("intrus"), { type: "listItem", content: [] }, { type: "listItem" }],
      },
      { type: "bulletList", content: [p("pas un élément")] },
      { type: "orderedList" },
      { type: "blockquote", content: [{ type: "script" }] },
      p("fin"),
    ),
  );
  assert.deepEqual(
    value,
    doc(
      {
        type: "bulletList",
        content: [
          { type: "listItem", content: [p("Un")] },
          { type: "listItem", content: [p()] },
          { type: "listItem", content: [p()] },
        ],
      },
      p("fin"),
    ),
  );
});

test("nesting deeper than 6 levels is refused (quotes and lists alike)", () => {
  const quotes = (n) => {
    let node = p("Au fond");
    for (let i = 0; i < n; i++) node = { type: "blockquote", content: [node] };
    return doc(node);
  };
  const lists = (n) => {
    let node = p("Au fond");
    for (let i = 0; i < n; i++) node = { type: "bulletList", content: [{ type: "listItem", content: [node] }] };
    return doc(node);
  };
  assert.equal(normalizeDocument(quotes(6)).ok, true);
  assert.deepEqual(normalizeDocument(quotes(7)), { ok: false, reason: "too_deep" });
  assert.equal(normalizeDocument(lists(6)).ok, true);
  assert.deepEqual(normalizeDocument(lists(7)), { ok: false, reason: "too_deep" });
});

test("more than 2 000 blocks is refused, nested and dropped ones included", () => {
  const many = (n, make) => doc(...Array.from({ length: n }, make));
  assert.equal(normalizeDocument(many(2000, () => p("x"))).ok, true);
  assert.deepEqual(normalizeDocument(many(2001, () => p("x"))), { ok: false, reason: "too_long" });
  assert.deepEqual(normalizeDocument(many(1001, () => ({ type: "blockquote", content: [p("x")] }))), { ok: false, reason: "too_long" });
  assert.deepEqual(normalizeDocument(many(2001, () => ({ type: "script" }))), { ok: false, reason: "too_long" });
});

test("a body over 180 000 characters is refused", () => {
  const big = (n) => doc(...Array.from({ length: n }, () => p("x".repeat(20000))));
  assert.equal(normalizeDocument(big(8)).ok, true);
  assert.deepEqual(normalizeDocument(big(9)), { ok: false, reason: "too_long" });
});

test("trailing empty paragraphs are dropped; empty lines inside the text stay", () => {
  assert.deepEqual(
    clean(doc(p(), p("Texte"), p(), p("Suite"), p(), { type: "paragraph", content: [] }, p(t("\u0000")), { type: "paragraph", content: [{ type: "mention" }] })),
    doc(p(), p("Texte"), p(), p("Suite")),
  );
  assert.deepEqual(clean(doc(p(), p(), p())), EMPTY_DOCUMENT);
  assert.deepEqual(clean(doc(p("x"), { type: "horizontalRule" })), doc(p("x"), { type: "horizontalRule" }));
  assert.deepEqual(clean(doc(p("x"), p({ type: "hardBreak" }))), doc(p("x"), p({ type: "hardBreak" })));
});

test("anything but a document is refused; a document without content is empty", () => {
  for (const input of [null, undefined, "doc", 42, [], {}, { type: "DOC", content: [] }, { type: "paragraph", content: [p("x")] }, "<p>x</p>"]) {
    assert.deepEqual(normalizeDocument(input), { ok: false, reason: "not_a_document" }, JSON.stringify(input));
  }
  assert.deepEqual(clean({ type: "doc" }), EMPTY_DOCUMENT);
  assert.deepEqual(clean({ type: "doc", content: "<p>x</p>" }), EMPTY_DOCUMENT);
  assert.deepEqual(clean(EMPTY_DOCUMENT), EMPTY_DOCUMENT);
});

// A paste from another site, with everything the editor never produces.
const hostile = {
  type: "doc",
  attrs: { onload: "alert(1)" },
  content: [
    { type: "heading", attrs: { level: 1, id: "h", style: "x" }, content: [t("Titre", [{ type: "textStyle", attrs: { color: "red" } }])] },
    {
      type: "paragraph",
      attrs: { class: "x" },
      content: [
        t("Clique ", [{ type: "bold" }, { type: "bold" }, { type: "underline" }]),
        t("ici", [{ type: "link", attrs: { href: "javascript:alert(1)", target: "_blank" } }]),
        { type: "image", attrs: { src: "https://evil.example/x.png" } },
        { type: "hardBreak", attrs: { x: 1 } },
        t("<img src=x onerror=alert(1)>"),
      ],
    },
    { type: "script", content: [t("alert(1)")] },
    { type: "image", attrs: { mediaId: MEDIA, alt: "Photo", src: "https://evil.example/x.png", type: "script" } },
    {
      type: "blockquote",
      content: [
        { type: "heading", attrs: { level: 5 }, content: [t("Cité")] },
        { type: "bulletList", attrs: { tight: true }, content: [{ type: "listItem", content: [p(t("lien", [link("https://exemple.fr")]))] }] },
      ],
    },
    { type: "orderedList", content: [{ type: "listItem", content: [{ type: "iframe" }] }] },
    p(),
  ],
};

test("a hostile paste comes out as a body the database accepts, text kept as text", () => {
  const value = clean(hostile);
  const rule = sqlFunction("private.valid_post_body");
  const types = new Set([...rule.matchAll(/@ == "([A-Za-z]+)"/g)].map((m) => m[1]));
  assert.ok(types.has("paragraph") && types.has("link") && types.size >= 14, "the database's node types were read");
  const href = new RegExp(rule.match(/@\.attrs\.href like_regex "([^"]+)"/)[1].replaceAll("[:space:]", "\\s"));
  const uuid = new RegExp(rule.match(/@\.attrs\.mediaId like_regex "([^"]+)"/)[1]);
  const keys = new Set(["type", "content", "attrs", "marks", "text", "href", "level", "mediaId", "alt", "caption"]);
  for (const o of objects(value)) {
    for (const k of Object.keys(o)) assert.ok(keys.has(k), `unexpected key ${k}`);
    if ("type" in o) assert.ok(types.has(o.type), `unexpected type ${o.type}`);
    if (o.type === "link") assert.match(o.attrs.href, href);
    if (o.type === "image") assert.match(o.attrs.mediaId, uuid);
    if (o.type === "heading") assert.ok(o.attrs.level === 2 || o.attrs.level === 3);
  }
  assert.equal(documentText(value), "Titre Clique ici <img src=x onerror=alert(1)> Cité lien");
  assert.ok(JSON.stringify(value).length < JSON.stringify(hostile).length);
});

test("normalizing twice changes nothing", () => {
  const once = clean(hostile);
  assert.deepEqual(clean(structuredClone(once)), once);
});

// ---- document.ts: links typed by people ----------------------------------------------------

test("isSafeHref is the database's link rule, and also refuses a user name in the address", () => {
  const rule = sqlFunction("private.valid_post_body");
  const db = new RegExp(rule.match(/@\.attrs\.href like_regex "([^"]+)"/)[1].replaceAll("[:space:]", "\\s"));
  const samples = [
    "https://exemple.fr",
    "http://exemple.fr/a?b=c#d",
    "mailto:bde@exemple.fr",
    "/associations/x",
    "/a",
    "/",
    "/Associations",
    "//evil.example",
    "exemple.fr",
    "HTTPS://exemple.fr",
    "MAILTO:bde@exemple.fr",
    "https://",
    "https:// exemple.fr",
    "https://exemple.fr\n",
    "javascript:alert(1)",
    "data:text/html,x",
    "ftp://exemple.fr",
    "",
  ];
  for (const href of samples) assert.equal(isSafeHref(href), db.test(href), JSON.stringify(href));
  for (const href of ["http://user:pass@exemple.fr/", "https://exemple.fr@evil.example", "https://exemple.fr?next=a@b"]) {
    assert.equal(db.test(href), true);
    assert.equal(isSafeHref(href), false, href);
  }
  // An @ after the host (a path or a query) is fine.
  assert.equal(isSafeHref("https://exemple.fr/profil/@asso"), true);
  // 2 000 characters at most.
  assert.equal(isSafeHref(`https://exemple.fr/${"x".repeat(1981)}`), true);
  assert.equal(isSafeHref(`https://exemple.fr/${"x".repeat(1982)}`), false);
  for (const v of [null, undefined, 42, ["https://exemple.fr"], { href: "https://exemple.fr" }]) assert.equal(isSafeHref(v), false);
});

test("toSafeHref turns what people type into a safe link, or nothing", () => {
  const cases = [
    ["ton-asso.fr", "https://ton-asso.fr"],
    ["  ton-asso.fr/evenements  ", "https://ton-asso.fr/evenements"],
    ["www.exemple.fr", "https://www.exemple.fr"],
    ["https://exemple.fr/page", "https://exemple.fr/page"],
    ["http://exemple.fr", "http://exemple.fr"],
    ["HTTPS://Exemple.fr/Page", "https://Exemple.fr/Page"],
    ["MAILTO:bde@exemple.fr", "mailto:bde@exemple.fr"],
    ["mailto:bde@exemple.fr", "mailto:bde@exemple.fr"],
    ["/associations/x", "/associations/x"],
    ["javascript:alert(1)", null],
    ["JavaScript:alert(1)", null],
    ["  javascript:alert(1)", null],
    ["data:text/html,x", null],
    ["vbscript:msgbox(1)", null],
    ["ftp://exemple.fr", null],
    ["tel:0600000000", null],
    ["//x", null],
    ["//evil.example/x", null],
    ["/", null],
    ["http://user:pass@host.exemple.fr", null],
    ["ton asso.fr", null],
    ["", null],
    ["   ", null],
  ];
  for (const [raw, expected] of cases) assert.equal(toSafeHref(raw), expected, JSON.stringify(raw));
  for (const [, v] of cases) if (v) assert.equal(isSafeHref(v), true, v);
});

test("external links are the http(s) ones", () => {
  assert.equal(isExternalHref("https://exemple.fr"), true);
  assert.equal(isExternalHref("http://exemple.fr"), true);
  assert.equal(isExternalHref("/associations/x"), false);
  assert.equal(isExternalHref("mailto:bde@exemple.fr"), false);
});

// ---- document.ts: reading the body ------------------------------------------------------------

const rich = doc(
  h(2, "Programme"),
  p("Un", { type: "hardBreak" }, "deux"),
  img(MEDIA, "Photo"),
  { type: "bulletList", content: [{ type: "listItem", content: [p("trois"), img(MEDIA_2)] }] },
  { type: "blockquote", content: [h(2, "Cité"), p(t("quatre", [{ type: "bold" }]))] },
  { type: "heading", attrs: { level: 3 }, content: [t("Le"), { type: "hardBreak" }, t("soir")] },
  { type: "horizontalRule" },
);

test("documentText reads every paragraph and heading, nested ones included", () => {
  assert.equal(documentText(rich), "Programme Un deux trois Cité quatre Le soir");
  assert.equal(documentText(EMPTY_DOCUMENT), "");
});

test("documentImages lists every image in order, nested ones included", () => {
  assert.deepEqual(
    documentImages(rich).map((i) => i.attrs.mediaId),
    [MEDIA, MEDIA_2],
  );
  assert.deepEqual(documentImages(EMPTY_DOCUMENT), []);
});

test("documentHeadings lists the article's own headings (not those inside a quote)", () => {
  assert.deepEqual(documentHeadings(rich), [
    { level: 2, text: "Programme" },
    { level: 3, text: "Le soir" },
  ]);
});

test("reading time: 200 words a minute, rounded, one minute at least, introduction included", () => {
  const words = (n) => doc(p(Array.from({ length: n }, () => "mot").join(" ")));
  assert.equal(readingMinutes(null, EMPTY_DOCUMENT), 1);
  assert.equal(readingMinutes("", words(99)), 1);
  assert.equal(readingMinutes(null, words(200)), 1);
  assert.equal(readingMinutes(null, words(299)), 1);
  assert.equal(readingMinutes(null, words(300)), 2);
  assert.equal(readingMinutes("Une intro de six mots ici.", words(294)), 2);
  assert.equal(readingMinutes(undefined, words(1000)), 5);
});

// ---- document.ts: editorial reminders ---------------------------------------------------------

const longText = Array.from({ length: 50 }, () => "texte").join(" "); // 299 characters
const complete = {
  kind: "article",
  title: "Le gala de l'hiver (exemple)",
  intro: "Une introduction.",
  doc: doc(h(2, "Programme"), p(longText), img(MEDIA, "Photo")),
  hasCover: true,
};
const notes = (over) => qualityNotes({ ...complete, ...over }).map((n) => n.key);

test("quality notes: none for a complete article", () => {
  assert.deepEqual(qualityNotes(complete), []);
});

test("quality notes: each reminder and what triggers it", () => {
  assert.deepEqual(notes({ title: "x".repeat(91) }), ["title"]);
  assert.deepEqual(notes({ title: `  ${"x".repeat(90)}  ` }), []);
  assert.deepEqual(notes({ intro: null }), ["intro"]);
  assert.deepEqual(notes({ intro: "" }), ["intro"]);
  assert.deepEqual(notes({ hasCover: false }), ["cover"]);
  // A brève has no cover, and may be short.
  assert.deepEqual(notes({ kind: "breve", hasCover: false, doc: doc(p("Court.")) }), []);
  assert.deepEqual(notes({ kind: "annonce", doc: doc(p("Court.")) }), []);
  assert.deepEqual(notes({ doc: doc(p("Court.")) }), ["short"]);
  assert.deepEqual(notes({ kind: "recap", doc: doc(p("x".repeat(199))) }), ["short"]);
  assert.deepEqual(notes({ kind: "recap", doc: doc(p("x".repeat(200))) }), []);
  assert.deepEqual(notes({ doc: doc(h(3, "Petit"), p(longText), h(2, "Grand")) }), ["headings"]);
  assert.deepEqual(notes({ doc: doc(p(longText), h(2, "Grand"), h(3, "Petit")) }), []);
});

test("quality notes: images without a description are counted, nested ones included", () => {
  const one = qualityNotes({ ...complete, doc: doc(p(longText), img(MEDIA)) });
  assert.deepEqual(one, [{ key: "alt", message: "Une image n'a pas de description." }]);
  const two = qualityNotes({ ...complete, doc: doc(p(longText), img(MEDIA), { type: "blockquote", content: [img(MEDIA_2)] }, img(MEDIA, "Photo")) });
  assert.deepEqual(two, [{ key: "alt", message: "2 images n'ont pas de description." }]);
  // Every reminder is a sentence for the editor, never a key.
  const all = qualityNotes({ kind: "article", title: "x".repeat(91), intro: null, doc: doc(h(3, "x"), img(MEDIA)), hasCover: false });
  assert.deepEqual(all.map((n) => n.key), ["title", "intro", "cover", "alt", "short", "headings"]);
  for (const n of all) assert.match(n.message, /^[A-Z0-9].+\.$/);
});

// ---- document.ts: tags ----------------------------------------------------------------------------

test("tags: accents, apostrophes and symbols become dashes; 2 to 30 characters", () => {
  const cases = [
    ["Week-end d'intégration", "week-end-d-integration"],
    ["C'est l'été !", "c-est-l-ete"],
    ["C’est l’été", "c-est-l-ete"],
    ["  Gala 2027  ", "gala-2027"],
    ["Soirée—Ski", "soiree-ski"],
    ["ÉLECTIONS", "elections"],
    ["#BDE", "bde"],
    ["ab", "ab"],
    ["a".repeat(40), "a".repeat(30)],
    // The cut falls on a dash: it is dropped too.
    ["abcd-".repeat(7), "abcd-abcd-abcd-abcd-abcd-abcd"],
    ["a", null],
    ["é", null],
    ["!!", null],
    ["- -", null],
    ["", null],
  ];
  for (const [raw, expected] of cases) assert.equal(normalizeTag(raw), expected, raw);
  // Whatever is typed, a tag is what the database accepts (private.valid_post_tags).
  for (const [raw] of cases) {
    const tag = normalizeTag(raw);
    if (tag) assert.ok(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(tag) && tag.length <= 30, tag);
  }
});

test(
  "tags fold œ and æ like the database does (fold_accents)",
  () => {
    assert.equal(normalizeTag("Vœux du BDE"), "voeux-du-bde");
    assert.equal(normalizeTag("Cœur"), "coeur");
    assert.equal(normalizeTag("Ex æquo"), "ex-aequo");
  },
);

// ---- schedule.ts: campus time -----------------------------------------------------------------------

test("Paris time → instant: summer time is +02:00, winter time +01:00", () => {
  assert.deepEqual(parisLocalToInstant("2026-07-14", "18:00"), { ok: true, iso: "2026-07-14T16:00:00.000Z", offset: "+02:00", ambiguous: false });
  assert.deepEqual(parisLocalToInstant("2026-12-24", "20:30"), { ok: true, iso: "2026-12-24T19:30:00.000Z", offset: "+01:00", ambiguous: false });
  assert.deepEqual(parisLocalToInstant("2027-01-01", "00:00"), { ok: true, iso: "2026-12-31T23:00:00.000Z", offset: "+01:00", ambiguous: false });
  assert.deepEqual(parisLocalToInstant("2028-02-29", "10:00"), { ok: true, iso: "2028-02-29T09:00:00.000Z", offset: "+01:00", ambiguous: false });
});

test("the hour that does not exist (last Sunday of March, 02:00–02:59) is refused", () => {
  for (const time of ["02:00", "02:30", "02:59"]) assert.deepEqual(parisLocalToInstant("2027-03-28", time), { ok: false, reason: "nonexistent" });
  assert.deepEqual(parisLocalToInstant("2027-03-28", "01:59"), { ok: true, iso: "2027-03-28T00:59:00.000Z", offset: "+01:00", ambiguous: false });
  assert.deepEqual(parisLocalToInstant("2027-03-28", "03:00"), { ok: true, iso: "2027-03-28T01:00:00.000Z", offset: "+02:00", ambiguous: false });
});

test("the hour that happens twice (last Sunday of October) takes the first, summer time, and says so", () => {
  assert.deepEqual(parisLocalToInstant("2026-10-25", "02:30"), { ok: true, iso: "2026-10-25T00:30:00.000Z", offset: "+02:00", ambiguous: true });
  assert.deepEqual(parisLocalToInstant("2026-10-25", "02:00"), { ok: true, iso: "2026-10-25T00:00:00.000Z", offset: "+02:00", ambiguous: true });
  assert.deepEqual(parisLocalToInstant("2026-10-25", "02:59"), { ok: true, iso: "2026-10-25T00:59:00.000Z", offset: "+02:00", ambiguous: true });
  assert.deepEqual(parisLocalToInstant("2026-10-25", "01:59"), { ok: true, iso: "2026-10-24T23:59:00.000Z", offset: "+02:00", ambiguous: false });
  assert.deepEqual(parisLocalToInstant("2026-10-25", "03:00"), { ok: true, iso: "2026-10-25T02:00:00.000Z", offset: "+01:00", ambiguous: false });
});

test("malformed fields and impossible dates are invalid", () => {
  const invalid = [
    ["2026-02-30", "10:00"],
    ["2026-02-29", "10:00"],
    ["2026-04-31", "10:00"],
    ["2026-13-01", "10:00"],
    ["2026-00-10", "10:00"],
    ["2026-10-24", "24:00"],
    ["2026-10-24", "23:60"],
    ["2026-10-24", "9:00"],
    ["2026-10-24", "18h00"],
    ["2026-10-24", "18:00:00"],
    ["2026-1-5", "10:00"],
    ["24/10/2026", "10:00"],
    [" 2026-10-24", "10:00"],
    ["2026-10-24", ""],
    ["", ""],
  ];
  for (const [date, time] of invalid) assert.deepEqual(parisLocalToInstant(date, time), { ok: false, reason: "invalid" }, `${date} ${time}`);
});

test("instant → Paris time round-trips, midnight is 00:00, both 02:30 of October read 02:30", () => {
  for (const [date, time] of [
    ["2026-07-14", "18:00"],
    ["2026-12-24", "20:30"],
    ["2026-10-25", "02:30"],
    ["2027-03-28", "03:00"],
    ["2027-01-01", "00:00"],
    ["2026-10-24", "23:59"],
  ]) {
    const r = parisLocalToInstant(date, time);
    assert.equal(r.ok, true);
    assert.deepEqual(instantToParisLocal(r.iso), { date, time });
  }
  assert.deepEqual(instantToParisLocal("2026-10-25T01:30:00.000Z"), { date: "2026-10-25", time: "02:30" });
  assert.deepEqual(instantToParisLocal("2026-10-24T22:00:00.000Z"), { date: "2026-10-25", time: "00:00" });
  // As the database writes it (microseconds, offset).
  assert.deepEqual(instantToParisLocal("2026-10-24T16:00:00.123456+00:00"), { date: "2026-10-24", time: "18:00" });
});

test("a scheduled time in words, with the season of the clock when asked", () => {
  assert.equal(formatScheduled("2026-10-24T16:00:00.000Z"), "samedi 24 octobre à 18:00");
  assert.equal(formatScheduled("2026-10-24T16:00:00.000Z", true), "samedi 24 octobre à 18:00 (heure d'été)");
  assert.equal(formatScheduled("2026-12-24T19:30:00.000Z", true), "jeudi 24 décembre à 20:30 (heure d'hiver)");
  // The two 02:30 of the October change only differ by their season.
  assert.equal(formatScheduled("2026-10-25T00:30:00.000Z", true), "dimanche 25 octobre à 02:30 (heure d'été)");
  assert.equal(formatScheduled("2026-10-25T01:30:00.000Z", true), "dimanche 25 octobre à 02:30 (heure d'hiver)");
  assert.equal(formatScheduled("2026-10-24T22:00:00.000Z"), "dimanche 25 octobre à 00:00");
});

// ---- model.ts: where a post stands --------------------------------------------------------------------

/** The least a summary needs for its stage, its desk tabs and the desk search. */
const summary = (over = {}) => ({
  title: "Le gala de l'hiver (exemple)",
  tags: [],
  created_by_name: "Compte Démo",
  category: null,
  hidden: null,
  schedule: null,
  working: { id: REV_WORK, status: "draft" },
  publication: "unpublished",
  published: null,
  first_published_at: null,
  ...over,
});
const live = { id: REV_LIVE, number: 1, title: "Le gala" };
const AT = "2026-10-20T10:00:00.123456+00:00";
const pending = { at: "2026-10-24T16:00:00+00:00", status: "pending", error: null, attempts: 0, revision: 2 };
const failed = { ...pending, status: "failed", error: "page_not_public", attempts: 1 };

// One post per stage, named by the stage the desk must show.
const posts = {
  draft: summary(),
  changes: summary({ working: { id: REV_WORK, status: "changes_requested" } }),
  review: summary({ working: { id: REV_WORK, status: "submitted" } }),
  approved: summary({ working: { id: REV_WORK, status: "approved" } }),
  scheduled: summary({ working: { id: REV_WORK, status: "approved" }, schedule: pending }),
  failed: summary({ working: { id: REV_WORK, status: "approved" }, schedule: failed }),
  live: summary({ working: { id: REV_LIVE, status: "approved" }, publication: "published", published: live, first_published_at: AT }),
  live_draft: summary({ publication: "published", published: live, first_published_at: AT }),
  hidden: summary({
    working: { id: REV_LIVE, status: "approved" },
    publication: "published",
    published: live,
    first_published_at: AT,
    hidden: { at: AT, reason: "Signalé (exemple)" },
  }),
  archived: summary({ working: { id: REV_LIVE, status: "approved" }, publication: "archived", published: live, first_published_at: AT }),
  offline: summary({ working: { id: REV_LIVE, status: "approved" }, published: live, first_published_at: AT }),
};

test("every stage, from the most urgent to the most settled", () => {
  for (const [stage, s] of Object.entries(posts)) assert.equal(postStage(s), stage);
});

test("stage priority: each rule wins over every later one", () => {
  // Everything at once, then one condition removed at a time.
  const steps = [
    [{}, "hidden"],
    [{ hidden: null }, "failed"],
    [{ schedule: pending }, "scheduled"],
    [{ schedule: null }, "review"],
    [{ working: { id: REV_WORK, status: "changes_requested" } }, "changes"],
    [{ working: { id: REV_WORK, status: "approved" } }, "approved"],
    [{ working: { id: REV_LIVE, status: "approved" } }, "live"],
    [{ working: { id: REV_WORK, status: "draft" } }, "live_draft"],
    [{ publication: "archived" }, "archived"],
    [{ publication: "unpublished" }, "offline"],
    [{ first_published_at: null, published: null }, "draft"],
  ];
  let s = summary({
    hidden: { at: AT, reason: "Signalé (exemple)" },
    schedule: failed,
    working: { id: REV_WORK, status: "submitted" },
    publication: "published",
    published: live,
    first_published_at: AT,
  });
  for (const [change, stage] of steps) {
    s = { ...s, ...change };
    assert.equal(postStage(s), stage, JSON.stringify(change));
  }
  // An approved revision never published yet is "approved", not "live".
  assert.equal(postStage(summary({ working: { id: REV_WORK, status: "approved" }, published: null })), "approved");
});

test("every stage has words and a tone; no raw status name reaches the screen", () => {
  const stages = Object.keys(posts).sort();
  assert.deepEqual(Object.keys(STAGE_LABEL).sort(), stages);
  assert.deepEqual(Object.keys(STAGE_TONE).sort(), stages);
  assert.equal(new Set(Object.values(STAGE_LABEL)).size, stages.length);
  for (const [stage, label] of Object.entries(STAGE_LABEL)) {
    assert.match(label, /^[A-ZÀ-Ý]/);
    assert.notEqual(label.toLowerCase(), stage.replace("_", " "));
  }
  for (const tone of Object.values(STAGE_TONE)) assert.ok(["ok", "warn", "danger", "info", "accent", "neutral"].includes(tone));
});

test("every reason the scheduler can record has words", () => {
  const blocker = sqlFunction("private.publication_blocker");
  const worker = sqlFunction("private.run_scheduled_publications");
  const codes = new Set([...blocker.matchAll(/return '([a-z_]+)'/g), ...worker.matchAll(/v_blocker := '([a-z_]+)'/g)].map((m) => m[1]));
  assert.ok(codes.size >= 8, "the scheduler's reasons were read");
  assert.deepEqual([...codes].filter((c) => !SCHEDULE_ERROR_LABEL[c]), []);
  // The desk prints "Prévue samedi… : <reason>.": lower case, no full stop of its own.
  for (const label of Object.values(SCHEDULE_ERROR_LABEL)) assert.match(label, /^[a-zà-ÿ].*[^.]$/, label);
});

test("desk tabs: which post sits in which tab (online with an edit in progress sits in two)", () => {
  assert.deepEqual(
    DESK_VIEWS.map((v) => v.key),
    ["tous", "brouillons", "relecture", "programmes", "en-ligne", "archives"],
  );
  const expected = {
    tous: Object.keys(posts),
    brouillons: ["draft", "changes", "live_draft"],
    relecture: ["review"],
    programmes: ["scheduled", "failed"],
    "en-ligne": ["live", "live_draft"],
    archives: ["archived"],
  };
  for (const { key, label } of DESK_VIEWS) {
    assert.ok(label.trim());
    const found = Object.entries(posts)
      .filter(([, s]) => inView(s, key))
      .map(([stage]) => stage);
    assert.deepEqual(found, expected[key], key);
  }
});

test("desk search: accents and case ignored, every word must match, kind label and author count", () => {
  const s = summary({ title: "Soirée d'intégration", tags: ["week-end", "gala"], created_by_name: "Compte Démo", category: "Vie étudiante" });
  assert.equal(matchesDeskSearch(s, "", "Récap"), true);
  assert.equal(matchesDeskSearch(s, "   ", "Récap"), true);
  assert.equal(matchesDeskSearch(s, "SOIREE", "Récap"), true);
  assert.equal(matchesDeskSearch(s, "  intégration   SOIRÉE ", "Récap"), true);
  assert.equal(matchesDeskSearch(s, "soiree football", "Récap"), false);
  assert.equal(matchesDeskSearch(s, "recap", "Récap"), true);
  assert.equal(matchesDeskSearch(s, "recap", "Article"), false);
  assert.equal(matchesDeskSearch(s, "demo", "Récap"), true);
  assert.equal(matchesDeskSearch(s, "week-end gala", "Récap"), true);
  assert.equal(matchesDeskSearch(s, "etudiante", "Récap"), true);
  assert.equal(matchesDeskSearch({ ...s, category: null }, "etudiante", "Récap"), false);
});

test(
  "desk search folds œ and æ like the database does",
  () => {
    assert.equal(matchesDeskSearch(summary({ title: "Les vœux du bureau" }), "voeux", "Annonce"), true);
  },
);

// ---- model.ts: the public mapping --------------------------------------------------------------------

const organization = { id: ORG, slug: "exemple-finance", name: "Finance (exemple)", short_name: "FIN", accent: "vert", kind: "association", logo: null };
const card = (over = {}) => ({
  id: POST,
  slug: "gala-exemple",
  kind: "article",
  title: "Le gala de l'hiver (exemple)",
  intro: "Une introduction.",
  cover: { id: MEDIA, path: `${ORG}/${MEDIA}.webp`, width: 1600, height: 900, alt: null },
  category: { slug: "exemple", label: "Exemple" },
  tags: ["gala"],
  organization,
  first_published_at: AT,
  published_at: AT,
  reading_minutes: 3,
  prominence: "normal",
  pinned: false,
  archived: false,
  author_name: null,
  ...over,
});

test("a published post as lists show it, nothing more", () => {
  const item = toPostItem(card());
  assert.deepEqual(Object.keys(item).sort(), [
    "archived",
    "association",
    "authorName",
    "campaign",
    "category",
    "cover",
    "event",
    "excerpt",
    "id",
    "kind",
    "pinned",
    "prominence",
    "publishedAt",
    "readingMinutes",
    "slug",
    "tags",
    "title",
    "updatedAt",
  ]);
  assert.equal(item.id, POST);
  assert.equal(item.slug, "gala-exemple");
  assert.equal(item.excerpt, "Une introduction.");
  assert.equal(item.publishedAt, AT);
  assert.equal(item.updatedAt, undefined);
  assert.equal(item.readingMinutes, 3);
  assert.equal(item.authorName, undefined);
  assert.equal(item.event, undefined, "no event linked: none shown (Phase 7)");
  assert.deepEqual(item.category, { slug: "exemple", label: "Exemple" });
  assert.deepEqual(item.tags, ["gala"]);
  assert.equal(item.cover.src, `/media/associations/${ORG}/${MEDIA}.webp`);
  assert.equal(item.cover.alt, "Le gala de l'hiver (exemple)");
  assert.deepEqual([item.cover.width, item.cover.height], [1600, 900]);
  assert.deepEqual(item.association, {
    id: ORG,
    slug: "exemple-finance",
    name: "Finance (exemple)",
    shortName: "FIN",
    kind: "Association étudiante",
    isBde: false,
    categories: [],
    accent: "vert",
    logo: undefined,
  });
});

test("optional parts: no introduction, cover, category or signature", () => {
  const item = toPostItem(card({ intro: null, cover: null, category: null, author_name: null }));
  assert.equal(item.excerpt, "");
  assert.equal(item.cover, undefined);
  assert.equal(item.category, undefined);
  assert.equal(item.authorName, undefined);
  assert.equal(toPostItem(card({ author_name: "Compte Démo" })).authorName, "Compte Démo");
});

test("prominence, pin and archive pass through", () => {
  const item = toPostItem(card({ prominence: "important", pinned: true, archived: true }));
  assert.deepEqual([item.prominence, item.pinned, item.archived], ["important", true, true]);
  const other = toPostItem(card({ prominence: "featured" }));
  assert.deepEqual([other.prominence, other.pinned, other.archived], ["featured", false, false]);
});

test("“updated” shows only when republished more than a minute after the first publication", () => {
  const updated = (published_at) => toPostItem(card({ first_published_at: "2026-10-20T10:00:00+00:00", published_at })).updatedAt;
  assert.equal(updated("2026-10-20T10:00:00+00:00"), undefined);
  assert.equal(updated("2026-10-20T10:00:59.999+00:00"), undefined);
  assert.equal(updated("2026-10-20T10:01:00+00:00"), undefined);
  assert.equal(updated("2026-10-20T10:01:00.001+00:00"), "2026-10-20T10:01:00.001+00:00");
  assert.equal(updated("2026-10-21T08:00:00.123456+00:00"), "2026-10-21T08:00:00.123456+00:00");
  // The feed order never moves: publishedAt stays the first publication.
  assert.equal(toPostItem(card({ published_at: "2026-10-21T08:00:00+00:00" })).publishedAt, AT);
});

test("the organization: the BDE keeps its badge, a logo is served by the site", () => {
  const bde = toPostItem(card({ organization: { ...organization, kind: "bde", short_name: null, accent: "rose" } })).association;
  assert.equal(bde.isBde, true);
  assert.equal(bde.kind, "Bureau des étudiants");
  assert.equal(bde.shortName, undefined);
  assert.equal(bde.logo, BDE_BADGE);
  const logo = { id: MEDIA_2, path: `${ORG}/${MEDIA_2}.webp`, width: 512, height: 512, alt: null };
  const withLogo = toPostItem(card({ organization: { ...organization, kind: "bde", logo } })).association.logo;
  assert.equal(withLogo.src, `/media/associations/${ORG}/${MEDIA_2}.webp`);
  assert.equal(withLogo.alt, "Logo de Finance (exemple)");
  const preview = toPostItem(card({ organization: { ...organization, logo } }), { preview: true });
  assert.equal(preview.association.logo.src, `/media/apercu/associations/${ORG}/${MEDIA_2}.webp`);
  assert.equal(preview.cover.src, `/media/apercu/associations/${ORG}/${MEDIA}.webp`);
});

test("an article's inline images are served by the site's media routes (preview: the private one)", () => {
  const body = doc(p("Texte"), img(MEDIA, "Le bureau"), img(MEDIA_2));
  const payload = {
    ...card(),
    body,
    media: {
      [MEDIA]: { id: MEDIA, path: `${ORG}/${MEDIA}.webp`, width: 1200, height: 800, alt: "Le bureau" },
      [MEDIA_2]: { id: MEDIA_2, path: `${ORG}/${MEDIA_2}.webp`, width: 800, height: 1200, alt: null },
      [REV_LIVE]: null,
    },
  };
  const article = toPostArticle(payload);
  assert.equal(article.body, body);
  assert.equal(article.title, payload.title);
  assert.deepEqual(article.media, {
    [MEDIA]: { src: `/media/associations/${ORG}/${MEDIA}.webp`, alt: "Le bureau", width: 1200, height: 800 },
    [MEDIA_2]: { src: `/media/associations/${ORG}/${MEDIA_2}.webp`, alt: "", width: 800, height: 1200 },
  });
  const preview = toPostArticle(payload, { preview: true });
  assert.equal(preview.media[MEDIA].src, `/media/apercu/associations/${ORG}/${MEDIA}.webp`);
  assert.equal(preview.media[MEDIA_2].src, `/media/apercu/associations/${ORG}/${MEDIA_2}.webp`);
  assert.equal(preview.cover.src, `/media/apercu/associations/${ORG}/${MEDIA}.webp`);
  assert.deepEqual(toPostArticle({ ...card(), body: EMPTY_DOCUMENT, media: null }).media, {});
});

// ---- model.ts: feed links --------------------------------------------------------------------------------

test("the feed cursor round-trips the database's exact instant", () => {
  for (const at of [AT, "2026-10-20T10:00:00+00:00", "2026-10-20T10:00:00Z", "2026-10-20T10:00:00.5-05:00", "2026-10-20T10:00:00+0200"]) {
    const raw = encodeFeedCursor({ at, id: POST });
    assert.equal(raw, `${at}~${POST}`);
    assert.deepEqual(parseFeedCursor(raw), { at, id: POST });
    assert.deepEqual(parseFeedCursor([raw, "autre"]), { at, id: POST });
  }
});

test("a malformed feed cursor is ignored (first page)", () => {
  const garbage = [
    undefined,
    "",
    [],
    "garbage",
    "~",
    `${AT}~`,
    `~${POST}`,
    `${AT}~${POST}~`,
    `${AT}~${POST}~${POST}`,
    `${AT}~pas-un-id`,
    `${AT}~${POST.toUpperCase()}`,
    `${AT}~${POST}; select 1`,
    `2026-10-20 10:00:00+00~${POST}`,
    `2026-10-20~${POST}`,
    `2026-10-20T10:00:00~${POST}`,
    `2026-13-45T10:00:00Z~${POST}`,
    `2026-10-20T25:00:00Z~${POST}`,
    `2026-10-20T10:00:00.1234567Z~${POST}`,
    `${AT}~${POST}`.padEnd(81, "0"),
    "x".repeat(81),
  ];
  for (const raw of garbage) assert.equal(parseFeedCursor(raw), null, JSON.stringify(raw));
});

test(
  "a feed cursor the database would refuse (impossible day, offset beyond ±14:59) is ignored",
  () => {
    for (const at of ["2026-02-30T10:00:00Z", "2026-04-31T10:00:00+00:00", "2026-10-20T10:00:00+23:59"]) {
      assert.equal(parseFeedCursor(`${at}~${POST}`), null, at);
    }
  },
);

test("feed filters: slugs only", () => {
  assert.equal(feedSlug("exemple-finance"), "exemple-finance");
  assert.equal(feedSlug(["exemple-finance", "autre"]), "exemple-finance");
  assert.equal(feedSlug("a".repeat(100)), "a".repeat(100));
  for (const raw of [undefined, "", [], "Exemple", "a--b", "-a", "a-", "a b", "../x", "é", "a".repeat(101)]) {
    assert.equal(feedSlug(raw), null, JSON.stringify(raw));
  }
});

test("feed search: one line, 80 characters at most", () => {
  assert.equal(feedQuery("  gala   2027 \n "), "gala 2027");
  assert.equal(feedQuery(["gala", "autre"]), "gala");
  assert.equal(feedQuery(undefined), "");
  assert.equal(feedQuery([]), "");
  assert.equal(feedQuery("x".repeat(200)).length, 80);
  // Under two characters the database would ignore the search: it is no search here either.
  assert.equal(feedQuery(" a "), "");
  assert.equal(feedQuery("BD"), "BD");
});

// ---- content.ts: what the editor saves -----------------------------------------------------------------------

const input = (over = {}) => ({
  kind: "article",
  title: "  Le gala   de l'hiver\n(exemple) ",
  intro: " Une   introduction.\t",
  body: doc(p("Texte"), { type: "script", content: [t("alert(1)")] }, p()),
  cover_media_id: MEDIA,
  category_id: MEDIA_2,
  tags: ["Gala", "gala", "GALA ", "Week-end d'intégration", "", "x", 42, null],
  ...over,
});

test("a complete save is cleaned: one-line texts, normalized tags, normalized body", () => {
  assert.deepEqual(normalizePostContent(input()), {
    ok: true,
    value: {
      kind: "article",
      title: "Le gala de l'hiver (exemple)",
      intro: "Une introduction.",
      body: doc(p("Texte")),
      cover_media_id: MEDIA,
      category_id: MEDIA_2,
      tags: ["gala", "week-end-d-integration"],
    },
  });
  for (const kind of ["article", "annonce", "recap", "breve"]) assert.equal(normalizePostContent(input({ kind })).ok, true, kind);
});

test("a draft may be almost empty", () => {
  assert.deepEqual(normalizePostContent({ kind: "annonce" }), {
    ok: true,
    value: { kind: "annonce", title: "", intro: null, body: EMPTY_DOCUMENT, cover_media_id: null, category_id: null, tags: [] },
  });
  const blank = normalizePostContent(input({ intro: "  \n ", body: null, cover_media_id: "", category_id: null, tags: [] }));
  assert.equal(blank.value.intro, null);
  assert.deepEqual(blank.value.body, EMPTY_DOCUMENT);
  assert.equal(blank.value.cover_media_id, null);
});

test("each refusal names its field", () => {
  const refused = (over) => normalizePostContent(input(over));
  for (const kind of [undefined, "", "event", "Article", "breve "]) assert.deepEqual(refused({ kind }), { ok: false, field: "kind" }, String(kind));
  assert.deepEqual(refused({ title: "x".repeat(POST_LIMITS.title + 1) }), { ok: false, field: "title" });
  assert.deepEqual(refused({ intro: "x".repeat(POST_LIMITS.intro + 1) }), { ok: false, field: "intro" });
  assert.deepEqual(refused({ body: "<p>x</p>" }), { ok: false, field: "body" });
  assert.deepEqual(refused({ body: { type: "paragraph" } }), { ok: false, field: "body" });
  for (const id of ["pas-un-id", MEDIA.toUpperCase(), ` ${MEDIA}`, 42, "   "]) {
    assert.deepEqual(refused({ cover_media_id: id }), { ok: false, field: "cover" }, String(id));
    assert.deepEqual(refused({ category_id: id }), { ok: false, field: "category" }, String(id));
  }
  assert.deepEqual(refused({ tags: "gala" }), { ok: false, field: "tags" });
  assert.deepEqual(refused({ tags: Array.from({ length: 9 }, (_, i) => `tag-${i}`) }), { ok: false, field: "tags" });
  for (const raw of [null, undefined, "texte", 42]) assert.deepEqual(normalizePostContent(raw), { ok: false, field: "body" });
});

test("limits are counted after cleaning, at the exact bound", () => {
  assert.equal(normalizePostContent(input({ title: "x".repeat(POST_LIMITS.title) })).ok, true);
  assert.equal(normalizePostContent(input({ intro: "x".repeat(POST_LIMITS.intro) })).ok, true);
  // Spaces that collapse do not count.
  const spaced = `${"x ".repeat(70)}`.replaceAll(" ", "   ");
  assert.ok(spaced.length > POST_LIMITS.title);
  assert.equal(normalizePostContent(input({ title: spaced })).value.title.length, 139);
  // Control characters become spaces.
  assert.equal(normalizePostContent(input({ title: "Gala\u0000\u0007 2027" })).value.title, "Gala 2027");
});

test("tags: 8 distinct ones at most, counted after normalizing", () => {
  const eight = Array.from({ length: 8 }, (_, i) => `Tag ${i}`);
  const r = normalizePostContent(input({ tags: [...eight, "TAG 0", "tag-1", "Tâg 2", "!"] }));
  assert.deepEqual(r.value.tags, eight.map((_, i) => `tag-${i}`));
  assert.deepEqual(normalizePostContent(input({ tags: undefined })).value.tags, []);
});

test("a brève has no cover: one chosen before switching kind is dropped", () => {
  assert.equal(normalizePostContent(input({ kind: "breve" })).value.cover_media_id, null);
  assert.equal(normalizePostContent(input({ kind: "annonce" })).value.cover_media_id, MEDIA);
  // An invalid cover is still refused, even for a brève.
  assert.deepEqual(normalizePostContent(input({ kind: "breve", cover_media_id: "x" })), { ok: false, field: "cover" });
});

// ---- Loading ------------------------------------------------------------------------------------------------

test(
  "the publishing modules load in plain Node",
  () => {
    for (const file of ["model.ts", "content.ts"]) {
      const url = new URL(file, import.meta.url).href;
      const r = spawnSync(
        process.execPath,
        ["--disable-warning=ExperimentalWarning", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--input-type=module", "-e", `await import(${JSON.stringify(url)});`],
        { encoding: "utf8", env: { ...process.env, NODE_TEST_CONTEXT: undefined } },
      );
      assert.equal(r.status, 0, `${file}: ${r.stderr.split("\n").find((l) => l.startsWith("Error")) ?? r.stderr}`);
    }
  },
);
