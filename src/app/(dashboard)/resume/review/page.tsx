import Link from "next/link";
import { redirect } from "next/navigation";
import { addCvReviewComment } from "@/app/actions/resume";
import { ResumePreview } from "@/components/resume-preview";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { normalizeCvContent } from "@/lib/resume";
import { createClient } from "@/lib/supabase/server";
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
  // cv_review_comments_insert RLS gates on has_permission('Student Data - Full'),
  // not role name — see the applicants-page fix for the same reasoning.
  if (!ctx.permissionNames.has("Student Data - Full")) redirect("/dashboard");

  const supabase = await createClient();
  const { data: documents } = await supabase
    .from("cv_documents")
    .select("*, students(name, roll_no), company_type_personas(category_name)")
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
    <div>
      <div className="print:hidden">
        <h1 className="text-xl font-semibold text-white">SPC CV Review</h1>
        <p className="mt-1 text-sm text-neutral-400">Leave comments anchored to a section or exact bullet ID; students action each comment individually.</p>
      </div>

      {(error || saved) && (
        <p className={`mt-4 rounded-md border px-3 py-2 text-sm print:hidden ${error ? "border-red-900 bg-red-950 text-red-300" : "border-emerald-900 bg-emerald-950 text-emerald-300"}`}>
          {error ?? saved}
        </p>
      )}

      <div className="mt-6 grid items-start gap-6 xl:grid-cols-[260px_minmax(500px,794px)_300px]">
        <aside className="max-h-[80vh] space-y-2 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-900 p-3 print:hidden">
          {rows.map((document) => (
            <Link
              key={document.id}
              href={`/resume/review?cv=${document.id}`}
              className={`block rounded-md border p-3 text-xs ${selected?.id === document.id ? "border-blue-700 bg-blue-950" : "border-neutral-800 hover:bg-neutral-800"}`}
            >
              <span className="block font-medium text-neutral-100">{document.students?.name ?? "Student"}</span>
              <span className="mt-1 block text-neutral-500">{document.students?.roll_no} · {document.company_type_personas?.category_name ?? "General"} · v{document.version_no}</span>
            </Link>
          ))}
          {rows.length === 0 && <p className="p-3 text-sm text-neutral-500">No CVs are ready for review.</p>}
        </aside>

        {selected ? <ResumePreview content={normalizeCvContent(selected.content)} templateId={selected.template_id} /> : <div />}

        {selected && (
          <aside className="space-y-4 print:hidden">
            <form action={addCvReviewComment} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <input type="hidden" name="cv_document_id" value={selected.id} />
              <h2 className="text-sm font-semibold text-white">Add inline comment</h2>
              <label className="mt-3 block text-xs text-neutral-400">
                Section
                <select name="anchor_section" required className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm text-white">
                  {['summary', 'academics', 'projects', 'positions', 'experience', 'skills', 'certifications', 'awards'].map((section) => (
                    <option key={section} value={section}>{section}</option>
                  ))}
                </select>
              </label>
              <label className="mt-3 block text-xs text-neutral-400">
                Bullet ID (optional)
                <input name="anchor_bullet_id" placeholder="Shown in the CV preview markup" className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm text-white" />
              </label>
              <label className="mt-3 block text-xs text-neutral-400">
                Comment
                <textarea name="comment_text" required className="mt-1 min-h-28 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-sm text-white" />
              </label>
              <button className="mt-3 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500">Add comment</button>
            </form>

            <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h2 className="text-sm font-semibold text-white">Review history</h2>
              <div className="mt-3 space-y-3">
                {((comments ?? []) as CvReviewComment[]).map((comment) => (
                  <div key={comment.id} className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
                    <p className="text-xs font-medium text-blue-300">{comment.anchor_section}{comment.anchor_bullet_id ? ` · ${comment.anchor_bullet_id}` : ""}</p>
                    <p className="mt-1 text-sm text-neutral-200">{comment.comment_text}</p>
                    <p className="mt-1 text-[10px] uppercase text-neutral-600">{comment.status}</p>
                  </div>
                ))}
                {!comments?.length && <p className="text-sm text-neutral-500">No comments yet.</p>}
              </div>
            </section>
          </aside>
        )}
      </div>
    </div>
  );
}
