// Unit tests for the recruitment rules that live in the app: the public
// mapping (states, seats, lines), the form validator and answer checks that
// mirror the database, the builder's helpers, and the document checks
// (magic bytes, names, download header). Run with `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  campaignStatus,
  lines,
  matchesFilter,
  refusalLabel,
  retentionLines,
  retentionUndecided,
  toApplicationItem,
  toCampaignItem,
  totalSeats,
  yearsLabel,
} from "./model.ts";
import {
  EMPTY_FORM,
  answerErrors,
  answerText,
  cleanQuestion,
  formProblem,
  idFrom,
  move,
  newQuestion,
  questionsFor,
} from "./form.ts";
import { acceptFor, attachmentHeader, formatsLine, safeFileName, sizeLabel, sniffDocument } from "./documents.ts";
import { parseCampaignStep, parsePosition } from "./input.ts";
import { campaignChecklist, campaignStage, recruitmentDoneMessage } from "./desk.ts";
import { formSummary, previewCampaign, stateOnceOnline } from "./preview.ts";
import { applicationMessage, isApplicationMessage, renderApplicationEmail } from "./messages.ts";

const POS_A = "11111111-1111-4111-8111-111111111111";
const POS_B = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-11-10T12:00:00Z");

const org = { id: "o1", slug: "exemple-finance", name: "Finance (exemple)", short_name: null, accent: "rose", kind: "association", logo: null };
const position = (over = {}) => ({
  id: POS_A,
  slug: "tresorerie",
  title: "Trésorerie",
  team: null,
  summary: null,
  openings: 2,
  closes_at: "2026-11-20T22:59:00Z",
  closes_early: false,
  eligible_years: null,
  accepting: true,
  retired: false,
  missions: "- Tenir la caisse\n• Préparer le budget\n\n",
  ...over,
});
const card = (over = {}) => ({
  id: "c1",
  slug: "recrutement-2027",
  title: "Recrutement 2027",
  summary: "On recrute.",
  academic_year: "2026-2027",
  cover: null,
  organization: org,
  opens_at: "2026-11-01T08:00:00Z",
  closes_at: "2026-11-20T22:59:00Z",
  timezone: "Europe/Paris",
  state: "open",
  paused_at: null,
  cancelled_at: null,
  cancellation_reason: null,
  max_applications: 2,
  eligible_years: null,
  eligibility_note: null,
  archived: false,
  first_published_at: "2026-10-30T08:00:00Z",
  updated_at: "2026-10-30T08:00:00Z",
  positions: [position()],
  ...over,
});

test("campaign status follows the database's state, last 48 hours said louder", () => {
  assert.equal(campaignStatus("open", "2026-11-20T22:59:00Z", NOW), "ouverte");
  assert.equal(campaignStatus("open", "2026-11-11T12:00:00Z", NOW), "derniere-chance");
  assert.equal(campaignStatus("upcoming", "2026-11-20T22:59:00Z", NOW), "a-venir");
  assert.equal(campaignStatus("paused", "2026-11-20T22:59:00Z", NOW), "en-pause");
  assert.equal(campaignStatus("cancelled", "2026-11-20T22:59:00Z", NOW), "annulee");
  assert.equal(campaignStatus("closed", "2026-11-01T22:59:00Z", NOW), "cloturee");
});

test("missions and expectations: one per line, hand-typed bullets dropped", () => {
  assert.deepEqual(lines("- Tenir la caisse\n• Préparer le budget\n\n  Faire les relances  "), [
    "Tenir la caisse",
    "Préparer le budget",
    "Faire les relances",
  ]);
  assert.deepEqual(lines(null), []);
});

test("places are added up only when every position announced its number", () => {
  assert.equal(totalSeats([{ openings: 2 }, { openings: 1 }]), 3);
  assert.equal(totalSeats([{ openings: 2 }, { openings: undefined }]), null);
  assert.equal(totalSeats([]), null);
});

test("a campaign card maps to the UI's campaign", () => {
  const c = toCampaignItem(card(), { now: NOW });
  assert.equal(c.status, "ouverte");
  assert.equal(c.seats, 2);
  assert.equal(c.association.slug, "exemple-finance");
  assert.deepEqual(c.positions[0].missions, ["Tenir la caisse", "Préparer le budget"]);
  assert.equal(c.positions[0].closesAt, "2026-11-20T22:59:00Z");
  assert.equal(c.contact, undefined, "no contact named: none shown");
  const withContact = toCampaignItem(card({ contact: { name: "Julie (exemple)", role: null, email: null } }), { now: NOW });
  assert.equal(withContact.contact?.name, "Julie (exemple)");
});

test("an application of an offline campaign keeps its bare facts", () => {
  const a = toApplicationItem(
    {
      application: {
        id: "a1",
        status: "submitted",
        reference: "K7Q2M9XA",
        created_at: "2026-11-02T10:00:00Z",
        updated_at: "2026-11-03T10:00:00Z",
        last_saved_at: null,
        submitted_at: "2026-11-03T10:00:00Z",
        withdrawn_at: null,
        refusal: null,
        progress: null,
      },
      campaign: { id: "c1", slug: null, title: "Recrutement 2027", organization: org, state: "closed", closes_at: "2026-11-05T00:00:00Z", cancellation_reason: null, unavailable: true },
      position: { id: POS_A, slug: "tresorerie", title: "Trésorerie", team: null, closes_at: null },
    },
    NOW,
  );
  assert.equal(a.status, "envoyee");
  assert.equal(a.campaign.slug, undefined);
  assert.equal(a.campaign.status, "cloturee");
  assert.equal(a.position.closesAt, "2026-11-05T00:00:00Z");
  assert.ok(matchesFilter(a, "envoyees") && matchesFilter(a, "closes") && !matchesFilter(a, "brouillons"));
});

test("words: study years, refusals, retention", () => {
  assert.equal(yearsLabel(undefined), "Toutes les années");
  assert.equal(yearsLabel([3, 2]), "2e et 3e année");
  assert.equal(yearsLabel([1]), "1re année");
  assert.match(refusalLabel("campaign_closed"), /date limite est passée/);
  assert.equal(refusalLabel(null), null);
  assert.match(refusalLabel("something_new"), /ne peut pas être envoyée/);
  const undecided = { draft_months: null, withdrawn_months: 2, submitted_months: null };
  assert.ok(retentionUndecided(undecided));
  assert.match(retentionLines(undecided)[1], /2 mois après le retrait/);
  assert.match(retentionLines(undecided)[0], /pas encore fixée/);
});

// ---- Form ---------------------------------------------------------------------------------------

const schema = () => ({
  sections: [{ id: "s1", title: "Ta candidature" }],
  questions: [
    { id: "motivation", type: "long_text", scope: "shared", section: "s1", label: "Ta motivation", required: true, max_length: 50 },
    { id: "sport", type: "single_choice", scope: "shared", section: "s1", label: "Ton sport", required: true, options: [{ id: "foot", label: "Foot" }, { id: "basket", label: "Basket" }] },
    { id: "skills", type: "multiple_choice", scope: "shared", section: "s1", label: "Compétences", required: false, min_selected: 1, max_selected: 2, options: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }] },
    { id: "hours", type: "number", scope: "shared", section: "s1", label: "Heures", required: false, min: 0, max: 40, integer: true },
    { id: "start", type: "date", scope: "shared", section: "s1", label: "Début", required: false, min_date: "2026-09-01" },
    { id: "site", type: "url", scope: POS_B, label: "Portfolio", required: false },
    { id: "budget", type: "yes_no", scope: POS_A, label: "Un budget ?", required: true },
    { id: "cv", type: "cv", scope: "shared", section: "s1", label: "CV", required: true, file_types: ["pdf", "docx"], max_size_mb: 5 },
  ],
});

test("a valid form passes the same rules as the database", () => {
  assert.equal(formProblem(schema(), [POS_A, POS_B]), null);
  assert.equal(formProblem(EMPTY_FORM, []), null);
});

test("the validator refuses what the database refuses", () => {
  const s = schema();
  s.questions[0].onclick = "alert(1)";
  assert.match(formProblem(s, [POS_A, POS_B]), /réglage inconnu \(onclick\)/);
  const t = schema();
  t.questions[0].type = "script";
  assert.match(formProblem(t, [POS_A, POS_B]), /type inconnu/);
  assert.match(formProblem(schema(), [POS_A]), /poste qui n'existe plus/, "a question naming another campaign's position");
  const twoCvs = schema();
  twoCvs.questions.push({ ...twoCvs.questions[7], id: "cv2" });
  assert.match(formProblem(twoCvs, [POS_A, POS_B]), /Un seul CV/);
  const oneOption = schema();
  oneOption.questions[1].options = [{ id: "foot", label: "Foot" }];
  assert.match(formProblem(oneOption, [POS_A, POS_B]), /de 2 à 30 choix/);
  const dup = schema();
  dup.questions[1].id = "motivation";
  assert.match(formProblem(dup, [POS_A, POS_B]), /identifiant invalide/);
  assert.match(formProblem({ sections: [], questions: [] }, []), /au moins une partie/);
});

test("a candidate answers the shared questions and their position's only", () => {
  assert.deepEqual(questionsFor(schema(), POS_A).map((q) => q.id), ["motivation", "sport", "skills", "hours", "start", "budget", "cv"]);
});

test("answers are checked like the database does", () => {
  const s = schema();
  assert.deepEqual(answerErrors(s, POS_A, { motivation: "Ok", sport: "foot", budget: true }, { cv: 1 }, true), {});
  const errors = answerErrors(
    s,
    POS_A,
    { motivation: "x".repeat(51), sport: "tennis", skills: ["a", "b", "c"], hours: 4.5, start: "2026-02-30", budget: "oui" },
    {},
    true,
  );
  assert.deepEqual(errors, {
    motivation: "too_long",
    sport: "invalid_option",
    skills: "too_many",
    hours: "not_integer",
    start: "invalid_date",
    budget: "wrong_type",
    cv: "required",
  });
  assert.deepEqual(answerErrors(s, POS_A, { hours: 99, start: "2026-01-01" }, {}, false), { hours: "out_of_range", start: "out_of_range" });
  assert.deepEqual(answerErrors(s, POS_B, { site: "javascript:alert(1)" }, {}, false), { site: "invalid_url" });
  assert.deepEqual(answerErrors(s, POS_B, { site: "https://exemple.test/portfolio" }, {}, false), {});
  assert.deepEqual(answerErrors(s, POS_A, { skills: [] }, {}, false), {}, "while drafting, nothing is required yet");
  assert.deepEqual(answerErrors(s, POS_A, {}, { cv: 2 }, false), { cv: "too_many_files" });
});

test("answers read back in words", () => {
  const [, sport, skills, hours, start, , budget] = schema().questions;
  assert.equal(answerText(sport, "basket"), "Basket");
  assert.equal(answerText(skills, ["a", "c"]), "A, C");
  assert.equal(answerText(budget, false), "Non");
  assert.equal(answerText(hours, 12), "12");
  assert.equal(answerText(start, "2026-11-12"), "12 novembre 2026");
  assert.equal(answerText(sport, ""), "");
});

test("builder: stable ids, defaults, cleanup after a type change, moves", () => {
  assert.equal(idFrom("Ta motivation !", []), "ta_motivation");
  assert.equal(idFrom("Ta motivation", ["ta_motivation"]), "ta_motivation_2");
  assert.equal(idFrom("???", [], "q"), "q");
  const q = newQuestion("single_choice", EMPTY_FORM);
  assert.equal(q.options.length, 2);
  assert.equal(q.section, "s1");
  const cv = newQuestion("cv", EMPTY_FORM, POS_A);
  assert.deepEqual(cv.file_types, ["pdf", "docx"]);
  assert.equal(cv.section, undefined);
  const changed = cleanQuestion({ ...q, type: "short_text", label: "  Ton prénom ", section: "s1" });
  assert.equal(changed.options, undefined);
  assert.equal(changed.label, "Ton prénom");
  assert.equal(cleanQuestion({ ...cv, section: "s1" }).section, undefined, "a position question has no section");
  assert.deepEqual(move(["a", "b", "c"], 0, 1), ["b", "a", "c"]);
  assert.deepEqual(move(["a", "b", "c"], 0, -1), ["a", "b", "c"]);
});

// ---- Documents -------------------------------------------------------------------------------------

const bytes = (...parts) => {
  const out = [];
  for (const p of parts) for (const b of typeof p === "string" ? Buffer.from(p, "latin1") : p) out.push(b);
  return new Uint8Array(out);
};

test("documents are recognised from their bytes, not their name", () => {
  assert.equal(sniffDocument(bytes("%PDF-1.7\n%âãÏÓ")), "application/pdf");
  assert.equal(sniffDocument(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46])), "image/jpeg");
  assert.equal(sniffDocument(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), "image/png");
  const docx = bytes([0x50, 0x4b, 0x03, 0x04], "....[Content_Types].xml....word/document.xml....");
  assert.equal(sniffDocument(docx), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  assert.equal(sniffDocument(bytes([0x50, 0x4b, 0x03, 0x04], "[Content_Types].xml word/document.xml word/vbaProject.bin")), null, "macros");
  assert.equal(sniffDocument(bytes([0x50, 0x4b, 0x03, 0x04], "[Content_Types].xml word/document.xml word/embeddings/oleObject1.bin")), null);
  assert.equal(sniffDocument(bytes([0x50, 0x4b, 0x03, 0x04], "just_a_zip/file.txt.........")), null, "any zip is not a docx");
  assert.equal(sniffDocument(bytes("MZ\x90\x00\x03\x00\x00\x00")), null, "a renamed executable");
  assert.equal(sniffDocument(bytes("<html><script>")), null);
  assert.equal(sniffDocument(bytes("<svg xmlns")), null);
  assert.equal(sniffDocument(bytes("%PDF")), null, "too short");
});

test("document names and headers are safe", () => {
  assert.equal(safeFileName("../../etc/Mon CV.final.PDF", "application/pdf"), "Mon CV.final.pdf");
  assert.equal(safeFileName('a"b<c>\u0007.exe', "image/png"), "a b c.png");
  assert.equal(safeFileName("   ", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "document.docx");
  assert.equal(attachmentHeader("CV Léa.pdf"), `attachment; filename="CV Lea.pdf"; filename*=UTF-8''CV%20L%C3%A9a.pdf`);
  assert.equal(acceptFor(["pdf"]), ".pdf,application/pdf");
  assert.equal(formatsLine(["pdf", "docx"], 5), "PDF ou Word (.docx), 5 Mo au plus");
  assert.equal(sizeLabel(2_621_440), "2,5 Mo");
  assert.equal(sizeLabel(2048), "2 Ko");
});

// ---- Wizard input, desk, preview, messages -----------------------------------------------------------

test("the wizard turns Paris dates into instants and refuses what the database would", () => {
  const ok = parseCampaignStep(
    "regles",
    { opens_date: "2026-11-02", opens_time: "09:00", closes_date: "2026-11-20", closes_time: "23:59", max_applications: "2", eligibility: "years", eligible_years: ["3", "2", "2"] },
    NOW,
  );
  assert.ok(ok.ok);
  assert.equal(ok.patch.opens_at, "2026-11-02T08:00:00.000Z");
  assert.equal(ok.patch.closes_at, "2026-11-20T22:59:00.000Z");
  assert.deepEqual(ok.patch.eligible_years, [2, 3]);
  const bad = parseCampaignStep(
    "regles",
    { opens_date: "2026-11-25", opens_time: "10:00", closes_date: "2026-11-20", closes_time: "10:00", max_applications: "0", eligibility: "years" },
    NOW,
  );
  assert.ok(!bad.ok);
  assert.match(bad.errors.closes, /après l'ouverture/);
  assert.match(bad.errors.max_applications, /Entre 1 et 10/);
  assert.match(bad.errors.eligible_years, /Coche au moins une année/);
  const past = parseCampaignStep("regles", { opens_date: "2026-10-01", closes_date: "2026-10-20", max_applications: "1", eligibility: "all" }, NOW);
  assert.match(past.errors.closes, /à venir/);
  const kept = parseCampaignStep(
    "regles",
    { opens_date: "2026-10-01", closes_date: "2026-10-20", closes_was: "2026-10-20T21:59:00.000Z", max_applications: "1", eligibility: "all" },
    NOW,
  );
  assert.ok(kept.ok, "an unchanged past deadline is not re-checked");
  const spring = parseCampaignStep("regles", { opens_date: "2027-03-28", opens_time: "02:30", closes_date: "2027-04-10", max_applications: "1", eligibility: "all" }, NOW);
  assert.match(spring.errors.opens, /n'existe pas à Paris/);
});

test("the wizard keeps process steps and FAQ in order, plain text only", () => {
  const r = parseCampaignStep("deroule", {
    step_label: ["  Entretiens ", "", "Réponse"],
    step_detail: ["Au local", "", ""],
    step_date: ["2026-11-25", "", ""],
    faq_question: ["Faut-il de l'expérience ?"],
    faq_answer: ["Non.\r\n\r\nOn forme."],
    contact_name: "Julie (exemple)",
    contact_role: "",
    contact_email: "JULIE@exemple.test",
  });
  assert.ok(r.ok);
  assert.deepEqual(r.patch.process, [{ label: "Entretiens", detail: "Au local", date: "2026-11-25" }, { label: "Réponse" }]);
  assert.deepEqual(r.patch.faq, [{ question: "Faut-il de l'expérience ?", answer: "Non.\n\nOn forme." }]);
  assert.equal(r.patch.contact_email, "julie@exemple.test");
  assert.equal(r.patch.contact_role, null);
  const bad = parseCampaignStep("deroule", { faq_question: ["Sans réponse ?"], faq_answer: [""], contact_email: "pas-une-adresse" });
  assert.ok(bad.errors.faq_0 && bad.errors.contact_email);
  const title = parseCampaignStep("infos", { title: "ab", academic_year: "2026-2028" });
  assert.ok(title.errors.title && title.errors.academic_year);
});

test("a position cannot close after its campaign", () => {
  const campaign = { opensAt: "2026-11-01T08:00:00Z", closesAt: "2026-11-20T22:59:00Z" };
  const ok = parsePosition({ title: "Trésorerie", openings: "2", missions: "- Tenir la caisse\n- Budget", eligibility: "all" }, campaign);
  assert.ok(ok.ok);
  assert.equal(ok.patch.openings, 2);
  assert.equal(ok.patch.eligible_years, null);
  assert.equal(ok.patch.closes_at, null);
  const late = parsePosition({ title: "Trésorerie", closes_date: "2026-11-25", closes_time: "12:00", openings: "abc" }, campaign);
  assert.match(late.errors.closes, /après la date limite/);
  assert.match(late.errors.openings, /entre 1 et 99/);
});

test("desk: stages and the publication checklist", () => {
  assert.equal(campaignStage({ state: "open", hidden: { reason: "x" }, archived_at: null }), "masque");
  assert.equal(campaignStage({ state: "closed", hidden: null, archived_at: "2026-12-01T00:00:00Z" }), "archive");
  assert.equal(campaignStage({ state: "upcoming", hidden: null, archived_at: null }), "programme");
  const list = campaignChecklist(
    {
      title: "Recrutement 2027",
      summary: null,
      description: null,
      opens_at: "2026-11-01T08:00:00Z",
      closes_at: "2026-11-05T08:00:00Z",
      cover_media_id: null,
      contact_name: null,
      contact_email: null,
      process: [],
      positions: [{ retired_at: null, summary: null, missions: null }],
      form: { sections: [{ id: "s1", title: "x" }], questions: [] },
    },
    NOW,
  );
  const missing = list.filter((c) => c.required && !c.ok).map((c) => c.label);
  assert.deepEqual(missing, ["Une phrase de présentation", "Une date limite à venir"]);
  assert.match(recruitmentDoneMessage("annule-3"), /Les 3 personnes/);
  assert.match(recruitmentDoneMessage("version-2"), /Version 2 du formulaire/);
  assert.equal(recruitmentDoneMessage("<script>"), null);
});

test("preview: the state once online and what each position's form asks", () => {
  assert.equal(stateOnceOnline({ status: "scheduled", opens_at: "2026-11-12T00:00:00Z", closes_at: "2026-11-20T00:00:00Z" }, NOW), "upcoming");
  assert.equal(stateOnceOnline({ status: "scheduled", opens_at: "2026-11-01T00:00:00Z", closes_at: "2026-11-20T00:00:00Z" }, NOW), "open");
  assert.equal(stateOnceOnline({ status: "paused", opens_at: "2026-11-01T00:00:00Z", closes_at: "2026-11-20T00:00:00Z" }, NOW), "paused");
  assert.equal(stateOnceOnline({ status: "scheduled", opens_at: "2026-10-01T00:00:00Z", closes_at: "2026-11-01T00:00:00Z" }, NOW), "closed");
  const s = formSummary(schema(), POS_A);
  assert.equal(s.questions, 6);
  assert.equal(s.required, 3);
  assert.deepEqual(s.documents, [{ label: "CV", type: "cv", required: true, file_types: ["pdf", "docx"] }]);
  assert.equal(previewCampaign({ campaign: { opens_at: null, closes_at: null } }), null, "no dates, no preview");
});

test("application messages say what happened, never more", () => {
  const p = { title: "Recrutement 2027", slug: "recrutement-2027", position: "Trésorerie", organization: "Finance (exemple)", reference: "K7Q2M9XA" };
  const sent = applicationMessage("application_submitted", p);
  assert.match(sent.title, /Candidature envoyée : Trésorerie · Finance/);
  assert.match(sent.body, /référence K7Q2M9XA/);
  assert.match(sent.body, /ne veut pas dire acceptée/);
  assert.match(applicationMessage("recruitment_cancelled", { ...p, reason: "Report.", was: "submitted" }).body, /Raison donnée : Report\. Ta candidature reste lisible/);
  assert.ok(isApplicationMessage("application_withdrawn") && !isApplicationMessage("event_promoted"));
  const site = new URL("https://site.example.test");
  const mail = renderApplicationEmail({ kind: "application_submitted", payload: { ...p, title: "<b>x</b>" }, applicationId: null, name: "Tom Exemple", site });
  assert.ok(mail.html.includes("&lt;b&gt;") && !mail.html.includes("<b>x"));
  assert.ok(mail.html.includes("https://site.example.test/account/applications"));
  assert.ok(mail.html.includes("https://site.example.test/recruitment/recrutement-2027"));
  const cancelled = renderApplicationEmail({ kind: "recruitment_cancelled", payload: p, applicationId: null, name: null, site });
  assert.ok(!cancelled.html.includes("/recruitment/recrutement-2027"), "a cancelled campaign is not advertised");
  assert.ok(!renderApplicationEmail({ kind: "application_submitted", payload: { ...p, slug: "../evil" }, applicationId: null, name: null, site }).html.includes("evil"));
});
