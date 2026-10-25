import "server-only";
import { notifications, tasks, users } from "@/data/mock";

export async function getUser(id: string) {
  return users.find((u) => u.id === id) ?? null;
}

export async function getNotifications(userId: string) {
  return notifications
    .filter((n) => n.userId === userId)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/* ---- Management -------------------------------------------------------- */

export async function getTasks(associationId: string) {
  return tasks
    .filter((t) => t.associationId === associationId)
    .sort((a, b) => (a.priority === b.priority ? Date.parse(a.due ?? "9999") - Date.parse(b.due ?? "9999") : a.priority === "haute" ? -1 : 1));
}
