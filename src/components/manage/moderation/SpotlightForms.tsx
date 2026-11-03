import { setAssociationProminence, setCampaignProminence } from "@/app/actions/spotlights";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { UntilField } from "./ProminenceForms";

/**
 * The campus front page's spotlights (platform.content.feature, second
 * factor): a recruitment "à la une" (three at most), the association "à
 * l'honneur" (one). The database checks the right, the limits, that the
 * recruitment is open or about to open and that the page is public; a
 * close, a pause or a moderation takes it off the front page by itself.
 */

export function FeatureCampaignForm({ campaignId }: { campaignId: string }) {
  return (
    <Disclosure summary="Mettre à la une" icon="plus" tone="primary">
      <ActionForm action={setCampaignProminence} hidden={{ campaign_id: campaignId, prominence: "featured" }} submitLabel="Mettre à la une">
        <p className="type-small text-muted">
          En tête de «&nbsp;Ça recrute&nbsp;» sur la page d&apos;accueil, marqué «&nbsp;À la une du BDE&nbsp;». Il en sort
          seul à la clôture.
        </p>
        <UntilField />
      </ActionForm>
    </Disclosure>
  );
}

export function ClearCampaignForm({ campaignId }: { campaignId: string }) {
  return (
    <ActionForm
      action={setCampaignProminence}
      hidden={{ campaign_id: campaignId, prominence: "normal" }}
      submitLabel="Retirer de la une"
      submitIcon="minus"
      variant="secondary"
      size="sm"
      inline
    />
  );
}

export function FeatureAssociationForm({ organizationId }: { organizationId: string }) {
  return (
    <Disclosure summary="Mettre à l'honneur" icon="plus" tone="primary">
      <ActionForm
        action={setAssociationProminence}
        hidden={{ organization_id: organizationId, prominence: "featured" }}
        submitLabel="Mettre à l'honneur"
      >
        <p className="type-small text-muted">
          En premier dans «&nbsp;Trouve ta bande&nbsp;» sur la page d&apos;accueil, avec l&apos;étiquette
          «&nbsp;À l&apos;honneur&nbsp;». Une seule asso à la fois.
        </p>
        <UntilField />
      </ActionForm>
    </Disclosure>
  );
}

export function ClearAssociationForm({ organizationId }: { organizationId: string }) {
  return (
    <ActionForm
      action={setAssociationProminence}
      hidden={{ organization_id: organizationId, prominence: "normal" }}
      submitLabel="Ne plus mettre à l'honneur"
      submitIcon="minus"
      variant="secondary"
      size="sm"
      inline
    />
  );
}
