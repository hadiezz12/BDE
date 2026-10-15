import "server-only";
import {
  safetyAlertKinds,
  safetyCommitments,
  safetyContacts,
  safetyHotlines,
  safetyPractices,
} from "@/data/mock/safety";
import type { SafetyAlertKind, SafetyCommitment, SafetyContact, SafetyHotline, SafetyPractice } from "@/lib/types";

/**
 * Everything the VSS / VDH page lists. National numbers are fixed facts; the
 * BDE's commitments and alert categories are its own words. Campus contacts
 * and event practices become BDE-editable content later (none in Phase 1).
 */
export interface SafetyDirectory {
  /** 17, 112, 114: danger right now. */
  emergency: SafetyHotline[];
  /** 3919, the government site: to talk or get informed, any time. */
  listening: SafetyHotline[];
  /** Confirmed campus contacts. Empty in Phase 1: none is known. */
  contacts: SafetyContact[];
  /** Extra event practices. Empty in Phase 1: the commitments say it all. */
  practices: SafetyPractice[];
  /** "Ce à quoi nous nous tenons": the six commitments, 01 → 06. */
  commitments: SafetyCommitment[];
  /** "Nature de l'alerte" choices of the confidential alert form. */
  alertKinds: SafetyAlertKind[];
}

export async function getSafetyDirectory(): Promise<SafetyDirectory> {
  return {
    emergency: safetyHotlines.filter((h) => h.kind === "urgence"),
    listening: safetyHotlines.filter((h) => h.kind === "ecoute"),
    contacts: safetyContacts,
    practices: safetyPractices,
    commitments: safetyCommitments,
    alertKinds: safetyAlertKinds,
  };
}
