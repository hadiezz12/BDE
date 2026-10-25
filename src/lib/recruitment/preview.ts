/**
 * A campaign as its team previews it: the editor's rows shaped like the
 * public card (CampaignCardPayload), with the state it will have once
 * published (a draft shows "open" or "opening later" from its dates), and
 * what each position's form asks, from the draft form when there is one.
 * Pure module: the unit tests load it with plain Node.
 */

import type { CampaignItem } from "../types";
import type { RecruitmentEditor } from "./editor.ts";
import { toCampaignItem, type CampaignCardPayload, type CampaignState, type FormSummaryPayload } from "./model.ts";
import { EMPTY_FORM, isDocumentQuestion, questionsFor, type FormSchema } from "./form.ts";

/** The state the campaign would have online, now. */
export function stateOnceOnline(c: Pick<RecruitmentEditor["campaign"], "status" | "opens_at" | "closes_at">, now = new Date()): CampaignState {
  if (c.status === "cancelled") return "cancelled";
  if (c.status === "closed" || (c.closes_at && Date.parse(c.closes_at) <= now.getTime())) return "closed";
  if (c.status === "paused") return "paused";
  if (c.opens_at && now.getTime() < Date.parse(c.opens_at)) return "upcoming";
  return "open";
}

/** What the form asks one position's candidates (private.form_summary). */
export function formSummary(schema: FormSchema, positionId: string): FormSummaryPayload {
  const qs = questionsFor(schema, positionId);
  const asked = qs.filter((q) => !isDocumentQuestion(q));
  return {
    questions: asked.length,
    required: asked.filter((q) => q.required).length,
    documents: qs
      .filter(isDocumentQuestion)
      .map((q) => ({ label: q.label, type: q.type as "file" | "cv", required: q.required, file_types: q.file_types ?? [] })),
  };
}

export function previewCampaign(e: RecruitmentEditor, now = new Date()): CampaignItem | null {
  const c = e.campaign;
  if (!c.opens_at || !c.closes_at) return null;
  const schema = e.form.draft?.schema ?? e.form.live?.schema ?? EMPTY_FORM;
  const state = stateOnceOnline(c, now);
  const media = e.media.find((m) => m.id === c.cover_media_id);
  const payload: CampaignCardPayload = {
    id: c.id,
    slug: c.slug ?? "apercu",
    title: c.title,
    summary: c.summary,
    academic_year: c.academic_year,
    cover: media ? { id: media.id, path: media.path, width: media.width ?? 1200, height: media.height ?? 800, alt: media.alt } : null,
    organization: e.organization,
    opens_at: c.opens_at,
    closes_at: c.closes_at,
    timezone: c.timezone,
    state,
    paused_at: c.paused_at,
    cancelled_at: c.cancelled_at,
    cancellation_reason: c.cancellation_reason,
    max_applications: c.max_applications,
    eligible_years: c.eligible_years,
    eligibility_note: c.eligibility_note,
    archived: Boolean(c.archived_at),
    first_published_at: c.first_published_at,
    updated_at: c.updated_at,
    description: c.description,
    process: c.process,
    faq: c.faq,
    contact: { name: c.contact_name, role: c.contact_role, email: c.contact_email },
    positions: e.positions
      .filter((p) => !p.retired_at)
      .map((p) => {
        const closes = p.closes ?? c.closes_at;
        return {
          id: p.id,
          slug: p.slug,
          title: p.title,
          team: p.team,
          summary: p.summary,
          openings: p.openings,
          closes_at: closes,
          closes_early: Boolean(p.closes_at && c.closes_at && Date.parse(p.closes_at) < Date.parse(c.closes_at)),
          eligible_years: p.eligible_years ?? c.eligible_years,
          accepting: state === "open" && Boolean(closes) && now.getTime() < Date.parse(closes!),
          retired: false,
          description: p.description,
          missions: p.missions,
          expectations: p.expectations,
          commitment: p.commitment,
          form: formSummary(schema, p.id),
        };
      }),
  };
  return toCampaignItem(payload, { preview: true, now });
}
