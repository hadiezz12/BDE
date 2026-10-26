// Unit tests for the review workspace's app-side rules (Phase 9): the
// transparent score arithmetic, the grid checks that mirror the database,
// the allowlisted message placeholders, the spreadsheet-safe export, the
// words of the team's list and history, what a candidate is told, and the
// messages (team links only into the workspace, never internal data to the
// candidate). Run with `npm run test:unit`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_LABEL,
  ROLE_PRESETS,
  activityLine,
  applicationsCsv,
  criterionId,
  exportFileName,
  percentLabel,
  renderTemplate,
  reviewProgress,
  reviewTotal,
  rubricProblem,
  teamState,
  totalBasis,
  unknownPlaceholders,
} from "./review.ts";
import { CANDIDATE_STAGE, slotsByDay } from "./candidate.ts";
import { applicationMessage, isTeamMessage, renderApplicationEmail, teamLink } from "./messages.ts";

const grid = [
  { id: "motivation", label: "Motivation", description: null, max: 5, weight: 2, required: true },
  { id: "experience", label: "Expérience", description: null, max: 10, weight: 1, required: false },
];

test("a total is the weighted sum over what was scored, with its basis", () => {
  assert.equal(reviewTotal(grid, {}), null);
  const one = reviewTotal(grid, { motivation: 4 });
  assert.deepEqual(one, { points: 8, out_of: 10, percent: 80, scored: 1 });
  const both = reviewTotal(grid, { motivation: 4, experience: 5 });
  assert.deepEqual(both, { points: 13, out_of: 20, percent: 65, scored: 2 });
  // A score for a criterion that is not in the grid counts for nothing.
  assert.deepEqual(reviewTotal(grid, { motivation: 4, ghost: 9 }), one);
  assert.match(totalBasis(both), /13 points pondérés sur 20 possibles \(2 critères notés\) : 65 %/);
  assert.equal(totalBasis(null), "Aucun critère noté.");
  assert.equal(percentLabel(null), "—");
  assert.equal(percentLabel(86.7), "86,7 %");
});

test("grids: the same limits as the database, stable ids", () => {
  assert.equal(rubricProblem(grid), null);
  assert.match(rubricProblem([{ ...grid[0], label: "x" }]), /2 à 80 caractères/);
  assert.match(rubricProblem([{ ...grid[0], max: 11 }]), /entre 2 et 10/);
  assert.match(rubricProblem([{ ...grid[0], weight: 0 }]), /poids/);
  assert.match(rubricProblem([grid[0], { ...grid[1], id: "motivation" }]), /même identifiant/);
  assert.match(rubricProblem(Array.from({ length: 13 }, (_, i) => ({ ...grid[0], id: `c${i}` }))), /12 critères/);
  assert.equal(criterionId("Expérience utile", []), "experience_utile");
  assert.equal(criterionId("Motivation", ["motivation"]), "motivation_2");
  assert.equal(criterionId("!!!", []), "critere");
  // Role presets are starting points; every one reads (the database requires "view").
  for (const r of Object.values(ROLE_PRESETS)) assert.ok(r.powers.includes("view"));
});

test("templates: only the allowlisted words, replaced as text", () => {
  assert.deepEqual(unknownPlaceholders("Bonjour {prenom}, {poste} chez {association}"), []);
  assert.deepEqual(unknownPlaceholders("{prenom} {email} {note} {email}"), ["email", "note"]);
  assert.deepEqual(unknownPlaceholders("{constructor}"), ["constructor"]);
  assert.equal(renderTemplate("Bonjour {prenom} ({reference})", { prenom: "<b>A</b>", reference: "K7" }), "Bonjour <b>A</b> (K7)");
  assert.equal(renderTemplate("{unknown} reste", { prenom: "A" }), "{unknown} reste");
});

test("the export is spreadsheet-safe and holds essential fields only", () => {
  const csv = applicationsCsv([
    {
      reference: "K7Q2M9XA",
      last_name: "=HYPERLINK(\"http://x\")",
      first_name: "+33 6",
      program: "@SUM(A1)",
      study_year: "2",
      position: "-Trésorerie",
      submitted_at: "2026-10-01T10:00:00Z",
      status: "submitted",
      stage: "shortlisted",
      reviews: 2,
      average: 72.5,
      decision: "finalized:offer",
      offer: null,
    },
  ]);
  assert.ok(csv.startsWith("﻿"));
  const row = csv.split("\r\n")[1];
  assert.ok(row.includes("'=HYPERLINK"), "formula neutralised");
  assert.ok(row.includes("'+33 6") && row.includes("'@SUM") && row.includes("'-Trésorerie"));
  assert.ok(row.includes("Présélectionnée") && row.includes("72,5") && row.includes("Validée, pas encore annoncée · Retenue"));
  const header = csv.split("\r\n")[0];
  assert.ok(!/mail|note|commentaire|réponse/i.test(header), "no e-mail, note or answer column");
  assert.equal(exportFileName("Recrutement 2027 (exemple)", new Date("2026-10-26T12:00:00Z")), "candidatures-recrutement-2027-exemple-2026-10-26.csv");
});

test("the team's words for a row and its history", () => {
  assert.equal(teamState({ status: "withdrawn", stage: "new", decision: null }), "Retirée par la personne");
  assert.equal(teamState({ status: "submitted", stage: "shortlisted", decision: null }), "Présélectionnée");
  assert.equal(teamState({ status: "submitted", stage: "new", decision: { id: "d", status: "proposed", outcome: "reject" } }), "Décision proposée · Non retenue");
  assert.equal(teamState({ status: "submitted", stage: "new", decision: { id: "d", status: "released", outcome: "offer" } }), "Annoncée · Retenue");
  assert.equal(reviewProgress(1, 2), "1/2 évaluations");
  assert.equal(reviewProgress(2, 2), "Évaluations complètes (2/2)");
  assert.equal(reviewProgress(0, 0), "Aucune évaluation demandée");
  assert.equal(activityLine({ action: "stage_changed", details: { to: "shortlisted" } }), "Étape changée : Présélectionnée");
  assert.equal(activityLine({ action: "decision_proposed", details: { outcome: "waitlist" } }), "Décision proposée : Liste d'attente");
  // Without the decision powers the database strips the outcome: the line stays neutral.
  assert.equal(activityLine({ action: "decision_proposed", details: {} }), "Décision proposée");
  assert.equal(activityLine({ action: "something_new", details: {} }), "something new");
  assert.ok(Object.keys(ACTIVITY_LABEL).length >= 30);
});

test("a candidate is told where it stands, never the team's pipeline", () => {
  for (const [key, s] of Object.entries(CANDIDATE_STAGE)) {
    assert.ok(s.label.length > 0, key);
    assert.ok(!/présélection|score|note|évaluat/i.test(s.label), `${key} says nothing internal`);
  }
  const days = slotsByDay([
    { id: "b", starts_at: "2026-11-03T15:00:00Z", ends_at: "2026-11-03T15:30:00Z", mode: "online", location: null },
    { id: "a", starts_at: "2026-11-03T09:00:00Z", ends_at: "2026-11-03T09:30:00Z", mode: "in_person", location: "Salle (exemple)" },
    { id: "c", starts_at: "2026-11-04T09:00:00Z", ends_at: "2026-11-04T09:30:00Z", mode: "phone", location: null },
  ]);
  assert.equal(days.length, 2);
  assert.deepEqual(days[0].slots.map((s) => s.id), ["a", "b"]);
  assert.match(days[0].day, /mardi 3 novembre/);
});

test("messages: the candidate gets the association's words, the team a workspace link", () => {
  const p = { title: "Recrutement 2027", position: "Trésorerie", organization: "Finance (exemple)", reference: "K7Q2M9XA" };
  const offer = applicationMessage("recruitment_offer", { ...p, message: "Bienvenue", expires_at: "2026-11-10T17:00:00Z" });
  assert.match(offer.body, /Bienvenue/);
  const rejected = applicationMessage("recruitment_rejected", p);
  assert.ok(!/score|note|évaluat|comité/i.test(rejected.body), "no internal reason");
  assert.ok(isTeamMessage("recruitment_review_assigned") && !isTeamMessage("recruitment_offer"));
  const link = "/manage/finance-exemple/recruitment/0d000000-0000-4000-8000-000000000001/candidatures/0d000000-0000-4000-8000-000000000002";
  assert.equal(teamLink({ link }), link);
  assert.equal(teamLink({ link: "/manage/evaluations" }), "/manage/evaluations");
  assert.equal(teamLink({ link: "https://evil.example.test/manage/evaluations" }), null);
  assert.equal(teamLink({ link: "/manage/x/recruitment/../../admin" }), null);
  const site = new URL("https://site.example.test");
  const mail = renderApplicationEmail({ kind: "recruitment_review_assigned", payload: { ...p, link }, applicationId: null, name: null, site });
  assert.ok(mail.html.includes(`https://site.example.test${link}`));
  assert.ok(!mail.html.includes("/account/applications"), "a team message never points to a candidate's page");
});
