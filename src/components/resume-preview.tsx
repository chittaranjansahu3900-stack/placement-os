import type { CvContent } from "@/types/domain";
import { normalizeCvTemplateId, type CvTemplateId } from "@/lib/resume-templates";

export type ResumeFieldSection =
  | "personal" | "academics" | "experience" | "projects" | "positions"
  | "skills" | "certifications" | "awards" | "languages" | "hobbies"
  | "publications" | "activities" | "customSections";

export interface ResumeFieldSpec {
  section: ResumeFieldSection;
  field: string;
  entryId?: string;
}

// Shared with resume-editor.tsx's data-field attributes — keep in sync.
export function resumeFieldKey(spec: ResumeFieldSpec): string {
  if (spec.section === "personal" || !spec.entryId) return `${spec.section}:${spec.field}`;
  return `${spec.section}:${spec.entryId}:${spec.field}`;
}

const clickZoneClass =
  "cursor-pointer rounded outline-offset-2 transition-colors hover:bg-[rgba(99,102,241,0.06)] hover:outline hover:outline-[1.5px] hover:outline-dashed hover:outline-[rgba(99,102,241,0.4)]";

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

export function ResumePreview({
  content,
  templateId: suppliedTemplateId = "placement-cell-v2",
  onFieldClick,
}: {
  content: CvContent;
  templateId?: string;
  onFieldClick?: (spec: ResumeFieldSpec) => void;
}) {
  const { personalInfo } = content;
  const templateId = normalizeCvTemplateId(suppliedTemplateId);
  const compact = templateId === "compact-executive-v1";
  const modern = templateId === "modern-blue-v1";
  const hiddenSections = content.hiddenSections ?? [];

  function click(spec: ResumeFieldSpec) {
    return onFieldClick ? () => onFieldClick(spec) : undefined;
  }
  function zone(spec: ResumeFieldSpec) {
    return onFieldClick ? { onClick: click(spec), className: clickZoneClass } : {};
  }
  function hidden(key: string) {
    return hiddenSections.includes(key);
  }

  return (
    <article className={`resume-print-root mx-auto min-h-[1123px] w-full max-w-[794px] bg-white font-sans text-slate-800 shadow-2xl ${compact ? "px-9 py-8 text-[11px] leading-[1.35]" : "px-12 py-10 text-[12px] leading-[1.45]"}`}>
      <header className={modern ? "-mx-12 -mt-10 mb-5 bg-blue-950 px-12 py-8 text-left" : compact ? "border-b-2 border-slate-900 pb-3 text-left" : "text-center"}>
        <h1
          {...zone({ section: "personal", field: "name" })}
          className={`${zone({ section: "personal", field: "name" }).className ?? ""} ${compact ? "text-xl" : "text-2xl"} font-bold uppercase tracking-wide ${modern ? "text-white" : "text-slate-950"}`}
        >
          {personalInfo.name || "Your name"}
        </h1>
        {personalInfo.headline && (
          <p {...zone({ section: "personal", field: "headline" })} className={`mt-0.5 text-[11px] font-medium ${modern ? "text-blue-100" : "text-slate-600"} ${zone({ section: "personal", field: "headline" }).className ?? ""}`}>
            {personalInfo.headline}
          </p>
        )}
        <p className={`mt-1 flex flex-wrap justify-center gap-x-2 text-[11px] ${modern ? "text-blue-100" : "text-slate-600"} ${compact ? "justify-start" : ""}`}>
          {personalInfo.phone && <span {...zone({ section: "personal", field: "phone" })}>{personalInfo.phone}</span>}
          {personalInfo.email && <span {...zone({ section: "personal", field: "email" })}>{personalInfo.email}</span>}
          {personalInfo.linkedin && <span {...zone({ section: "personal", field: "linkedin" })}>{personalInfo.linkedin}</span>}
          {personalInfo.website && <span {...zone({ section: "personal", field: "website" })}>{personalInfo.website}</span>}
          {personalInfo.location && <span {...zone({ section: "personal", field: "location" })}>{personalInfo.location}</span>}
        </p>
        {personalInfo.summary && (
          <p {...zone({ section: "personal", field: "summary" })} className={`${zone({ section: "personal", field: "summary" }).className ?? ""} mt-3 text-left ${modern ? "text-blue-50" : "text-slate-700"}`}>
            {personalInfo.summary}
          </p>
        )}
      </header>

      {content.academics.length > 0 && !hidden("academics") && (
        <section data-resume-section="academics">
          <SectionTitle templateId={templateId}>Academic Performance Record</SectionTitle>
          <div className="space-y-1.5">
            {content.academics.map((row) => (
              <div key={row.id} className="grid grid-cols-[1fr_auto_auto] gap-4 border-b border-slate-200 pb-1">
                <p {...zone({ section: "academics", entryId: row.id, field: "institute" })}>
                  <strong>{row.institute}</strong>
                  {row.course ? ` — ${row.course}` : ""}
                </p>
                <span {...zone({ section: "academics", entryId: row.id, field: "year" })} className={`text-slate-500 ${zone({ section: "academics", entryId: row.id, field: "year" }).className ?? ""}`}>
                  {row.year}
                </span>
                <strong {...zone({ section: "academics", entryId: row.id, field: "result" })} className={`min-w-16 text-right ${zone({ section: "academics", entryId: row.id, field: "result" }).className ?? ""}`}>
                  {row.result}
                </strong>
              </div>
            ))}
          </div>
        </section>
      )}

      {content.experience.length > 0 && !hidden("experience") && (
        <section data-resume-section="experience">
          <SectionTitle templateId={templateId}>Internships / Work Experience</SectionTitle>
          {content.experience.map((row) => (
            <div key={row.id} className="mb-3 break-inside-avoid">
              <div className="flex justify-between gap-4">
                <p {...zone({ section: "experience", entryId: row.id, field: "company" })}>
                  <strong>{row.company}</strong>{row.role ? ` — ${row.role}` : ""}
                </p>
                <span {...zone({ section: "experience", entryId: row.id, field: "period" })} className={`shrink-0 text-slate-500 ${zone({ section: "experience", entryId: row.id, field: "period" }).className ?? ""}`}>
                  {row.period}
                </span>
              </div>
              <ul {...zone({ section: "experience", entryId: row.id, field: "bullets" })} className={`mt-1 list-disc space-y-0.5 pl-5 ${zone({ section: "experience", entryId: row.id, field: "bullets" }).className ?? ""}`}>
                {row.bullets.filter((bullet) => bullet.text).map((bullet) => (
                  <li key={bullet.id} data-bullet-id={bullet.id}>{bullet.text}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {content.positions.length > 0 && !hidden("positions") && (
        <section data-resume-section="positions">
          <SectionTitle templateId={templateId}>Positions of Responsibility</SectionTitle>
          {content.positions.map((row) => (
            <div key={row.id} className="mb-3 break-inside-avoid">
              <div className="flex justify-between gap-4">
                <p {...zone({ section: "positions", entryId: row.id, field: "company" })}>
                  <strong>{row.role}</strong>{row.company ? ` — ${row.company}` : ""}
                </p>
                <span {...zone({ section: "positions", entryId: row.id, field: "period" })} className={`shrink-0 text-slate-500 ${zone({ section: "positions", entryId: row.id, field: "period" }).className ?? ""}`}>
                  {row.period}
                </span>
              </div>
              <ul {...zone({ section: "positions", entryId: row.id, field: "bullets" })} className={`mt-1 list-disc space-y-0.5 pl-5 ${zone({ section: "positions", entryId: row.id, field: "bullets" }).className ?? ""}`}>
                {row.bullets.filter((bullet) => bullet.text).map((bullet) => (
                  <li key={bullet.id} data-bullet-id={bullet.id}>{bullet.text}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {content.projects.length > 0 && !hidden("projects") && (
        <section data-resume-section="projects">
          <SectionTitle templateId={templateId}>Projects</SectionTitle>
          {content.projects.map((row) => (
            <div key={row.id} className="mb-3 break-inside-avoid">
              <div className="flex justify-between gap-4">
                <p {...zone({ section: "projects", entryId: row.id, field: "name" })}>
                  <strong>{row.name}</strong>{row.role ? ` — ${row.role}` : ""}
                </p>
                <span {...zone({ section: "projects", entryId: row.id, field: "period" })} className={`shrink-0 text-slate-500 ${zone({ section: "projects", entryId: row.id, field: "period" }).className ?? ""}`}>
                  {row.period}
                </span>
              </div>
              {row.link && <p className="text-[10px] text-slate-500">{row.link}</p>}
              <ul {...zone({ section: "projects", entryId: row.id, field: "bullets" })} className={`mt-1 list-disc space-y-0.5 pl-5 ${zone({ section: "projects", entryId: row.id, field: "bullets" }).className ?? ""}`}>
                {row.bullets.filter((bullet) => bullet.text).map((bullet) => (
                  <li key={bullet.id} data-bullet-id={bullet.id}>{bullet.text}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {content.skills.length > 0 && !hidden("skills") && (
        <section data-resume-section="skills" {...zone({ section: "skills", field: "skills" })}>
          <SectionTitle templateId={templateId}>Skills</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {content.skills.map((item, index) => (
              <span key={`${item}-${index}`} className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-700">
                {item}
              </span>
            ))}
          </div>
        </section>
      )}

      {content.languages.length > 0 && !hidden("languages") && (
        <section data-resume-section="languages" {...zone({ section: "languages", field: "languages" })}>
          <SectionTitle templateId={templateId}>Languages</SectionTitle>
          <p>{content.languages.map((row) => `${row.name}${row.level ? ` (${row.level})` : ""}`).join("  •  ")}</p>
        </section>
      )}

      {content.certifications.length > 0 && !hidden("certifications") && (
        <section data-resume-section="certifications" {...zone({ section: "certifications", field: "certifications" })}>
          <SectionTitle templateId={templateId}>Certifications</SectionTitle>
          <ul className="list-disc pl-5">
            {content.certifications.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ul>
        </section>
      )}

      {content.awards.length > 0 && !hidden("awards") && (
        <section data-resume-section="awards" {...zone({ section: "awards", field: "awards" })}>
          <SectionTitle templateId={templateId}>Awards &amp; Achievements</SectionTitle>
          <ul className="list-disc pl-5">
            {content.awards.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ul>
        </section>
      )}

      {content.activities.length > 0 && !hidden("activities") && (
        <section data-resume-section="activities" {...zone({ section: "activities", field: "activities" })}>
          <SectionTitle templateId={templateId}>Extracurricular Activities</SectionTitle>
          <ul className="list-disc pl-5">
            {content.activities.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
          </ul>
        </section>
      )}

      {content.publications.length > 0 && !hidden("publications") && (
        <section data-resume-section="publications">
          <SectionTitle templateId={templateId}>Publications</SectionTitle>
          {content.publications.map((row) => (
            <div key={row.id} {...zone({ section: "publications", entryId: row.id, field: "title" })} className={`mb-1 ${zone({ section: "publications", entryId: row.id, field: "title" }).className ?? ""}`}>
              <strong>{row.title}</strong>
              {row.publisher ? ` — ${row.publisher}` : ""}
              {row.date ? ` (${row.date})` : ""}
            </div>
          ))}
        </section>
      )}

      {content.hobbies.length > 0 && !hidden("hobbies") && (
        <section data-resume-section="hobbies" {...zone({ section: "hobbies", field: "hobbies" })}>
          <SectionTitle templateId={templateId}>Hobbies &amp; Interests</SectionTitle>
          <p>{content.hobbies.join("  •  ")}</p>
        </section>
      )}

      {content.customSections.length > 0 && content.customSections.map((section) => (
        !hidden(`custom:${section.id}`) && section.items.some((item) => item.text) && (
          <section key={section.id} data-resume-section={`custom:${section.id}`}>
            <SectionTitle templateId={templateId}>{section.title || "Additional Information"}</SectionTitle>
            <ul {...zone({ section: "customSections", entryId: section.id, field: "items" })} className={`list-disc pl-5 ${zone({ section: "customSections", entryId: section.id, field: "items" }).className ?? ""}`}>
              {section.items.filter((item) => item.text).map((item) => <li key={item.id}>{item.text}</li>)}
            </ul>
          </section>
        )
      ))}
    </article>
  );
}
