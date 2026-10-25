import Link from "next/link";
import type { PostEventOptions } from "@/lib/events/editor";
import { routes } from "@/lib/routes";
import { formatDayShort } from "@/lib/format";
import { setPostEvent } from "@/app/actions/events";
import { Field, Select } from "@/components/ui/Field";
import { ActionForm } from "@/components/manage/governance/ActionForm";

/**
 * "Cet article parle de…": the event an article points to. The article
 * keeps only the event's id; its page shows the event's date, place and
 * whether it is full or cancelled, always live (never copied into the text).
 * The association's own upcoming events (drafts included, so an article can
 * be prepared with its event) and the site's public upcoming events.
 * Changing it on an article that is online needs "Publier les articles".
 */
export function PostEventLink({ postId, data }: { postId: string; data: PostEventOptions }) {
  const current = data.current;
  const options = data.options.filter((o) => o.id !== current?.id);
  const label = (o: { title: string; starts_at: string | null; publication: string; organization: { name: string; short_name: string | null } }, own: boolean) =>
    `${o.title || "Sans titre"}${o.starts_at ? ` · ${formatDayShort(o.starts_at)}` : ""}${own ? "" : ` · ${o.organization.short_name ?? o.organization.name}`}${o.publication === "draft" ? " (brouillon)" : ""}`;
  const own = options.filter((o) => o.own);
  const others = options.filter((o) => !o.own);

  return (
    <div className="flex flex-col gap-3">
      {current ? (
        <p className="type-small">
          Relié à{" "}
          {current.is_public && current.slug ? (
            <Link href={routes.event(current.slug)} className="link font-bold">
              {current.title}
            </Link>
          ) : (
            <strong>{current.title}</strong>
          )}
          {current.status === "cancelled" ? " (annulé)" : current.is_public ? "" : " — pas encore en ligne : l'article ne l'affichera qu'une fois publié."}
        </p>
      ) : (
        <p className="type-small text-subtle">Aucun événement relié.</p>
      )}
      {data.can_change ? (
        <ActionForm action={setPostEvent} hidden={{ post_id: postId }} submitLabel="Enregistrer" variant="secondary" size="sm">
          <Field label="Événement" hint="Sa date, son lieu et ses places s'affichent sous l'article, toujours à jour.">
            {({ id, describedBy }) => (
              <Select id={id} aria-describedby={describedBy} name="event_id" defaultValue={current?.id ?? ""}>
                <option value="">Aucun</option>
                {current && <option value={current.id}>{current.title} (actuel)</option>}
                {own.length > 0 && (
                  <optgroup label="Les événements de l'asso">
                    {own.map((o) => (
                      <option key={o.id} value={o.id}>
                        {label(o, true)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {others.length > 0 && (
                  <optgroup label="Les autres événements du site">
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
        <p className="type-small text-subtle">Changer l&apos;événement d&apos;un article en ligne demande le droit «&nbsp;Publier les articles&nbsp;».</p>
      )}
    </div>
  );
}
