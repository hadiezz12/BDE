import type { ReportReason } from "@/lib/posts/editor";

/**
 * Why a student reports an article, in the order the form offers them. The
 * keys are exactly the ones report_post accepts; the wording is the
 * student's (the moderation screens may reuse it).
 */
export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: "harassment", label: "Harcèlement" },
  { value: "discrimination", label: "Contenu discriminatoire" },
  { value: "misleading", label: "Information trompeuse ou dangereuse" },
  { value: "privacy", label: "Vie privée" },
  { value: "image_rights", label: "Image d'une personne sans son accord" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Autre" },
];

/** Longest "précisions" the database keeps. */
export const REPORT_DETAILS_MAX = 500;
