// Unit tests for the data error boundary. Run with `npm run test:unit`
// (Node's built-in runner; Node strips the TypeScript types of errors.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DataError, toDataError } from "./errors.ts";

test("maps database codes to the kinds the interface understands", () => {
  const cases = [
    ["23505", "conflict"],
    ["23503", "invalid"],
    ["23514", "invalid"],
    ["22P02", "invalid"],
    ["42501", "forbidden"],
    ["PGRST301", "forbidden"],
    ["PGRST116", "not_found"],
    ["08006", "unavailable"],
    ["XX000", "unexpected"],
  ];
  for (const [code, kind] of cases) {
    assert.equal(toDataError({ code, message: "irrelevant" }).kind, kind, code);
  }
});

test("never puts the Postgres message in front of the user", () => {
  const error = toDataError({
    code: "23505",
    message: 'duplicate key value violates unique constraint "memberships_user_id_organization_id_key"',
  });
  assert.ok(error instanceof DataError);
  assert.equal(error.userMessage, "Cet élément existe déjà.");
  assert.doesNotMatch(error.userMessage, /constraint|duplicate|memberships/);
  assert.doesNotMatch(error.message, /constraint|memberships/);
});

test("lets a loader give its own words for a kind", () => {
  const error = toDataError(
    { code: "23505", message: "x" },
    { conflict: "Tu es déjà membre de cette association." },
  );
  assert.equal(error.userMessage, "Tu es déjà membre de cette association.");
});

test("treats a network failure without a code as unavailable", () => {
  assert.equal(toDataError({ code: "", message: "TypeError: fetch failed" }).kind, "unavailable");
  assert.equal(toDataError(null).kind, "unexpected");
});
