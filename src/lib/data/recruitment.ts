import "server-only";
import { campaigns } from "@/data/mock";
import type { CampaignItem, CampaignStatus, RecruitmentCampaign } from "@/lib/types";
import { associationRef } from "./associations";

const LAST_CHANCE_MS = 48 * 3_600_000;

/** Status always follows the clock, whatever was stored. */
export function liveCampaignStatus(c: Pick<RecruitmentCampaign, "opensAt" | "closesAt">, now = new Date()): CampaignStatus {
  const t = now.getTime();
  if (t < Date.parse(c.opensAt)) return "a-venir";
  const left = Date.parse(c.closesAt) - t;
  if (left <= 0) return "cloturee";
  return left <= LAST_CHANCE_MS ? "derniere-chance" : "ouverte";
}

function join(c: RecruitmentCampaign): CampaignItem {
  return {
    ...c,
    status: liveCampaignStatus(c),
    association: associationRef(c.associationId),
    seats: c.positions.reduce((n, p) => n + p.seats, 0),
  };
}

const ORDER: Record<CampaignStatus, number> = { "derniere-chance": 0, ouverte: 1, "a-venir": 2, cloturee: 3 };

export async function getCampaigns(
  query: { scope?: "open" | "all"; associationId?: string } = {},
): Promise<CampaignItem[]> {
  return campaigns
    .map(join)
    .filter((c) => query.scope !== "open" || c.status === "ouverte" || c.status === "derniere-chance")
    .filter((c) => !query.associationId || c.associationId === query.associationId)
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || Date.parse(a.closesAt) - Date.parse(b.closesAt));
}

export async function getCampaign(slug: string): Promise<CampaignItem | null> {
  const c = campaigns.find((x) => x.slug === slug);
  return c ? join(c) : null;
}

export async function getCampaignById(id: string): Promise<CampaignItem | null> {
  const c = campaigns.find((x) => x.id === id);
  return c ? join(c) : null;
}
