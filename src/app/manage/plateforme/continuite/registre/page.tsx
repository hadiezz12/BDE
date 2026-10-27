import type { Metadata } from "next";
import { getAuthContext } from "@/lib/auth/context";
import { formatDateLong } from "@/lib/format";
import { getMyAccess, hasPlatform } from "@/lib/governance/access";
import { toDateInput } from "@/lib/governance/labels";
import { getPlatformOperations, type RegisterRow } from "@/lib/continuity/data";
import { BACKUP_KIND, ENVIRONMENT, RECORD_AREA, RECORD_HINT, RECORD_STATUS, RECORD_WORDS } from "@/lib/continuity/labels";
import { recordBackup, saveRecord } from "@/app/actions/continuity";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ManagePageHeader, ManageSection } from "@/components/manage/ManagePageHeader";
import { ActionForm } from "@/components/manage/governance/ActionForm";
import { Disclosure } from "@/components/manage/governance/Disclosure";
import { MfaNotice, Notice } from "@/components/manage/governance/Notices";
import { PlatformDenied } from "@/components/manage/moderation/PlatformDenied";
import { BackupList, when } from "@/components/continuity/ContinuityBlocks";

export const metadata: Metadata = { title: "Registre et sauvegardes" };

function RecordForm({ record }: { record: RegisterRow }) {
  return (
    <ActionForm action={saveRecord} hidden={{ key: record.key }} submitLabel="Enregistrer">
      <p className="type-small text-muted">{RECORD_HINT[record.key]}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Service" optional>
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="provider" maxLength={120} defaultValue={record.provider ?? undefined} />}
        </Field>
        <Field label="Qui détient le compte" optional hint="Un rôle ou un service, ex : Service vie étudiante de l'école">
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="owner" maxLength={200} defaultValue={record.owner ?? undefined} />}
        </Field>
        <Field label="Comment le joindre" optional hint="De préférence une adresse de service, pas une adresse personnelle.">
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="contact" maxLength={200} defaultValue={record.contact ?? undefined} />}
        </Field>
        <Field label="Prochain renouvellement" optional>
          {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="renewal_on" defaultValue={record.renewal_on ?? undefined} />}
        </Field>
        <Field label="État">
          {({ id, describedBy }) => (
            <Select id={id} aria-describedby={describedBy} name="status" defaultValue={record.status}>
              <option value="verified">Vérifié aujourd&apos;hui par moi</option>
              <option value="needs_review">À revoir</option>
              <option value="not_configured">Non renseigné</option>
            </Select>
          )}
        </Field>
      </div>
      <Field label="Notes" optional>
        {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="notes" maxLength={1000} className="min-h-16" defaultValue={record.notes ?? undefined} />}
      </Field>
    </ActionForm>
  );
}

/**
 * /manage/plateforme/continuite/registre — who owns what outside the site
 * (database, code, hosting, domain, e-mails, billing, contacts), and the
 * backups and restores as people verified them. The site cannot see a
 * provider's console: everything here is a dated, signed declaration.
 * Never a password, a key, a token or a card number (the database refuses
 * text that looks like one).
 */
export default async function RegisterPage() {
  const [access, ctx] = await Promise.all([getMyAccess(), getAuthContext()]);
  if (!hasPlatform(access, "platform.operations.monitor")) {
    return <PlatformDenied title="Registre et sauvegardes" right="Suivre la continuité du site" />;
  }
  const aal2 = ctx.status === "authenticated" && ctx.aal === "aal2";
  const ops = await getPlatformOperations();
  if (!ops) return <Notice tone="danger" icon="alert" title="Le registre n'a pas pu être chargé." />;
  const areas = [...new Set(ops.register.map((r) => r.area))];

  return (
    <div className="flex flex-col gap-12">
      <ManagePageHeader
        kicker="Continuité"
        title="Registre et sauvegardes"
        description={
          <p>
            Les comptes qui font tourner le site ne dépendent pas des postes du BDE&nbsp;: ce registre dit qui les détient, qui paie et
            quand ça se renouvelle, pour qu&apos;aucun compte ne parte avec une promotion diplômée. On n&apos;y écrit jamais de mot de passe,
            de clé ni de numéro de carte.
          </p>
        }
      />
      {!aal2 && <MfaNotice what="modifier le registre ou déclarer une vérification" />}

      <ManageSection title="Registre des comptes techniques">
        <div className="flex flex-col gap-8">
          {areas.map((area) => (
            <div key={area} className="flex flex-col gap-3">
              <h3 className="type-label text-muted">{RECORD_AREA[area] ?? area}</h3>
              <ul className="flex flex-col gap-3">
                {ops.register
                  .filter((r) => r.area === area)
                  .map((r) => {
                    const status = RECORD_STATUS[r.status] ?? RECORD_STATUS.not_configured;
                    return (
                      <li key={r.key} className="flex flex-col gap-2 rounded-md border border-line bg-raised px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold">{RECORD_WORDS[r.key] ?? r.key}</span>
                          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                        </div>
                        <dl className="grid gap-x-4 gap-y-1 type-small sm:grid-cols-[11rem_minmax(0,1fr)]">
                          <dt className="text-muted">Service</dt>
                          <dd>{r.provider ?? "—"}</dd>
                          <dt className="text-muted">Détenu par</dt>
                          <dd>{r.owner ?? "—"}</dd>
                          <dt className="text-muted">Contact</dt>
                          <dd className="break-words">{r.contact ?? "—"}</dd>
                          {r.renewal_on && (
                            <>
                              <dt className="text-muted">Renouvellement</dt>
                              <dd>{formatDateLong(r.renewal_on)}</dd>
                            </>
                          )}
                          {r.notes && (
                            <>
                              <dt className="text-muted">Notes</dt>
                              <dd className="whitespace-pre-line">{r.notes}</dd>
                            </>
                          )}
                          {r.verified_at && (
                            <>
                              <dt className="text-muted">Vérifié</dt>
                              <dd>
                                le {when(r.verified_at)}
                                {r.verified_by_name ? ` par ${r.verified_by_name}` : ""}
                              </dd>
                            </>
                          )}
                        </dl>
                        {aal2 && (
                          <Disclosure summary="Modifier" icon="edit">
                            <RecordForm record={r} />
                          </Disclosure>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      </ManageSection>

      <ManageSection
        title="Sauvegardes et restaurations"
        description="Une sauvegarde jamais restaurée n'est pas une garantie. Les sauvegardes de la base ne contiennent pas les fichiers (images, CV) : les deux se vérifient séparément."
      >
        <BackupList backups={ops.backups} />
        {aal2 && (
          <Disclosure summary="Déclarer une vérification" icon="check" tone="primary">
            <ActionForm action={recordBackup} submitLabel="Enregistrer la vérification" resetOnDone>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Ce qui a été vérifié">
                  {({ id, describedBy }) => (
                    <Select id={id} aria-describedby={describedBy} name="kind" defaultValue="database_restore_test">
                      {Object.entries(BACKUP_KIND).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Résultat">
                  {({ id, describedBy }) => (
                    <Select id={id} aria-describedby={describedBy} name="outcome" defaultValue="verified">
                      <option value="verified">Vérifié, tout est là</option>
                      <option value="partial">Partiel (des manques notés ci-dessous)</option>
                      <option value="failed">Échec</option>
                    </Select>
                  )}
                </Field>
                <Field label="Sur quel environnement">
                  {({ id, describedBy }) => (
                    <Select id={id} aria-describedby={describedBy} name="environment" defaultValue="production">
                      {Object.entries(ENVIRONMENT).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Date de la vérification">
                  {({ id, describedBy }) => (
                    <Input id={id} aria-describedby={describedBy} type="date" name="checked_on" required defaultValue={toDateInput(new Date())} max={toDateInput(new Date())} />
                  )}
                </Field>
              </div>
              <Field label="Comment" optional hint="Ex : restauration dans un projet isolé, 12 tables vérifiées, connexion testée">
                {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="method" maxLength={500} className="min-h-16" />}
              </Field>
              <Field label="Notes" optional>
                {({ id, describedBy }) => <Textarea id={id} aria-describedby={describedBy} name="notes" maxLength={1000} className="min-h-16" />}
              </Field>
            </ActionForm>
          </Disclosure>
        )}
      </ManageSection>
    </div>
  );
}
