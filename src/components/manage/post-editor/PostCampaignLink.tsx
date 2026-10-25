import Link from "next/link";
import type { PostCampaignOptions } from "@/lib/recruitment/editor";
import { routes } from "@/lib/routes";
import { setPostCampaign } from "@/app/actions/recruitment";
import { Field, Select } from "@/components/ui/Field";
import { ActionForm } from "@/components/manage/governance/ActionForm";

const STATE_WORD: Record<string, string> = {
  draft: "brouillon",
  unpublished: "retiré du site",
  cancelled: "annulé",
  closed: "clôturé",
  paused: "en pause",
  upcoming: "bientôt",
  open: "ouvert",
};

/**
 * "Cet article parle de…" for recruitment: the campaign an article points to
 * ("Finance recrute !"). The article keeps only the campaign's id; its page
 * shows the campaign's state, deadline and positions, always live (never
 * copied into the text). The association's own campaigns (drafts included,
 * so an article can be prepared with its campaign) and the site's current
 * public campaigns. Changing it on an article that is online needs
 * "Publier les articles".
 */
export function PostCampaignLink({ postId, data }: { postId: string; data: PostCampaignOptions }) {
  const current = data.current;
  const options = data.options.filter((o) => o.id !== current?.id);
  const own = options.filter((o) => o.own);
  const others = options.filter((o) => !o.own);
  const label = (o: PostCampaignOptions["options"][number], mine: boolean) =>
    `${o.title || "Sans titre"} · ${STATE_WORD[o.state] ?? o.state}${mine ? "" : ` · ${o.organization.short_name ?? o.organization.name}`}`;

  return (
    <div className="flex flex-col gap-3">
      {current ? (
        <p className="type-small">
          Relié à{" "}
          {current.is_public && current.slug ? (
            <Link href={routes.campaign(current.slug)} className="link font-bold">
              {current.title}
            </Link>
          ) : (
            <strong>{current.title}</strong>
          )}
          {current.is_public ? "" : " — pas en ligne : l'article ne l'affichera qu'une fois publié."}
        </p>
      ) : (
        <p className="type-small text-subtle">Aucun recrutement relié.</p>
      )}
      {data.can_change ? (
        <ActionForm action={setPostCampaign} hidden={{ post_id: postId }} submitLabel="Enregistrer" variant="secondary" size="sm">
          <Field label="Recrutement" hint="Ses postes, son état et sa date limite s'affichent sous l'article, toujours à jour.">
            {({ id, describedBy }) => (
              <Select id={id} aria-describedby={describedBy} name="campaign_id" defaultValue={current?.id ?? ""}>
                <option value="">Aucun</option>
                {current && <option value={current.id}>{current.title} (actuel)</option>}
                {own.length > 0 && (
                  <optgroup label="Les recrutements de l'asso">
                    {own.map((o) => (
                      <option key={o.id} value={o.id}>
                        {label(o, true)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {others.length > 0 && (
                  <optgroup label="Les autres recrutements du site">
                    {others.map((o) => (
                      <option key={o.id} value={o.id}>
                        {label(o, false)}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
            )}
          </Field>
        </ActionForm>
      ) : (
        <p className="type-small text-subtle">Changer le recrutement d&apos;un article en ligne demande le droit «&nbsp;Publier les articles&nbsp;».</p>
      )}
    </div>
  );
}
