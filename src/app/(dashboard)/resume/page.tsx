import Link from "next/link";
import { getCurrentUserContext } from "@/lib/auth/current-user";
import { createClient } from "@/lib/supabase/server";
import { normalizeCvContent } from "@/lib/resume";
import { createCvDocument } from "@/app/actions/resume";
import { OpsIcon } from "@/components/shared/ops-icon";
import type { CompanyTypePersona, CvDocument } from "@/types/domain";

type CvWithPersona = CvDocument & {
  company_type_personas: { category_name: string } | null;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default async function ResumeListPage() {
  const ctx = await getCurrentUserContext();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("user_id", ctx.appUser.id)
    .single();

  if (!student) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-slate-750 bg-slate-900/90 p-8 text-center shadow-sm">
        <OpsIcon name="file-text" size={28} className="mx-auto mb-2 text-amber-400" />
        <h1 className="text-lg font-bold text-white">Student Profile Required</h1>
        <p className="mt-2 text-xs text-slate-400">
          No student record is associated with this login. Please reach out to your CDPO coordinator.
        </p>
      </div>
    );
  }

  const [{ data: documents }, { data: personas }] = await Promise.all([
    supabase
      .from("cv_documents")
      .select("*, company_type_personas(category_name)")
      .eq("student_id", student.id)
      .order("updated_at", { ascending: false }),
    supabase.from("company_type_personas").select("*").order("category_name"),
  ]);

  const rows = (documents ?? []) as CvWithPersona[];
  const personaRows = (personas ?? []) as CompanyTypePersona[];

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">My Placement CV</h1>
        <p className="mt-1 text-xs text-slate-400">
          Every version of your placement CV, prefilled from your verified profile and tailored per persona.
        </p>
      </div>

      {rows.length > 0 && (
        <div className="space-y-2.5">
          {rows.map((doc) => {
            const content = normalizeCvContent(doc.content);
            return (
              <div
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#334155] bg-[#0f172a] p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-white">{content.title || "My CV"}</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-amber-400">
                      v{doc.version_no}
                    </span>
                    {doc.is_latest && (
                      <span className="rounded border border-emerald-700/80 bg-emerald-950 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">
                        PRIMARY
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-slate-500">
                    {doc.company_type_personas?.category_name ?? "General Placement"} · Updated {formatDate(doc.updated_at)}
                    {doc.jd_coverage_score != null && <> · JD Fit {doc.jd_coverage_score}%</>}
                  </p>
                </div>
                <Link
                  href={`/resume/studio?cv=${doc.id}`}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#4f46e5] px-3.5 py-2 text-xs font-semibold text-white shadow-[0_2px_12px_rgba(99,102,241,0.35)] transition-transform hover:-translate-y-px"
                >
                  <OpsIcon name="sparkles" size={13} />
                  Open Resume Studio
                </Link>
              </div>
            );
          })}
        </div>
      )}

      <div className={rows.length > 0 ? "rounded-lg border border-dashed border-slate-750 bg-slate-900/40 p-6" : "rounded-lg border border-dashed border-slate-750 p-12 text-center bg-slate-900/40"}>
        {rows.length === 0 && (
          <>
            <OpsIcon name="file-text" size={32} className="mx-auto mb-2 text-slate-500" />
            <h2 className="text-base font-bold text-white">Start from your verified profile</h2>
            <p className="mx-auto mt-2 max-w-md text-xs text-slate-400 leading-relaxed">
              Choose a company persona to initialize a placement CV. Your verified academic grades, work experience, projects, and contact info are prefilled automatically.
            </p>
          </>
        )}
        <form action={createCvDocument} className={rows.length > 0 ? "flex max-w-sm items-center gap-2" : "mx-auto mt-5 flex max-w-sm items-center gap-2"}>
          <select name="persona_id" className="ops-select flex-1 text-xs text-white">
            <option value="">General Placement CV</option>
            {personaRows.map((persona) => (
              <option key={persona.id} value={persona.id}>{persona.category_name}</option>
            ))}
          </select>
          <button className="ops-button-primary text-xs shrink-0">
            + {rows.length > 0 ? "New CV Version" : "Create Pre-filled CV"}
          </button>
        </form>
      </div>
    </div>
  );
}
