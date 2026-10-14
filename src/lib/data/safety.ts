import "server-only";
import { safetyContacts, safetyHotlines, safetyPractices } from "@/data/mock/safety";
import type { SafetyContact, SafetyHotline, SafetyPractice } from "@/lib/types";

/**
 * Everything the VSS / VDH page lists. National numbers are fixed facts;
 * campus contacts and event practices become BDE-editable content later.
 */
export interface SafetyDirectory {
  /** 17, 112, 114: danger right now. */
  emergency: SafetyHotline[];
  /** 3919, the government site: to talk or get informed, any time. */
  listening: SafetyHotline[];
  contacts: SafetyContact[];
  practices: SafetyPractice[];
}

export async function getSafetyDirectory(): Promise<SafetyDirectory> {
  return {
    emergency: safetyHotlines.filter((h) => h.kind === "urgence"),
    listening: safetyHotlines.filter((h) => h.kind === "ecoute"),
    contacts: safetyContacts,
    practices: safetyPractices,
  };
}
