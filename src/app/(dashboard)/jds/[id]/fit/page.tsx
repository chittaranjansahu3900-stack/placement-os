import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { saveFitCriteria, submitFitFeedback } from "@/app/actions/fit";
import { fitAiEnabled } from "@/lib/fit/client";
import {
  FIT_VERDICT_LABEL,
  normalizeCriteria,
  type FitCriterion,
  type FitEvidence,
  type FitVerdict,
} from "@/lib/fit/schema";
import { OpsIcon } from "@/components/shared/ops-icon";
import { StatusBadge } from "@/components/shared/status-badge";
import { FitGenerateButton } from "@/components/jds/fit-generate-button";
import type { ApplicantDirectoryRow } from "@/types/domain";
import type { ApplicationFitBriefRow, FitDatabase } from "@/types/fit-database";

const VERDICT_ORDER: FitVerdict[] = ["strong", "likely", "partial", "insufficient_evidence", "weak"];
const VERDICT_TONE: Record<FitVerdict, string> = {
  strong: "text-emerald-300 bg-emerald-950/80 border-emerald-800/60",
  likely: "text-emerald-300 bg-emerald-950/60 border-emerald-900/60",
  partial: "text-amber-300 bg-amber-950/80 border-amber-800/60",
  weak: "text-red-300 bg-red-950/80 border-red-800/60",
  insufficient_evidence: "text-slate-300 bg-slate-800/80 border-slate-700/60",
};
const EVIDENCE_ICON: Record<FitEvidence["status"], { name: "check" | "alert-triangle" | "x"; tone: string }> = {
  met: { name: "check", tone: "text-emerald-400" },
  partial: { name: "alert-triangle", tone: "text-amber-400" },
  not_found: { name: "x", tone: "text-red-400" },
};

function asEvidence(value: unknown): FitEvidence[] {
  return Array.isArray(value) ? (value as FitEvidence[]) : [];
}

function oneLine(brief: ApplicationFitBriefRow): string {
  const must = asEvidence(brief.must_haves);
  const met = must.filter((e) => e.status === "met").length;
  return must.length ? `${met}/${must.length} must-haves · ${brief.summary}` : brief.summary;
}

export default async function FitPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ brief?: string; error?: string; notice?: string }>;
}) {
  const { id } = await params;
  const search = await searchParams;
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");
  const canEdit = ctx.permissionNames.has("Shortlisting (recruiter-scoped)");
  const canOversee = ctx.permissionNames.has("Shortlist Oversight");
  if (!canEdit && !canOversee) redirect("/dashboard");

  const supabase = (await createClient()) as unknown as SupabaseClient<FitDatabase>;
  const [{ data: jd }, { data: criteriaRow }, { data: applicants }] = await Promise.all([
    supabase.from("jds").select("id, role_title, companies(name)").eq("id", id).single(),
    supabase.from("jd_fit_criteria").select("*").eq("jd_id", id).order("version_no", { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc("get_applicant_directory", { p_jd_id: id }),
  ]);
  if (!jd) notFound();

  const criteria: FitCriterion[] = normalizeCriteria(criteriaRow?.criteria);
  const rows = (applicants ?? []) as unknown as ApplicantDirectoryRow[];

  const { data: briefRows } = criteriaRow
    ? await supabase.from("application_fit_briefs").select("*").eq("criteria_id", criteriaRow.id)
    : { data: [] as ApplicationFitBriefRow[] };
  const briefs = new Map<string, ApplicationFitBriefRow>();
  for (const b of briefRows ?? []) briefs.set(b.application_id, b);

  const briefIds = [...briefs.values()].map((b) => b.id);
  const { data: feedbackRows } = briefIds.length
    ? await supabase.from("fit_brief_feedback").select("brief_id, accurate, reason, user_id").in("brief_id", briefIds)
    : { data: [] as Array<{ brief_id: string; accurate: boolean; reason: string | null; user_id: string }> };
  const feedback = feedbackRows ?? [];
  const agreed = feedback.filter((f) => f.accurate).length;
  const disputed = feedback.filter((f) => !f.accurate).length;

  const ranked = [...rows].sort((a, b) => {
    const va = briefs.get(a.application_id)?.verdict;
    const vb = briefs.get(b.application_id)?.verdict;
    const ia = va ? VERDICT_ORDER.indexOf(va) : 99;
    const ib = vb ? VERDICT_ORDER.indexOf(vb) : 99;
    return ia - ib || (b.cgpa ?? 0) - (a.cgpa ?? 0);
  });

  const pending = rows.filter((r) => !briefs.has(r.application_id)).length;
  const counts = VERDICT_ORDER.map((v) => ({ v, n: [...briefs.values()].filter((b) => b.verdict === v).length }));

  const openBriefId = search.brief;
  const openRow = openBriefId ? rows.find((r) => briefs.get(r.application_id)?.id === openBriefId) : undefined;
  const openBrief = openBriefId ? [...briefs.values()].find((b) => b.id === openBriefId) : undefined;
  const openFeedback = openBrief ? feedback.filter((f) => f.brief_id === openBrief.id) : [];
  const company = (jd as unknown as { companies: { name: string } | null }).companies?.name ?? "";

  const editorRows: FitCriterion[] = criteria.length ? criteria : [{ id: "c1", kind: "must", text: "" }];

  return (
    <div className="flex gap-6">
      <div className="min-w-0 flex-1 space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs text-slate-400">
              <Link href="/jds" className="hover:text-slate-200">JDs</Link> / <Link href={`/jds/${id}`} className="hover:text-slate-200">{company || "JD"}</Link> /{" "}
              <Link href={`/jds/${id}/applicants`} className="hover:text-slate-200">Applicants</Link>
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">{jd.role_title} — applicants by fit</h1>
            <p className="mt-1 text-xs text-slate-400">
              {criteriaRow ? `Criteria v${criteriaRow.version_no}` : "No criteria yet"} · {briefs.size} of {rows.length} applicants briefed
              {feedback.length > 0 && ` · ${agreed} confirmed, ${disputed} disputed`}
            </p>
          </div>
          {canEdit && <FitGenerateButton jdId={id} pending={criteriaRow ? pending : 0} disabled={!fitAiEnabled() || !criteriaRow} />}
        </div>

        {search.error && (
          <div className="flex items-center gap-2.5 rounded-lg border border-red-800/80 bg-red-950/70 p-3.5 text-xs text-red-200">
            <OpsIcon name="alert-triangle" size={15} className="shrink-0 text-red-400" />
            <span>{search.error}</span>
          </div>
        )}
        {search.notice && (
          <div className="flex items-center gap-2.5 rounded-lg border border-emerald-800/80 bg-emerald-950/70 p-3.5 text-xs text-emerald-200">
            <OpsIcon name="check" size={15} className="shrink-0 text-emerald-400" />
            <span>{search.notice}</span>
          </div>
        )}
        {!fitAiEnabled() && (
          <div className="rounded-lg border border-amber-800/80 bg-amber-950/60 p-3.5 text-xs text-amber-200">
            Fit briefs are switched off (<code className="font-mono">FIT_AI_ENABLED</code>). Criteria can still be written and reviewed.
          </div>
        )}

        <div className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-900/70 p-3.5 text-xs text-slate-300">
          <OpsIcon name="shield" size={15} className="mt-0.5 shrink-0 text-amber-400" />
          <span>
            <strong className="text-white">This orders, it doesn&apos;t decide.</strong> Each verdict is a reading of evidence you can open. Shortlist, waitlist and reject remain
            yours, and are logged as yours. The model never sees names, gender, contact details, defaults or placement status.
          </span>
        </div>

        {/* Criteria editor */}
        <section className="ops-card space-y-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">What does a strong candidate look like?</h2>
            <span className="text-[11px] text-slate-400">Write it the way you&apos;d brief a colleague · applied identically to every applicant</span>
          </div>
          <form action={saveFitCriteria.bind(null, id)} className="space-y-3">
            {editorRows.map((c, i) => (
              <div key={c.id} className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 md:grid-cols-2">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <select name="criterion_kind" defaultValue={c.kind} disabled={!canEdit} className="ops-input h-8 w-36 text-xs">
                      <option value="must">Must-have</option>
                      <option value="nice">Nice-to-have</option>
                    </select>
                    <span className="font-mono text-[10px] text-slate-500">{c.id}</span>
                  </div>
                  <textarea name="criterion_text" defaultValue={c.text} rows={2} readOnly={!canEdit} placeholder={i === 0 ? "e.g. Has shipped a distributed system at real scale" : ""} className="ops-input w-full resize-none text-sm" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <OpsIcon name="sparkles" size={12} className="text-blue-400" />
                    how it will be read
                  </div>
                  <p className="rounded-md border border-slate-800 bg-slate-900/80 p-2.5 text-xs leading-relaxed text-slate-300">
                    {c.interpretation ?? (c.text ? "Saved without a reading — turn on FIT_AI_ENABLED and save again to get one." : "Save to see how this line will be applied.")}
                  </p>
                </div>
              </div>
            ))}
            {canEdit && (
              <>
                {/* Three blank slots so a recruiter can add lines without a client component. */}
                {[1, 2, 3].map((n) => (
                  <div key={`new-${n}`} className="grid gap-3 rounded-lg border border-dashed border-slate-800 p-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <select name="criterion_kind" defaultValue="must" className="ops-input h-8 w-36 text-xs">
                        <option value="must">Must-have</option>
                        <option value="nice">Nice-to-have</option>
                      </select>
                      <textarea name="criterion_text" rows={2} placeholder="Add a line (optional)" className="ops-input w-full resize-none text-sm" />
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">Saving creates v{(criteriaRow?.version_no ?? 0) + 1}. Existing briefs stay attached to the version they were read against.</span>
                  <button type="submit" className="ops-button-primary text-xs">
                    <OpsIcon name="check" size={13} />
                    <span>Save criteria</span>
                  </button>
                </div>
              </>
            )}
          </form>
        </section>

        {/* Verdict distribution + ranked list */}
        <section className="ops-card overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-4 py-3">
            {counts.map(({ v, n }) => (
              <span key={v} className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${VERDICT_TONE[v]}`}>
                {FIT_VERDICT_LABEL[v]} · {n}
              </span>
            ))}
            {pending > 0 && <span className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] text-slate-400">Not yet read · {pending}</span>}
          </div>
          <div className="divide-y divide-slate-800">
            {ranked.map((row, i) => {
              const b = briefs.get(row.application_id);
              return (
                <div key={row.application_id} className={`grid grid-cols-[28px_minmax(0,220px)_150px_minmax(0,1fr)_120px] items-center gap-3 px-4 py-3 ${b?.id === openBriefId ? "bg-blue-950/40" : ""}`}>
                  <span className="font-mono text-xs text-slate-500">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{row.name}</p>
                    <p className="font-mono text-[11px] text-slate-400">{row.roll_no} · CGPA {row.cgpa ?? "—"} · {row.total_work_ex_months} mo</p>
                  </div>
                  {b ? (
                    <Link href={`/jds/${id}/fit?brief=${b.id}`} className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${VERDICT_TONE[b.verdict]}`}>
                      {FIT_VERDICT_LABEL[b.verdict]}
                      {b.degraded && <OpsIcon name="alert-triangle" size={11} />}
                    </Link>
                  ) : (
                    <span className="text-[11px] text-slate-500">Not yet read</span>
                  )}
                  <p className="truncate text-xs text-slate-300">{b ? oneLine(b) : "—"}</p>
                  <StatusBadge status={row.status} />
                </div>
              );
            })}
            {ranked.length === 0 && <p className="p-6 text-center text-xs text-slate-500">No applicants yet.</p>}
          </div>
        </section>
      </div>

      {/* Brief panel */}
      {openBrief && openRow && (
        <aside className="ops-card sticky top-4 hidden h-fit w-[420px] shrink-0 space-y-4 p-5 xl:block">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">{openRow.name}</p>
              <p className="font-mono text-[11px] text-slate-400">{openRow.roll_no} · read against v{criteriaRow?.version_no} · {openBrief.model}</p>
            </div>
            <Link href={`/jds/${id}/fit`} aria-label="Close brief" className="rounded-md border border-slate-800 p-1.5 text-slate-400 hover:text-white">
              <OpsIcon name="x" size={14} />
            </Link>
          </div>

          <div className={`rounded-lg border p-3 ${VERDICT_TONE[openBrief.verdict]}`}>
            <p className="font-display text-lg font-bold leading-tight">{FIT_VERDICT_LABEL[openBrief.verdict]}</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-200">{openBrief.summary}</p>
            {openBrief.degraded && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-200">
                <OpsIcon name="alert-triangle" size={12} /> One or more claims could not be verified against the packet and were downgraded.
              </p>
            )}
          </div>

          {(["must", "nice"] as const).map((kind) => {
            const list = asEvidence(kind === "must" ? openBrief.must_haves : openBrief.nice_to_haves);
            if (list.length === 0) return null;
            return (
              <div key={kind} className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{kind === "must" ? "Must-haves" : "Nice-to-haves"} · source · quote</p>
                {list.map((e) => {
                  const c = criteria.find((x) => x.id === e.criterionId);
                  const ic = EVIDENCE_ICON[e.status];
                  return (
                    <div key={`${kind}-${e.criterionId}`} className="flex gap-2.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                      <OpsIcon name={ic.name} size={14} className={`mt-0.5 shrink-0 ${ic.tone}`} />
                      <div className="min-w-0 space-y-1">
                        <p className="text-xs font-semibold text-white">{c?.text ?? e.criterionId}</p>
                        {e.claim && <p className="text-xs text-slate-300">{e.claim}</p>}
                        {e.source && (
                          <p className="text-[11px] text-slate-400">
                            <span className="mr-1.5 rounded border border-blue-900 px-1 font-mono text-[10px] text-blue-300">{e.source}</span>
                            {e.quote && <span className="italic text-slate-300">“{e.quote}”</span>}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {asEvidence(openBrief.probes).length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Ask in interview</p>
              <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-slate-300">
                {(openBrief.probes as string[]).map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ol>
            </div>
          )}

          <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300">
              <OpsIcon name="shield" size={13} /> Deliberately not used
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{openBrief.excluded.join(" · ")}</p>
          </div>

          {canEdit && (
            <form action={submitFitFeedback.bind(null, id, openBrief.id)} className="space-y-2 border-t border-slate-800 pt-3">
              <p className="text-[11px] text-slate-400">
                Was this brief accurate?
                {openFeedback.length > 0 && ` · you said ${openFeedback[0].accurate ? "yes" : "no"}`}
              </p>
              <input name="reason" placeholder="If not — what did it get wrong?" className="ops-input w-full text-xs" />
              <div className="flex gap-2">
                <button type="submit" name="accurate" value="yes" className="ops-button-secondary text-xs"><OpsIcon name="check" size={12} /><span>Yes</span></button>
                <button type="submit" name="accurate" value="no" className="ops-button-secondary text-xs"><OpsIcon name="x" size={12} /><span>No</span></button>
              </div>
            </form>
          )}
        </aside>
      )}
    </div>
  );
}
