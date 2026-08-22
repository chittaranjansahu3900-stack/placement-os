import Link from "next/link";
import { redirect } from "next/navigation";
import { addCvReviewComment } from "@/app/actions/resume";
import { ResumePreview } from "@/components/resume-preview";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { normalizeCvContent } from "@/lib/resume";
import { createClient } from "@/lib/supabase/server";
import { OpsIcon } from "@/components/ops-icon";
import type { CvDocument, CvReviewComment } from "@/types/domain";

type ReviewDocument = CvDocument & {
  students: { name: string; roll_no: string } | null;
  company_type_personas: { category_name: string } | null;
};

export default async function CvReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ cv?: string; error?: string; saved?: string }>;
}) {
  const { cv: requestedCv, error, saved } = await searchParams;
  const ctx = await getCurrentUserContext();
  if (!ctx) redirect("/login");
  if (!ctx.permissionNames.has("Student Data - Full")) redirect("/dashboard");

  const supabase = await createClient();
  const { data: documents } = await supabase
    .from("cv_documents")
    .select("*, students!cv_documents_student_id_fkey(name, roll_no), company_type_personas(category_name)")
    .order("updated_at", { ascending: false })
    .limit(100);
  const rows = (documents ?? []) as unknown as ReviewDocument[];
  const selected = rows.find((document) => document.id === requestedCv) ?? rows[0] ?? null;

  const { data: comments } = selected
    ? await supabase
        .from("cv_review_comments")
        .select("*")
        .eq("cv_document_id", selected.id)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800/80 pb-5 print:hidden">
        <div className="flex items-center gap-2 text-xs font-mono text-purple-400">
          <OpsIcon name="sparkles" size={14} />
          <span>Placement Committee Quality Gate</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
          <span>SPC CV Review &amp; Feedback Workbench</span>
          <span className="rounded-md bg-slate-800 px-2 py-0.5 font-mono text-xs font-semibold text-slate-300 border border-slate-700">
            {rows.length} Submitted CVs
          </span>
        </h1>
        <p className="mt-1 text-xs text-slate-400">
          Anchor line-by-line bullet suggestions to verify academic and achievement claims.
        </p>
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

      {/* 3-Column Review Dock */}
      <div className="grid items-start gap-6 xl:grid-cols-[260px_minmax(500px,780px)_320px]">
        {/* Left: Queue List */}
        <aside className="max-h-[82vh] space-y-2 overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-3 print:hidden backdrop-blur-md">
          <p className="px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">Candidate Queue</p>
          {rows.map((document) => (
            <Link
              key={document.id}
              href={`/resume/review?cv=${document.id}`}
              className={`block rounded-xl border p-3 text-xs transition-all ${
                selected?.id === document.id
                  ? "border-blue-600 bg-blue-950/30 text-blue-200"
                  : "border-slate-800/90 bg-slate-950/80 hover:border-slate-700 text-slate-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white text-xs">{document.students?.name ?? "Student"}</span>
                <span className="font-mono text-[10px] text-amber-300 font-semibold">{document.students?.roll_no}</span>
              </div>
              <p className="mt-1 font-mono text-[10px] text-slate-400">
                {document.company_type_personas?.category_name ?? "General"} · v{document.version_no}
              </p>
            </Link>
          ))}
          {rows.length === 0 && <p className="p-4 text-center text-xs text-slate-500 font-mono">No CVs queued.</p>}
        </aside>

        {/* Center: CV Preview */}
        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#0a0f1b] p-6">
          {selected ? (
            <ResumePreview content={normalizeCvContent(selected.content)} templateId={selected.template_id} />
          ) : (
            <div />
          )}
        </div>

        {/* Right: Feedback & History Dock */}
        {selected && (
          <aside className="space-y-4 print:hidden">
            <form action={addCvReviewComment} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4.5 backdrop-blur-md space-y-3">
              <input type="hidden" name="cv_document_id" value={selected.id} />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
                <OpsIcon name="plus" size={14} className="text-purple-400" />
                <span>Add Inline Bullet Remark</span>
              </h2>

              <div>
                <label className="block font-mono text-[11px] text-slate-400">Anchor Section</label>
                <select
                  name="anchor_section"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white capitalize outline-none focus:border-purple-500"
                >
                  {['summary', 'academics', 'projects', 'positions', 'experience', 'skills', 'certifications', 'awards'].map((section) => (
                    <option key={section} value={section}>{section}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-mono text-[11px] text-slate-400">Bullet Key ID (optional)</label>
                <input
                  name="anchor_bullet_id"
                  placeholder="e.g. b1, exp-1"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] text-slate-400">SPC Committee Feedback</label>
                <textarea
                  name="comment_text"
                  required
                  rows={4}
                  placeholder="Provide constructive bullet improvement, metric verification, or formatting fix..."
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-xs text-white placeholder-slate-500 outline-none focus:border-purple-500"
                />
              </div>

              <button
                type="submit"
                className="w-full rounded-lg bg-purple-600 hover:bg-purple-500 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors"
              >
                Submit Feedback Point
              </button>
            </form>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4.5 backdrop-blur-md">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
                <OpsIcon name="clock" size={14} className="text-amber-400" />
                <span>Feedback History ({comments?.length ?? 0})</span>
              </h2>
              <div className="mt-3 space-y-2.5 font-mono text-xs">
                {((comments ?? []) as CvReviewComment[]).map((comment) => (
                  <div key={comment.id} className="rounded-xl border border-slate-800 bg-slate-950 p-3">
                    <div className="flex items-center justify-between text-[10px] text-purple-300 font-bold uppercase">
                      <span>{comment.anchor_section}{comment.anchor_bullet_id ? ` · ${comment.anchor_bullet_id}` : ""}</span>
                      <span className="text-slate-500">{comment.status}</span>
                    </div>
                    <p className="mt-1 text-slate-200 font-sans text-xs">{comment.comment_text}</p>
                  </div>
                ))}
                {!comments?.length && <p className="text-slate-500 font-mono text-xs text-center py-4">No comments logged yet.</p>}
              </div>
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}
