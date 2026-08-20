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
import { ResumeEditor } from "@/components/resume-editor";
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
  if (hours < 24) return { label: `${hours}h left`, className: "text-red-300 border-red-900 bg-red-950" };
  const days = Math.ceil(hours / 24);
  if (days <= 3) return { label: `${days}d left`, className: "text-amber-300 border-amber-900 bg-amber-950" };
  return { label: `${days}d left`, className: "text-neutral-300 border-neutral-700 bg-neutral-900" };
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
      <div>
        <h1 className="text-xl font-semibold text-white">Resume Maker</h1>
        <p className="mt-2 text-sm text-neutral-500">No student profile is linked to your account yet.</p>
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
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-xl font-semibold text-white">Resume Maker</h1>
          <p className="mt-1 text-sm text-neutral-400">
            Profile-prefilled CVs for placement applications, adapted from Cursivo&apos;s placement-cell model.
          </p>
        </div>
        {selected && (
          <div className="flex gap-2">
            <form action={cloneCvVersion}>
              <input type="hidden" name="cv_document_id" value={selected.id} />
              <button className="rounded-md border border-neutral-700 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800">
                Create new version
              </button>
            </form>
            {!selected.is_latest && (
              <form action={setLatestCvDocument}>
                <input type="hidden" name="cv_document_id" value={selected.id} />
                <button className="rounded-md bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500">
                  Use for next application
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {(error || saved) && (
        <p
          className={`mt-4 rounded-md border px-3 py-2 text-sm print:hidden ${
            error ? "border-red-900 bg-red-950 text-red-300" : "border-emerald-900 bg-emerald-950 text-emerald-300"
          }`}
        >
          {error ?? saved}
        </p>
      )}

      <div className="mt-6 grid items-start gap-6 2xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="space-y-5 print:hidden">
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">My CV versions</h2>
            <div className="mt-3 space-y-2">
              {rows.map((document) => (
                <Link
                  key={document.id}
                  href={`/resume?cv=${document.id}`}
                  className={`block rounded-md border p-2 text-xs ${
                    selected?.id === document.id
                      ? "border-blue-700 bg-blue-950 text-blue-200"
                      : "border-neutral-800 text-neutral-300 hover:bg-neutral-800"
                  }`}
                >
                  <span className="block font-medium">
                    {normalizeCvContent(document.content).title} · v{document.version_no}
                  </span>
                  <span className="mt-0.5 block text-neutral-500">
                    {document.company_type_personas?.category_name ?? "General"}
                    {document.is_latest ? " · Current" : ""}
                  </span>
                </Link>
              ))}
              {rows.length === 0 && <p className="text-xs text-neutral-500">No CV created yet.</p>}
            </div>
            <form action={createCvDocument} className="mt-4 space-y-2 border-t border-neutral-800 pt-4">
              <select name="persona_id" className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-xs text-white">
                <option value="">General placement CV</option>
                {personaRows.map((persona) => (
                  <option key={persona.id} value={persona.id}>{persona.category_name}</option>
                ))}
              </select>
              <button className="w-full rounded-md border border-neutral-700 px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800">
                {rows.length ? "Create another CV" : "Create my pre-filled CV"}
              </button>
            </form>
          </section>

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Application deadlines</h2>
            <div className="mt-3 space-y-2">
              {upcomingJds.map((jd) => {
                const itemUrgency = urgency(jd.apply_by_deadline);
                return (
                  <div key={jd.id} className="rounded-md border border-neutral-800 bg-neutral-950 p-2">
                    <p className="text-xs font-medium text-neutral-200">{jd.companies?.name ?? "Company"}</p>
                    <p className="text-xs text-neutral-500">{jd.role_title}</p>
                    <span className={`mt-2 inline-block rounded-full border px-2 py-0.5 text-[10px] ${itemUrgency.className}`}>
                      {itemUrgency.label}
                    </span>
                  </div>
                );
              })}
              {upcomingJds.length === 0 && <p className="text-xs text-neutral-500">No upcoming published deadlines.</p>}
            </div>
          </section>

          {selected && upcomingJds.length > 0 && (
            <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">JD-fit coverage</h2>
              {fit && (
                <div className="mt-3 rounded-md border border-neutral-800 bg-neutral-950 p-3">
                  <p className="text-2xl font-semibold text-white">{fit.score}%</p>
                  <p className="text-[10px] text-neutral-500">Transparent keyword coverage</p>
                  <div className="mt-2 space-y-1 text-[10px] text-neutral-400">
                    {Object.entries(fit.sectionCoverage).map(([section, score]) => (
                      <div key={section} className="flex justify-between"><span className="capitalize">{section}</span><span>{score}%</span></div>
                    ))}
                  </div>
                  {fit.missingKeywords.length > 0 && (
                    <p className="mt-2 text-[10px] text-amber-300">Gaps: {fit.missingKeywords.join(", ")}</p>
                  )}
                </div>
              )}
              <form action={scoreCvForJd} className="mt-3 space-y-2">
                <input type="hidden" name="cv_document_id" value={selected.id} />
                <select name="jd_id" required className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-xs text-white">
                  <option value="">Choose a JD</option>
                  {upcomingJds.map((jd) => (
                    <option key={jd.id} value={jd.id}>{jd.companies?.name} — {jd.role_title}</option>
                  ))}
                </select>
                <textarea
                  name="job_description"
                  placeholder="Paste the JD text for useful section coverage"
                  className="min-h-28 w-full rounded-md border border-neutral-700 bg-neutral-950 px-2 py-2 text-xs text-white"
                />
                <button className="w-full rounded-md bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-950 hover:bg-white">Analyze fit</button>
              </form>
            </section>
          )}
        </aside>

        <main className="min-w-0">
          {selected ? (
            <ResumeEditor
              documentId={selected.id}
              initialContent={normalizeCvContent(selected.content)}
              initialTemplateId={selected.template_id}
              comments={comments}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-700 p-12 text-center print:hidden">
              <h2 className="text-lg font-medium text-white">Start from your verified profile</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-neutral-500">
                Choose a company persona and create a CV. Your roster academics, work experience, credentials, and contact details are imported automatically.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
