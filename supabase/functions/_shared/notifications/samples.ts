/**
 * Fictional values for the template preview (monitoring page): obviously
 * fake names, no real association, person, place or date. Never sent.
 */

import type { Payload } from "./catalog.ts";

export const SAMPLE_NAME = "Compte démo";
/** A token of the right shape that unsubscribes nobody. */
export const SAMPLE_UNSUBSCRIBE = "0".repeat(64);

export function samplePayload(kind: string, now = Date.now()): Payload {
  const day = 24 * 3600 * 1000;
  const at = (days: number) => new Date(now + days * day).toISOString();
  const base: Payload = {
    title: "Soirée test (exemple)",
    slug: "soiree-test-exemple",
    organization: "Asso test (exemple)",
    organization_slug: "asso-test-exemple",
    starts_at: at(3),
    ends_at: at(3.1),
    previous_starts_at: at(2),
    venue: "Salle test (exemple)",
    city: "Ville test",
    location_type: "in_person",
    dates_changed: true,
    place_changed: false,
    position: "Poste test (exemple)",
    reference: "EX-0000",
    closes_at: at(10),
    respond_by: at(5),
    due_at: at(4),
    expires_at: at(7),
    mode: "in_person",
    location: "Salle test (exemple)",
    message: "Message d'exemple écrit par l'équipe.",
    by_name: SAMPLE_NAME,
    person: SAMPLE_NAME,
    change: "granted",
    answer: "accepted",
    decision: "approved",
    role: "guardian",
    kind: "association_succession",
    office: "association_president",
    status: "cancelled",
    member: true,
    hidden: true,
    days: 7,
    body: "Texte d'exemple : ici, le message tel que l'asso ou le BDE l'a écrit.",
    link: "/associations/asso-test-exemple",
  };
  if (kind === "campus_announcement") return { ...base, title: "Annonce test (exemple)" };
  if (kind === "association_message" || kind === "followed_announcement") return { ...base, title: "Message test (exemple)" };
  if (kind.startsWith("content_") || kind === "followed_post_published") return { ...base, title: "Article test (exemple)" };
  if (kind === "followed_recruitment_opened" || kind.startsWith("application_") || kind.startsWith("recruitment_")) {
    return { ...base, title: "Recrutement test (exemple)", slug: "recrutement-test-exemple" };
  }
  return base;
}
