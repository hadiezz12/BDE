import type { Applicant, ApplicationSummary } from "@/lib/types";

/** A student's own applications (student space). None: the demo accounts start empty. */
export const applications: ApplicationSummary[] = [];

/** Applications as a bureau sees them (/manage). None: there is no campaign yet. */
export const applicants: Applicant[] = [];
