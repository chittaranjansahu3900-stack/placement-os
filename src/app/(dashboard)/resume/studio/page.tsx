import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { normalizeCvContent } from "@/lib/resume";
import { createCvDocument } from "@/app/actions/resume";
import { ResumeEditor } from "@/components/resume/resume-editor";
import { OpsIcon } from "@/components/shared/ops-icon";
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

export default async function ResumeStudioPage({
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
      <div className="rounded-lg border border-slate-750 bg-slate-900/90 p-8 text-center max-w-xl mx-auto shadow-sm">
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

  return (
    <div className="space-y-4">
      {(error || saved) && (
        <div
          className={`flex items-center gap-2.5 rounded-lg border p-3.5 text-xs print:hidden shadow-sm ${
            error
              ? "border-red-800/80 bg-red-950/70 text-red-200"
              : "border-emerald-800/80 bg-emerald-950/70 text-emerald-200"
          }`}
        >
          <OpsIcon name={error ? "alert-triangle" : "check"} size={15} className={error ? "text-red-400" : "text-emerald-400"} />
          <span>{error ?? saved}</span>
        </div>
      )}

      {selected ? (
        <ResumeEditor
          documentId={selected.id}
          initialContent={normalizeCvContent(selected.content)}
          initialTemplateId={selected.template_id}
          comments={comments}
          versions={rows}
          personas={personaRows}
          upcomingJds={upcomingJds}
        />
      ) : (
        <div className="rounded-lg border border-dashed border-slate-750 p-12 text-center print:hidden bg-slate-900/40">
          <OpsIcon name="file-text" size={32} className="mx-auto mb-2 text-slate-500" />
          <h1 className="text-base font-bold text-white">Start from your verified profile</h1>
          <p className="mx-auto mt-2 max-w-md text-xs text-slate-400 leading-relaxed">
            Choose a company persona to initialize a placement CV. Your verified academic grades, work experience, projects, and contact info are prefilled automatically.
          </p>
          <form action={createCvDocument} className="mx-auto mt-5 flex max-w-sm items-center gap-2">
            <select
              name="persona_id"
              className="ops-select flex-1 text-xs text-white"
            >
              <option value="">General Placement CV</option>
              {personaRows.map((persona) => (
                <option key={persona.id} value={persona.id}>{persona.category_name}</option>
              ))}
            </select>
            <button className="ops-button-primary text-xs">
              + Create Pre-filled CV
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
