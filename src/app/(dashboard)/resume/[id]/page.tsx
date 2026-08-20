import { notFound } from "next/navigation";
import { ResumeExportButtons } from "@/components/resume-export-buttons";
import { ResumePreview } from "@/components/resume-preview";
import { normalizeCvContent } from "@/lib/resume";
import { createClient } from "@/lib/supabase/server";
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
    .select("*, students(name, roll_no), company_type_personas(category_name)")
    .eq("id", id)
    .single();
  if (!data) notFound();

  const document = data as unknown as SharedCv;
  const content = normalizeCvContent(document.content);
  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-lg font-semibold text-white">{document.students?.name ?? content.personalInfo.name}</h1>
          <p className="text-sm text-neutral-500">{document.students?.roll_no} · {document.company_type_personas?.category_name ?? "General"} · Version {document.version_no}</p>
        </div>
        <ResumeExportButtons fileName={content.personalInfo.name || content.title} content={content} templateId={document.template_id} />
      </div>
      <ResumePreview content={content} templateId={document.template_id} />
    </div>
  );
}
