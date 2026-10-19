import "server-only";
import { cache } from "react";
import { DataError, logDataError } from "@/lib/data/errors";
import { getMyAccess } from "./access";
import { manageEntries, type ManageEntry } from "./workspace";

/**
 * The "Gérer…" links of the site header and account menu. A failure here
 * must not take the public site down: the links are left out and the
 * workspace pages show their own error.
 */
export const getManageEntries = cache(async (): Promise<ManageEntry[]> => {
  try {
    return manageEntries(await getMyAccess());
  } catch (error) {
    // Only a database failure is absorbed; anything else (including Next's
    // own "this page is dynamic" signal) must keep propagating.
    if (!(error instanceof DataError)) throw error;
    logDataError("manage_entries", error);
    return [];
  }
});
