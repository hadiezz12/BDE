import "server-only";
import { applicationForms } from "@/data/mock/recruitment-forms";
import type { ApplicationFormSpec } from "@/lib/types";

/**
 * Application form of a campaign (questions + files asked beyond the role
 * choice). A campaign without a configured form still gets the minimum every
 * association asks for: a few lines of motivation.
 */
export async function getApplicationForm(campaignId: string): Promise<ApplicationFormSpec> {
  return (
    applicationForms.find((f) => f.campaignId === campaignId) ?? {
      campaignId,
      questions: [{ id: "motivation", label: "Quelques lignes de motivation", kind: "long", maxLength: 1000 }],
      attachments: [],
    }
  );
}
