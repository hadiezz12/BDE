import type { Metadata } from "next";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { plural } from "@/lib/format";
import { endOfParisDay, startOfParisDay } from "@/lib/governance/labels";
import { governanceErrorMessage } from "@/lib/governance/messages";
import { getApplicationList, PAGE_SIZE, type ListFilters } from "@/lib/recruitment/review-data";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { ManageEmpty } from "@/components/manage/ManageEmpty";
import { ManageSection } from "@/components/manage/ManagePageHeader";
import { MfaNotice, ReadOnlyNotice } from "@/components/manage/governance/Notices";
import { readOnlyReason } from "@/components/manage/content/desk";
import { ApplicationTable } from "@/components/manage/review/ApplicationTable";
import { loadReviewFrame, ReviewDenied, ReviewHeader, ReviewUnavailable } from "@/components/manage/review/ReviewFrame";

type Params = Promise<{ asso: string; campaign: string }>;
type Search = Promise<{ [key: string]: string | string[] | undefined }>;

export const metadata: Metadata = { title: "Candidatures" };

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const STAGES: { value: string; label: string }[] = [
  { value: "new", label: "Nouvelles" },
  { value: "under_review", label: "En examen" },
  { value: "shortlisted", label: "Présélectionnées" },
  { value: "interview", label: "En entretien" },
  { value: "decision_pending", label: "Décision proposée" },
  { value: "finalized", label: "Décision validée, pas annoncée" },
  { value: "released", label: "Décision annoncée" },
  { value: "withdrawn", label: "Retirées par la personne" },
];

const REVIEW_FILTERS: { value: string; label: string }[] = [
  { value: "mine_todo", label: "Confiées à moi, pas encore évaluées" },
  { value: "mine_done", label: "Évaluées par moi" },
  { value: "none", label: "Confiées à personne" },
  { value: "awaiting", label: "Confiées, aucune évaluation" },
  { value: "partial", label: "Évaluations incomplètes" },
  { value: "complete", label: "Évaluations complètes" },
];

/**
 * /manage/[asso]/recruitment/[campaign]/candidatures — the applications the
 * person may open in this recruitment, filtered and paged by
 * public.recruitment_application_list (their appointment's scope or the
 * association's keys; never a draft, never their own, nothing they declared
 * a conflict on). Ticked rows can be confided, moved on or invited to an
 * interview; each one is checked again by the database.
 */
export default async function ApplicationListPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { asso, campaign } = await params;
  const sp = await searchParams;
  const frame = await loadReviewFrame(asso, campaign, "candidatures");
  if (!frame.ok) return frame.node;
  const { ctx, access, campaignId, has } = frame;
  if (!has("view")) return <ReviewDenied asso={asso} access={access} what="La lecture des candidatures" />;

  const from = startOfParisDay(first(sp.du));
  const toEnd = endOfParisDay(first(sp.au));
  const filters: ListFilters = {
    q: first(sp.q).slice(0, 80),
    position: first(sp.poste),
    stage: first(sp.etape),
    review: first(sp.evaluation),
    reviewer: first(sp.evaluateur),
    tag: first(sp.etiquette),
    from: from ?? "",
    to: toEnd ? new Date(Date.parse(toEnd) + 60_000).toISOString() : "",
    sort: first(sp.tri),
  };
  const page = Math.max(1, Math.min(400, Number.parseInt(first(sp.page) || "1", 10) || 1));
  const list = await getApplicationList(campaignId, filters, page);
  if (!list.ok) {
    if (list.code === "filter_invalid") {
      return <ReviewUnavailable asso={asso} message="Un des filtres n'est pas valide. Repars de la liste complète." />;
    }
    return <ReviewUnavailable asso={asso} message={governanceErrorMessage(list.code)} />;
  }
  const data = list.data;
  const readOnly = readOnlyReason(ctx);
  const writable = !readOnly && !access.archived;
  const filtered = ["q", "poste", "etape", "evaluation", "evaluateur", "etiquette", "du", "au"].some((k) => first(sp[k]) !== "");
  const pages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const base = routes.manageApplications(asso, campaignId);
  const pageHref = (n: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (k !== "page" && typeof v === "string" && v) q.set(k, v);
    if (n > 1) q.set("page", String(n));
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <div className="flex flex-col gap-8">
      <ReviewHeader
        asso={asso}
        access={access}
        description={
          <p>
            Chaque ouverture d&apos;une candidature et de ses fichiers est notée dans son historique, visible de la personne qui
            compose le comité. Les candidat·es ne voient ni les étapes internes, ni les évaluations.
          </p>
        }
        actions={
          has("export") ? (
            <form method="post" action={routes.manageApplicationsExport(asso, campaignId)}>
              <Button type="submit" variant="secondary" icon="file" iconPosition="start" disabled={ctx.aal !== "aal2"}>
                Exporter (CSV)
              </Button>
            </form>
          ) : undefined
        }
      />
      {readOnly && <ReadOnlyNotice reason={readOnly} />}
      {has("export") && ctx.aal !== "aal2" && <MfaNotice what="Exporter la liste des candidatures" />}

      <ManageSection title="Filtrer">
        <form method="get" action={base} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Nom ou référence">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} name="q" defaultValue={first(sp.q)} maxLength={80} />}
          </Field>
          <Field label="Poste">
            {({ id, describedBy }) => (
              <Select id={id} aria-describedby={describedBy} name="poste" defaultValue={first(sp.poste)}>
                <option value="">Tous</option>
                {data.positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Où elle en est">
            {({ id, describedBy }) => (
              <Select id={id} aria-describedby={describedBy} name="etape" defaultValue={first(sp.etape)}>
                <option value="">Toutes</option>
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Évaluations">
            {({ id, describedBy }) => (
              <Select id={id} aria-describedby={describedBy} name="evaluation" defaultValue={first(sp.evaluation)}>
                <option value="">Toutes</option>
                {REVIEW_FILTERS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {data.reviewers.length > 0 && (
            <Field label="Confiée à">
              {({ id, describedBy }) => (
                <Select id={id} aria-describedby={describedBy} name="evaluateur" defaultValue={first(sp.evaluateur)}>
                  <option value="">N&apos;importe qui</option>
                  {data.reviewers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {data.tags.length > 0 && (
            <Field label="Étiquette">
              {({ id, describedBy }) => (
                <Select id={id} aria-describedby={describedBy} name="etiquette" defaultValue={first(sp.etiquette)}>
                  <option value="">Toutes</option>
                  {data.tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          <Field label="Envoyée à partir du">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="du" defaultValue={first(sp.du)} />}
          </Field>
          <Field label="Jusqu'au">
            {({ id, describedBy }) => <Input id={id} aria-describedby={describedBy} type="date" name="au" defaultValue={first(sp.au)} />}
          </Field>
          <Field label="Ordre">
            {({ id, describedBy }) => (
              <Select id={id} aria-describedby={describedBy} name="tri" defaultValue={first(sp.tri)}>
                <option value="">Les plus récentes d&apos;abord</option>
                <option value="submitted_asc">Les plus anciennes d&apos;abord</option>
                <option value="name">Par nom</option>
              </Select>
            )}
          </Field>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit" variant="secondary" icon="filter" iconPosition="start">
              Filtrer
            </Button>
            {filtered && (
              <ButtonLink href={base} variant="ghost">
                Tout afficher
              </ButtonLink>
            )}
          </div>
        </form>
      </ManageSection>

      <ManageSection title="Candidatures" count={data.total}>
        {data.total === 0 ? (
          <ManageEmpty icon="users" title={filtered ? "Aucune candidature ne correspond" : "Aucune candidature à ouvrir"}>
            <p>
              {filtered
                ? "Change ou retire des filtres."
                : "Les candidatures envoyées apparaissent ici, dans la limite de ce qui t'est ouvert dans ce recrutement."}
            </p>
          </ManageEmpty>
        ) : (
          <>
            <ApplicationTable
              rows={data.rows}
              asso={asso}
              campaignId={campaignId}
              reviewers={data.reviewers}
              team={has("view_team")}
              can={{ assign: has("committee"), move: has("shortlist"), invite: has("interviews") }}
              writable={writable}
            />
            {pages > 1 && (
              <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 type-small">
                <span className="text-muted">
                  Page {page} sur {pages} · {plural(data.total, "candidature")}
                </span>
                <span className="flex gap-2">
                  {page > 1 && (
                    <Link href={pageHref(page - 1)} className="font-semibold underline underline-offset-2">
                      Page précédente
                    </Link>
                  )}
                  {page < pages && (
                    <Link href={pageHref(page + 1)} className="font-semibold underline underline-offset-2">
                      Page suivante
                    </Link>
                  )}
                </span>
              </nav>
            )}
          </>
        )}
      </ManageSection>
    </div>
  );
}
