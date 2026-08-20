import type { CvContent } from "@/types/domain";
import { normalizeCvTemplateId, type CvTemplateId } from "@/lib/resume-templates";

function SectionTitle({ children, templateId }: { children: React.ReactNode; templateId: CvTemplateId }) {
  const className = templateId === "modern-blue-v1"
    ? "mb-2 mt-5 border-b border-blue-300 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-800"
    : templateId === "compact-executive-v1"
      ? "mb-1.5 mt-3 border-b border-slate-400 pb-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-900"
      : "mb-2 mt-5 border-b-2 border-slate-800 pb-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-900";
  return (
    <h2 className={className}>
      {children}
    </h2>
  );
}

export function ResumePreview({ content, templateId: suppliedTemplateId = "placement-cell-v2" }: { content: CvContent; templateId?: string }) {
  const { personalInfo } = content;
  const templateId = normalizeCvTemplateId(suppliedTemplateId);
  const compact = templateId === "compact-executive-v1";
  const modern = templateId === "modern-blue-v1";
  return (
    <article className={`resume-print-root mx-auto min-h-[1123px] w-full max-w-[794px] bg-white font-sans text-slate-800 shadow-2xl ${compact ? "px-9 py-8 text-[11px] leading-[1.35]" : "px-12 py-10 text-[12px] leading-[1.45]"}`}>
      <header className={modern ? "-mx-12 -mt-10 mb-5 bg-blue-950 px-12 py-8 text-left" : compact ? "border-b-2 border-slate-900 pb-3 text-left" : "text-center"}>
        <h1 className={`${compact ? "text-xl" : "text-2xl"} font-bold uppercase tracking-wide ${modern ? "text-white" : "text-slate-950"}`}>
          {personalInfo.name || "Your name"}
        </h1>
        <p className={`mt-1 text-[11px] ${modern ? "text-blue-100" : "text-slate-600"}`}>
          {[personalInfo.phone, personalInfo.email, personalInfo.linkedin, personalInfo.location]
            .filter(Boolean)
            .join("  |  ")}
        </p>
        {personalInfo.summary && <p className={`mt-3 text-left ${modern ? "text-blue-50" : "text-slate-700"}`}>{personalInfo.summary}</p>}
      </header>

      {content.academics.length > 0 && (
        <section data-resume-section="academics">
          <SectionTitle templateId={templateId}>Academic Performance Record</SectionTitle>
          <div className="space-y-1.5">
            {content.academics.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-slate-200 pb-1">
                <p>
                  <strong>{row.institute}</strong>
                  {row.course ? ` — ${row.course}` : ""}
                </p>
                <span className="text-slate-500">{row.year}</span>
                <strong className="min-w-16 text-right">{row.result}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      {content.projects.length > 0 && (
        <section data-resume-section="projects">
          <SectionTitle templateId={templateId}>Projects</SectionTitle>
          {content.projects.map((row) => (
            <div key={row.id} className="mb-3 break-inside-avoid">
              <div className="flex justify-between gap-4">
                <p><strong>{row.name}</strong>{row.role ? ` — ${row.role}` : ""}</p>
                <span className="shrink-0 text-slate-500">{row.period}</span>
              </div>
              {row.link && <p className="text-[10px] text-slate-500">{row.link}</p>}
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {row.bullets.filter((bullet) => bullet.text).map((bullet) => (
                  <li key={bullet.id} data-bullet-id={bullet.id}>{bullet.text}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {content.positions.length > 0 && (
        <section data-resume-section="positions">
          <SectionTitle templateId={templateId}>Positions of Responsibility</SectionTitle>
          {content.positions.map((row) => (
            <div key={row.id} className="mb-3 break-inside-avoid">
              <div className="flex justify-between gap-4">
                <p><strong>{row.role}</strong>{row.company ? ` — ${row.company}` : ""}</p>
                <span className="shrink-0 text-slate-500">{row.period}</span>
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {row.bullets.filter((bullet) => bullet.text).map((bullet) => (
                  <li key={bullet.id} data-bullet-id={bullet.id}>{bullet.text}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {content.experience.length > 0 && (
        <section data-resume-section="experience">
          <SectionTitle templateId={templateId}>Internships / Work Experience</SectionTitle>
          {content.experience.map((row) => (
            <div key={row.id} className="mb-3 break-inside-avoid">
              <div className="flex justify-between gap-4">
                <p><strong>{row.company}</strong>{row.role ? ` — ${row.role}` : ""}</p>
                <span className="shrink-0 text-slate-500">{row.period}</span>
              </div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {row.bullets.filter((bullet) => bullet.text).map((bullet) => (
                  <li key={bullet.id} data-bullet-id={bullet.id}>{bullet.text}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {content.skills.length > 0 && (
        <section data-resume-section="skills">
          <SectionTitle templateId={templateId}>Skills</SectionTitle>
          <p>{content.skills.join("  •  ")}</p>
        </section>
      )}

      {content.certifications.length > 0 && (
        <section data-resume-section="certifications">
          <SectionTitle templateId={templateId}>Certifications</SectionTitle>
          <ul className="list-disc pl-5">
            {content.certifications.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ul>
        </section>
      )}

      {content.awards.length > 0 && (
        <section data-resume-section="awards">
          <SectionTitle templateId={templateId}>Awards &amp; Achievements</SectionTitle>
          <ul className="list-disc pl-5">
            {content.awards.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ul>
        </section>
      )}
    </article>
  );
}
