import "server-only";
import { applicants, applications, mediaAssets, notifications, tasks, users } from "@/data/mock";
import type { ApplicationItem, ApplicationSummary } from "@/lib/types";
import { getCampaignById } from "./recruitment";

export async function getUser(id: string) {
  return users.find((u) => u.id === id) ?? null;
}

async function joinApplication(a: ApplicationSummary): Promise<ApplicationItem | null> {
  const campaign = await getCampaignById(a.campaignId);
  const position = campaign?.positions.find((p) => p.id === a.positionId);
  return campaign && position ? { ...a, campaign, position } : null;
}

export async function getApplications(userId: string): Promise<ApplicationItem[]> {
  const mine = applications
    .filter((a) => a.userId === userId)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  const joined = await Promise.all(mine.map(joinApplication));
  return joined.filter((a): a is ApplicationItem => Boolean(a));
}

export async function getApplication(userId: string, id: string): Promise<ApplicationItem | null> {
  const a = applications.find((x) => x.id === id && x.userId === userId);
  return a ? joinApplication(a) : null;
}

export async function getNotifications(userId: string) {
  return notifications
    .filter((n) => n.userId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/* ---- Management -------------------------------------------------------- */

export async function getApplicants(query: { campaignId?: string; campaignIds?: string[] } = {}) {
  return applicants
    .filter((a) => !query.campaignId || a.campaignId === query.campaignId)
    .filter((a) => !query.campaignIds || query.campaignIds.includes(a.campaignId))
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt));
}

export async function getTasks(associationId: string) {
  return tasks
    .filter((t) => t.associationId === associationId)
    .sort((a, b) => (a.priority === b.priority ? Date.parse(a.due ?? "9999") - Date.parse(b.due ?? "9999") : a.priority === "haute" ? -1 : 1));
}

export async function getMedia(associationId: string) {
  return mediaAssets
    .filter((m) => m.associationId === associationId)
    .sort((a, b) => Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt));
}
