import Link from "next/link";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { normalizeCvContent } from "@/lib/resume";
import {
  cloneCvVersion,
  createCvDocument,
  scoreCvForJd,
  setLatestCvDocument,
} from "@/app/actions/resume";
import { uploadCvFile } from "@/app/actions/files";
import { ResumeEditor } from "@/components/resume-editor";
import { OpsIcon } from "@/components/ops-icon";
import type { CompanyTypePersona, CvDocument, CvReviewComment } from "@/types/domain";

type CvWithPersona = CvDocument & {
  company_type_personas: { category_name: string } | null;
};

type UpcomingJd = {
  id: string;
  role_title: string;
  apply_by_deadline: string;
  companies: { name: string } | null;
};

type ReviewCommentWithAuthor = CvReviewComment & { users: { name: string } | null };

function urgency(deadline: string) {
  const hours = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 3_600_000));
  if (hours < 24) return { label: `${hours}h left`, className: "text-red-300 border-red-800 bg-red-950/80" };
  const days = Math.ceil(hours / 24);
  if (days <= 3) return { label: `${days}d left`, className: "text-amber-300 border-amber-800 bg-amber-950/80" };
  return { label: `${days}d left`, className: "text-slate-300 border-slate-700 bg-slate-900" };
}

export default async function ResumePage({
  searchParams,
}: {
  searchParams: Promise<{ cv?: string; error?: string; saved?: string }>;
}) {
  const { cv: requestedCv, error, saved } = await searchParams;
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, batch_id")
    .eq("user_id", ctx.appUser.id)
    .single();

  if (!student) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center max-w-xl mx-auto">
        <OpsIcon name="file-text" size={28} className="mx-auto mb-2 text-amber-400" />
        <h1 className="text-lg font-bold text-white">Student Profile Required</h1>
        <p className="mt-2 text-xs text-slate-400">
          No student record is associated with this login. Please reach out to your CDPO coordinator.
        </p>
      </div>
    );
  }

  const [{ data: documents }, { data: personas }, { data: jds }] = await Promise.all([
    supabase
      .from("cv_documents")
      .select("*, company_type_personas(category_name)")
      .eq("student_id", student.id)
      .order("updated_at", { ascending: false }),
    supabase.from("company_type_personas").select("*").order("category_name"),
    supabase
      .from("jds")
      .select("id, role_title, apply_by_deadline, companies(name)")
      .eq("batch_id", student.batch_id)
      .eq("status", "published")
      .gt("apply_by_deadline", new Date().toISOString())
      .order("apply_by_deadline")
      .limit(8),
  ]);

  const rows = (documents ?? []) as CvWithPersona[];
  const selected =
    rows.find((document) => document.id === requestedCv) ??
    rows.find((document) => document.is_latest) ??
    rows[0] ??
    null;

  const { data: reviewComments } = selected
    ? await supabase
        .from("cv_review_comments")
        .select("*, users(name)")
        .eq("cv_document_id", selected.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  const personaRows = (personas ?? []) as CompanyTypePersona[];
  const upcomingJds = (jds ?? []) as unknown as UpcomingJd[];
  const comments = (reviewComments ?? []) as ReviewCommentWithAuthor[];
  const fit = selected ? normalizeCvContent(selected.content).jdFit : null;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-800/80 pb-5 print:hidden">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-amber-400">
            <OpsIcon name="file-text" size={14} />
            <span>Placement CV Studio &amp; ATS Engine</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>Placement CV Maker</span>
            {selected && (
              <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-slate-300 border border-slate-700">
                v{selected.version_no} · {selected.company_type_personas?.category_name ?? "General"}
              </span>
            )}
          </h1>
          <p className="mt-1 text-xs text-slate-400">
            Profile-prefilled standard B-School CV versions with persona tailoring and JD keyword fit scoring.
          </p>
        </div>

        {selected && (
          <div className="flex items-center gap-2">
            <Link
              href={`/resume/${selected.id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors"
            >
              <OpsIcon name="eye" size={13} />
              <span>Full View / Export</span>
            </Link>
            <form action={cloneCvVersion}>
              <input type="hidden" name="cv_document_id" value={selected.id} />
              <button className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition-colors">
                <OpsIcon name="copy" size={13} />
                <span>Clone Version</span>
              </button>
            </form>
            {!selected.is_latest && (
              <form action={setLatestCvDocument}>
                <input type="hidden" name="cv_document_id" value={selected.id} />
                <button className="ops-button-primary">
                  <OpsIcon name="check" size={13} />
                  <span>Set as Active Primary</span>
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {(error || saved) && (
        <div
          className={`flex items-center gap-2 rounded-xl border p-3.5 text-xs print:hidden ${
            error
              ? "border-red-800/60 bg-red-950/50 text-red-200"
              : "border-emerald-800/60 bg-emerald-950/50 text-emerald-200"
          }`}
        >
          <OpsIcon name={error ? "alert-triangle" : "check"} size={16} className={error ? "text-red-400" : "text-emerald-400"} />
          <span>{error ?? saved}</span>
        </div>
      )}

      {/* Split-pane Workspace */}
      <div className="grid items-start gap-6 2xl:grid-cols-[280px_minmax(0,1fr)]">
        {/* Left Telemetry & Version Sidebar */}
        <aside className="space-y-5 print:hidden">
          {/* CV Versions List */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4.5 backdrop-blur-md">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-2">
              <OpsIcon name="layers" size={14} className="text-amber-400" />
              <span>My CV Versions ({rows.length})</span>
            </h2>
            <div className="mt-3 space-y-2">
              {rows.map((document) => (
                <Link
                  key={document.id}
                  href={`/resume?cv=${document.id}`}
                  className={`block rounded-xl border p-3 text-xs transition-all ${
                    selected?.id === document.id
                      ? "border-amber-600 bg-amber-950/30 text-amber-200"
                      : "border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs">
                      {normalizeCvContent(document.content).title}
                    </span>
                    <span className="font-mono text-[10px] text-amber-400 font-semibold">
                      v{document.version_no}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-slate-400">
                    <span>{document.company_type_personas?.category_name ?? "General"}</span>
                    {document.is_latest && (
                      <span className="rounded bg-emerald-950 border border-emerald-800 px-1.5 py-0.2 text-[9px] font-bold text-emerald-300">
                        PRIMARY
                      </span>
                    )}
                  </div>
                </Link>
              ))}
              {rows.length === 0 && <p className="text-xs text-slate-500 font-mono py-2">No CV versions yet.</p>}
            </div>

            <form action={createCvDocument} className="mt-4 space-y-2 border-t border-slate-800 pt-3.5">
              <select
                name="persona_id"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500"
              >
                <option value="">General Placement CV</option>
                {personaRows.map((persona) => (
                  <option key={persona.id} value={persona.id}>{persona.category_name}</option>
                ))}
              </select>
              <button className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors">
                + Create Pre-filled CV
              </button>
            </form>
          </section>

          {selected && (
            <section className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h2 className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-slate-400">
                <OpsIcon name="upload" size={14} className="text-blue-400" />
                <span>Original CV File</span>
              </h2>
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Stored and downloaded in full without contact-detail redaction or shortlist gating.
              </p>
              {selected.file_url && (
                <a
                  href={`/api/files/download?path=${encodeURIComponent(selected.file_url)}&name=${encodeURIComponent(`${normalizeCvContent(selected.content).title}.pdf`)}`}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300"
                >
                  <OpsIcon name="download" size={12} />
                  Download uploaded file
                </a>
              )}
              <form action={uploadCvFile} className="mt-3 space-y-2">
                <input type="hidden" name="cv_document_id" value={selected.id} />
                <input
                  type="file"
                  name="file"
                  accept=".pdf,.doc,.docx,.txt"
                  required
                  className="block w-full text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-slate-200"
                />
                <button className="ops-button-secondary w-full justify-center">
                  Upload or replace file
                </button>
              </form>
            </section>
          )}

          {/* JD Keyword Fit Analyzer */}
          {selected && upcomingJds.length > 0 && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4.5 backdrop-blur-md">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-2">
                <OpsIcon name="sparkles" size={14} className="text-purple-400" />
                <span>JD Keyword Fit Score</span>
              </h2>
              {fit && (
                <div className="mt-3 rounded-xl border border-purple-900/50 bg-purple-950/20 p-3.5 space-y-2.5">
                  <div className="flex items-baseline justify-between">
                    <span className="font-mono text-2xl font-bold text-purple-200">{fit.score}%</span>
                    <span className="font-mono text-[10px] uppercase text-purple-400 font-bold">ATS Match</span>
                  </div>
                  <div className="space-y-1.5 font-mono text-[11px]">
                    {Object.entries(fit.sectionCoverage).map(([section, score]) => (
                      <div key={section} className="space-y-0.5">
                        <div className="flex justify-between text-slate-400">
                          <span className="capitalize">{section}</span>
                          <span>{score}%</span>
                        </div>
                        <div className="h-1 w-full rounded-full bg-slate-800 overflow-hidden">
                          <div className="h-full bg-purple-500 rounded-full" style={{ width: `${score}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {fit.missingKeywords.length > 0 && (
                    <p className="mt-2 text-[11px] font-mono text-amber-300 border-t border-purple-900/40 pt-2">
                      Missing: {fit.missingKeywords.join(", ")}
                    </p>
                  )}
                </div>
              )}
              <form action={scoreCvForJd} className="mt-3 space-y-2">
                <input type="hidden" name="cv_document_id" value={selected.id} />
                <select
                  name="jd_id"
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white outline-none focus:border-purple-500"
                >
                  <option value="">Select Target JD...</option>
                  {upcomingJds.map((jd) => (
                    <option key={jd.id} value={jd.id}>{jd.companies?.name} — {jd.role_title}</option>
                  ))}
                </select>
                <textarea
                  name="job_description"
                  placeholder="Paste JD requirements to calculate section match..."
                  className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500"
                />
                <button className="w-full rounded-lg border border-purple-800 bg-purple-950/60 hover:bg-purple-900/80 px-3 py-1.5 text-xs font-semibold text-purple-200 transition-colors">
                  Calculate ATS Fit
                </button>
              </form>
            </section>
          )}

          {/* Upcoming Application Deadlines */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4.5 backdrop-blur-md">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono flex items-center gap-2">
              <OpsIcon name="clock" size={14} className="text-blue-400" />
              <span>Application Deadlines</span>
            </h2>
            <div className="mt-3 space-y-2">
              {upcomingJds.map((jd) => {
                const itemUrgency = urgency(jd.apply_by_deadline);
                return (
                  <div key={jd.id} className="rounded-xl border border-slate-800 bg-slate-950 p-2.5">
                    <p className="text-xs font-bold text-white">{jd.companies?.name ?? "Company"}</p>
                    <p className="text-[11px] text-slate-400 truncate">{jd.role_title}</p>
                    <span className={`mt-1.5 inline-block rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${itemUrgency.className}`}>
                      {itemUrgency.label}
                    </span>
                  </div>
                );
              })}
              {upcomingJds.length === 0 && <p className="text-xs text-slate-500 font-mono">No active deadlines.</p>}
            </div>
          </section>
        </aside>

        {/* Right CV Editor Canvas */}
        <main className="min-w-0">
          {selected ? (
            <ResumeEditor
              documentId={selected.id}
              initialContent={normalizeCvContent(selected.content)}
              initialTemplateId={selected.template_id}
              comments={comments}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-700 p-12 text-center print:hidden">
              <OpsIcon name="file-text" size={32} className="mx-auto mb-2 text-slate-500" />
              <h2 className="text-base font-bold text-white">Start from your verified profile</h2>
              <p className="mx-auto mt-2 max-w-md text-xs text-slate-400 leading-relaxed">
                Choose a company persona on the left to initialize a placement CV. Your verified academic grades, work experience, projects, and contact info are prefilled automatically.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
