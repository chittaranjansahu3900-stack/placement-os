import { notFound } from "next/navigation";
import Link from "next/link";
import { ResumeExportButtons } from "@/components/resume-export-buttons";
import { ResumePreview } from "@/components/resume-preview";
import { normalizeCvContent } from "@/lib/resume";
import { createClient } from "@/lib/supabase/server";
import { OpsIcon } from "@/components/ops-icon";
import type { CvDocument } from "@/types/domain";

type SharedCv = CvDocument & {
  students: { name: string; roll_no: string } | null;
  company_type_personas: { category_name: string } | null;
};

export default async function CvViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase
    .from("cv_documents")
    .select("*, students!cv_documents_student_id_fkey(name, roll_no), company_type_personas(category_name)")
    .eq("id", id)
    .single();
  if (!data) notFound();

  const document = data as unknown as SharedCv;
  const content = normalizeCvContent(document.content);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800/80 pb-5 print:hidden">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <Link href="/resume" className="hover:text-white flex items-center gap-1 transition-colors">
              <OpsIcon name="file-text" size={13} />
              <span>Resume Studio</span>
            </Link>
            <span>/</span>
            <span className="text-slate-200">Verified CV Preview</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white flex items-center gap-3">
            <span>{document.students?.name ?? content.personalInfo.name}</span>
            <span className="rounded bg-slate-800 px-2.5 py-0.5 font-mono text-xs font-semibold text-amber-300 border border-slate-700">
              {document.students?.roll_no}
            </span>
          </h1>
          <p className="mt-1 font-mono text-xs text-slate-400">
            Persona: <strong className="text-slate-200 font-medium">{document.company_type_personas?.category_name ?? "General Placement"}</strong> · Version {document.version_no}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ResumeExportButtons
            fileName={content.personalInfo.name || content.title}
            content={content}
            templateId={document.template_id}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-750 bg-[#090d16] p-6 shadow-xl">
        <ResumePreview content={content} templateId={document.template_id} />
      </div>
    </div>
  );
}
