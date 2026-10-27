import "server-only";
import { tasks, users } from "@/data/mock";

export async function getUser(id: string) {
  return users.find((u) => u.id === id) ?? null;
}

/* ---- Management -------------------------------------------------------- */

export async function getTasks(associationId: string) {
  return tasks
    .filter((t) => t.associationId === associationId)
    .sort((a, b) => (a.priority === b.priority ? Date.parse(a.due ?? "9999") - Date.parse(b.due ?? "9999") : a.priority === "haute" ? -1 : 1));
}
